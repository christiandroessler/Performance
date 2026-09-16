// Strava-OAuth (Autorisierung, Token-Tausch, Refresh, Widerruf) und Proxy fuer
// Strava-API-Aufrufe. Laeuft vollstaendig im Worker (FA-AUTH-04): das Client
// Secret verlaesst den Worker nie, der Browser bekommt nie ein Strava-Token
// (Kap. 5.1, "Zu F3"). Tokens werden ausschliesslich im Header gesendet, nie
// in der URL (Kap. 3.2). Basis-URLs sind ueber env konfigurierbar (Kap. 3.2:
// neue Basis-URL https://www.api-v3.strava.com ab 01.06.2027 absehbar).

/** FA-AUTH-05: nur Lesen der Aktivitaeten, inkl. privater Aktivitaeten des Nutzers. */
const SCOPE = 'activity:read_all';

export function buildAuthorizeUrl(env, redirectUri, state) {
  const url = new URL(`${authBase(env)}/oauth/authorize`);
  url.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('approval_prompt', 'auto');
  return url.toString();
}

export async function exchangeCodeForTokens(env, code, fetchImpl = fetch) {
  return tokenRequest(env, { code, grant_type: 'authorization_code' }, fetchImpl);
}

/** @returns {Promise<{access_token:string, refresh_token:string, expires_at:number}>} */
export async function refreshAccessToken(env, refreshToken, fetchImpl = fetch) {
  return tokenRequest(env, { refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl);
}

async function tokenRequest(env, params, fetchImpl) {
  const res = await fetchImpl(`${authBase(env)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new StravaApiError(`Strava-Token-Anfrage fehlgeschlagen (${res.status}): ${text}`, res.status);
  }
  return res.json();
}

/** oauth/revoke ist ab 01.06.2027 der Nachfolger von oauth/deauthorize (Kap. 3.2) - beide nehmen den Access Token im Header entgegen. */
export async function revokeAccessToken(env, accessToken, fetchImpl = fetch) {
  const endpoint = env.STRAVA_USE_REVOKE_ENDPOINT === 'true' ? 'oauth/revoke' : 'oauth/deauthorize';
  await fetchImpl(`${authBase(env)}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Reiner Durchreich-Proxy mit Token im Header (Kap. 3.2: "Tokens werden nur im Header gesendet"). */
export async function stravaApiFetch(env, accessToken, path, init = {}, fetchImpl = fetch) {
  return fetchImpl(`${apiBase(env)}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
}

export class StravaApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function authBase(env) {
  return env.STRAVA_AUTH_BASE_URL || 'https://www.strava.com';
}
function apiBase(env) {
  return env.STRAVA_API_BASE_URL || 'https://www.strava.com/api/v3';
}
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
