// Cloudflare Worker: Google-Identitaetspruefung + Allowlist, Strava-OAuth
// (Client Secret bleibt hier), Proxy aller Strava-Aufrufe mit app-weiter
// Drosselung, Nutzerverwaltung. KEINE Modellberechnung (10-ms-CPU-Limit),
// KEINE Trainingsdaten (Kap. 5.1).

import { json, corsHeaders, HttpError } from './http.js';
import { requireSession, requireAdmin } from './session.js';
import {
  putOAuthState,
  consumeOAuthState,
  listAllowlist,
  countAllowlist,
  putAllowlistEntry,
  deleteAllowlistEntry,
  getAllowlistEntry,
  getRateLimitState,
  putRateLimitState,
  getImportProgress,
  putImportProgress,
  deleteImportProgress,
} from './kvStore.js';
import { importEncryptionKey } from './cryptoTokens.js';
import { buildAuthorizeUrl, exchangeCodeForTokens, revokeAccessToken, stravaApiFetch, StravaApiError } from './strava.js';
import { storeInitialTokens, getValidAccessToken, forgetTokens } from './tokenManager.js';
import { hasQuota, isDailyQuotaExhausted, parseStravaRateLimitHeaders, secondsUntilNextWindow, secondsUntilNextDay } from './rateLimiter.js';

const MAX_GROUP_SIZE = 10; // FA-USER-03

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    try {
      return await route(request, url, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, { status: err.status }, env);
      }
      if (err instanceof StravaApiError) {
        return json({ error: 'strava_api_error', detail: err.message }, { status: 502 }, env);
      }
      console.error('Unerwarteter Fehler:', err && err.stack ? err.stack : err);
      return json({ error: 'internal_error' }, { status: 500 }, env);
    }
  },
};

async function route(request, url, env, ctx) {
  const { pathname } = url;

  if (pathname === '/api/config' && request.method === 'GET') {
    return json({ googleClientId: env.GOOGLE_CLIENT_ID }, {}, env);
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    const session = await requireSession(request, env);
    return json({ session }, {}, env);
  }

  if (pathname === '/auth/strava/start' && request.method === 'POST') {
    return handleStravaStart(request, env);
  }

  if (pathname === '/auth/strava/callback' && request.method === 'GET') {
    return handleStravaCallback(url, env);
  }

  if (pathname === '/api/strava/activities' && request.method === 'GET') {
    return handleActivitiesProxy(request, url, env);
  }

  const streamMatch = pathname.match(/^\/api\/strava\/activities\/(\d+)\/streams$/);
  if (streamMatch && request.method === 'GET') {
    return handleStreamsProxy(request, url, env, streamMatch[1]);
  }

  if (pathname === '/api/sync/progress' && request.method === 'GET') {
    const session = await requireSession(request, env);
    const progress = await getImportProgress(env.ALLOWLIST_KV, session.email);
    return json({ progress }, {}, env);
  }
  if (pathname === '/api/sync/progress' && request.method === 'POST') {
    const session = await requireSession(request, env);
    const body = await request.json();
    await putImportProgress(env.ALLOWLIST_KV, session.email, body);
    return json({ ok: true }, {}, env);
  }

  if (pathname === '/api/admin/members' && request.method === 'GET') {
    const session = await requireSession(request, env);
    requireAdmin(session);
    const members = await listAllowlist(env.ALLOWLIST_KV);
    return json({ members }, {}, env); // FA-USER-04: keine Trainingsdaten enthalten
  }

  if (pathname === '/api/admin/invite' && request.method === 'POST') {
    return handleInvite(request, env);
  }

  const removeMatch = pathname.match(/^\/api\/admin\/members\/([^/]+)$/);
  if (removeMatch && request.method === 'DELETE') {
    return handleRemoveMember(request, env, decodeURIComponent(removeMatch[1]), false);
  }

  if (pathname === '/api/me/delete' && request.method === 'POST') {
    const session = await requireSession(request, env);
    return handleRemoveMember(request, env, session.email, true);
  }

  return json({ error: 'not_found' }, { status: 404 }, env);
}

async function handleStravaStart(request, env) {
  const session = await requireSession(request, env);
  const state = crypto.randomUUID();
  await putOAuthState(env.ALLOWLIST_KV, state, session.email);
  const redirectUri = new URL('/auth/strava/callback', env.WORKER_ORIGIN || new URL(request.url).origin).toString();
  const authorizeUrl = buildAuthorizeUrl(env, redirectUri, state);
  return json({ authorizeUrl }, {}, env);
}

async function handleStravaCallback(url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const redirectBase = env.FRONTEND_ORIGIN + '/'; // Single-Page-App ohne echte Routen - immer zurueck zur Startseite
  if (error) {
    return Response.redirect(`${redirectBase}?strava=error&reason=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${redirectBase}?strava=error&reason=missing_params`, 302);
  }

  const email = await consumeOAuthState(env.ALLOWLIST_KV, state);
  if (!email) {
    return Response.redirect(`${redirectBase}?strava=error&reason=invalid_state`, 302);
  }

  const entry = await getAllowlistEntry(env.ALLOWLIST_KV, email);
  if (!entry) {
    return Response.redirect(`${redirectBase}?strava=error&reason=not_on_allowlist`, 302);
  }

  const tokens = await exchangeCodeForTokens(env, code);
  const encryptionKey = await importEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  await storeInitialTokens(env.ALLOWLIST_KV, encryptionKey, email, tokens);

  entry.status = 'strava_connected';
  entry.connectedAt = new Date().toISOString();
  await putAllowlistEntry(env.ALLOWLIST_KV, entry);

  return Response.redirect(`${redirectBase}?strava=connected`, 302);
}

/** FA-SYNC-01/04: inkrementeller Sync, app-weite Drosselung vor jedem Aufruf pruefen. */
async function handleActivitiesProxy(request, url, env) {
  const session = await requireSession(request, env);
  const accessToken = await requireStravaConnection(env, session.email);

  const rateCheck = await checkRateLimit(env);
  if (rateCheck) return rateCheck;

  const after = url.searchParams.get('after');
  const page = url.searchParams.get('page') || '1';
  const perPage = url.searchParams.get('per_page') || '100';
  const params = new URLSearchParams({ page, per_page: perPage });
  if (after) params.set('after', after);

  const res = await stravaApiFetch(env, accessToken, `/athlete/activities?${params.toString()}`);
  await recordRateLimitFromResponse(env, res);

  if (!res.ok) return json({ error: 'strava_error', status: res.status }, { status: 502 }, env);
  const activities = await res.json();
  return json({ activities }, {}, env);
}

async function handleStreamsProxy(request, url, env, activityId) {
  const session = await requireSession(request, env);
  const accessToken = await requireStravaConnection(env, session.email);

  const rateCheck = await checkRateLimit(env);
  if (rateCheck) return rateCheck;

  const keys = url.searchParams.get('keys') || 'time,watts,heartrate,cadence,distance,velocity_smooth,altitude,moving';
  const res = await stravaApiFetch(env, accessToken, `/activities/${activityId}/streams?keys=${encodeURIComponent(keys)}&key_by_type=true`);
  await recordRateLimitFromResponse(env, res);

  if (!res.ok) return json({ error: 'strava_error', status: res.status }, { status: 502 }, env);
  const streams = await res.json();
  return json({ streams }, {}, env);
}

async function requireStravaConnection(env, email) {
  const encryptionKey = await importEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  const accessToken = await getValidAccessToken(env, env.ALLOWLIST_KV, encryptionKey, email);
  if (!accessToken) throw new HttpError(409, 'strava_not_connected');
  return accessToken;
}

async function checkRateLimit(env) {
  const state = await getRateLimitState(env.ALLOWLIST_KV);
  if (isDailyQuotaExhausted(state)) {
    return json(
      { error: 'daily_quota_exhausted', retryAfterSeconds: secondsUntilNextDay() },
      { status: 429, headers: { 'Retry-After': String(secondsUntilNextDay()) } },
      env
    );
  }
  if (!hasQuota(state)) {
    return json(
      { error: 'rate_limited', retryAfterSeconds: secondsUntilNextWindow() },
      { status: 429, headers: { 'Retry-After': String(secondsUntilNextWindow()) } },
      env
    );
  }
  return null;
}

async function recordRateLimitFromResponse(env, res) {
  const parsed = parseStravaRateLimitHeaders(res.headers);
  if (parsed) await putRateLimitState(env.ALLOWLIST_KV, parsed);
}

async function handleInvite(request, env) {
  const session = await requireSession(request, env);
  requireAdmin(session);
  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new HttpError(400, 'invalid_email');

  const existing = await getAllowlistEntry(env.ALLOWLIST_KV, email);
  if (existing) return json({ member: existing }, {}, env); // idempotent

  const count = await countAllowlist(env.ALLOWLIST_KV);
  if (count >= MAX_GROUP_SIZE) throw new HttpError(409, 'group_full'); // FA-USER-03

  const entry = { email, role: 'member', status: 'invited', invitedAt: new Date().toISOString(), connectedAt: null };
  await putAllowlistEntry(env.ALLOWLIST_KV, entry);
  return json({ member: entry }, {}, env);
}

/** FA-USER-05 (Admin entfernt Mitglied) und FA-USER-07 (Mitglied loescht eigene Daten) teilen sich die Widerruf-Logik. */
async function handleRemoveMember(request, env, targetEmail, isSelfService) {
  const session = await requireSession(request, env);
  if (!isSelfService) requireAdmin(session);
  if (isSelfService && session.email !== targetEmail.toLowerCase()) throw new HttpError(403, 'forbidden');

  const encryptionKey = await importEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  const accessToken = await getValidAccessToken(env, env.ALLOWLIST_KV, encryptionKey, targetEmail).catch(() => null);
  if (accessToken) await revokeAccessToken(env, accessToken).catch((err) => console.error('Strava-Widerruf fehlgeschlagen:', err));

  await forgetTokens(env.ALLOWLIST_KV, targetEmail);
  await deleteImportProgress(env.ALLOWLIST_KV, targetEmail);
  await deleteAllowlistEntry(env.ALLOWLIST_KV, targetEmail);

  return json({ ok: true }, {}, env);
}
