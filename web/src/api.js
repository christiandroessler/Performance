// Duenner Client fuer die Worker-API. Sendet bei jeder Anfrage das aktuelle
// Google-ID-Token im Authorization-Header (siehe auth.js/session.js im
// Worker) - der Browser haelt selbst nie ein Strava-Token (FA-AUTH-04).

import { WORKER_ORIGIN } from './config.js';
import { getIdToken } from './auth.js';

async function workerFetch(path, init = {}) {
  const idToken = getIdToken();
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${idToken}` };
  if (init.body) headers['Content-Type'] = 'application/json';
  return fetch(`${WORKER_ORIGIN}${path}`, { ...init, headers });
}

async function workerError(res) {
  const body = await res.json().catch(() => ({}));
  const err = new Error(body.error || `Worker-Fehler ${res.status}`);
  err.status = res.status;
  return err;
}

export async function fetchSession() {
  const res = await workerFetch('/api/session', { method: 'POST' });
  if (!res.ok) throw await workerError(res);
  return (await res.json()).session;
}

/** FA-AUTH-03/04: Strava-OAuth wird ausschliesslich ueber den Worker gestartet. */
export async function startStravaConnect() {
  const res = await workerFetch('/auth/strava/start', { method: 'POST' });
  if (!res.ok) throw await workerError(res);
  const { authorizeUrl } = await res.json();
  window.location.href = authorizeUrl;
}

/** beforeEpochSeconds: FA-SYNC (Historie nachladen) - Aktivitaeten VOR der bisher aeltesten bekannten. */
export async function fetchActivities(afterEpochSeconds, page = 1, beforeEpochSeconds) {
  const params = new URLSearchParams({ page: String(page) });
  if (afterEpochSeconds) params.set('after', String(afterEpochSeconds));
  if (beforeEpochSeconds) params.set('before', String(beforeEpochSeconds));
  const res = await workerFetch(`/api/strava/activities?${params}`);
  if (res.status === 429) return { rateLimited: true, ...(await res.json()) };
  if (!res.ok) throw await workerError(res);
  return { activities: (await res.json()).activities };
}

export async function fetchStreams(activityId) {
  const res = await workerFetch(`/api/strava/activities/${activityId}/streams`);
  if (res.status === 429) return { rateLimited: true, ...(await res.json()) };
  if (!res.ok) throw await workerError(res);
  return { streams: (await res.json()).streams };
}

/** FA-SYNC-03: Fortschrittsanzeige, auch nach Schliessen/erneutem Oeffnen des Browsers. */
export async function getSyncProgress() {
  const res = await workerFetch('/api/sync/progress');
  if (!res.ok) throw await workerError(res);
  return (await res.json()).progress;
}

export async function putSyncProgress(progress) {
  const res = await workerFetch('/api/sync/progress', { method: 'POST', body: JSON.stringify(progress) });
  if (!res.ok) throw await workerError(res);
}

export async function deleteMyAccount() {
  const res = await workerFetch('/api/me/delete', { method: 'POST' });
  if (!res.ok) throw await workerError(res);
}

export async function listMembers() {
  const res = await workerFetch('/api/admin/members');
  if (!res.ok) throw await workerError(res);
  return (await res.json()).members;
}

export async function inviteMember(email) {
  const res = await workerFetch('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email }) });
  if (!res.ok) throw await workerError(res);
  return (await res.json()).member;
}

export async function removeMember(email) {
  const res = await workerFetch(`/api/admin/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
  if (!res.ok) throw await workerError(res);
}
