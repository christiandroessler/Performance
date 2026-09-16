// Verifiziert eine eingehende Anfrage: gueltiges Google-ID-Token im
// Authorization-Header UND ein Allowlist-Eintrag (FA-AUTH-01). Zustandslos -
// siehe googleAuth.js fuer die Begruendung.

import { verifyGoogleIdToken, AuthError } from './googleAuth.js';
import { getAllowlistEntry, putAllowlistEntry } from './kvStore.js';
import { HttpError } from './http.js';

/**
 * @returns {Promise<{ email: string, role: 'admin'|'member', status: string }>}
 * @throws {HttpError} 401 bei fehlendem/ungueltigem Token, 403 wenn nicht auf der Allowlist (FA-AUTH-01: neutrale Ablehnung)
 */
export async function requireSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!idToken) throw new HttpError(401, 'Kein Authorization-Header');

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  } catch (err) {
    if (err instanceof AuthError) throw new HttpError(401, err.message);
    throw err;
  }

  const email = identity.email.toLowerCase();
  let entry = await getAllowlistEntry(env.ALLOWLIST_KV, email);

  // Kap. 4/M2: "Allowlist mit Admin als erstem Eintrag" - der in ADMIN_EMAIL
  // konfigurierte Account bootstrapt sich selbst beim ersten Login.
  if (!entry && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase()) {
    entry = { email, role: 'admin', status: 'google_connected', invitedAt: new Date().toISOString(), connectedAt: new Date().toISOString() };
    await putAllowlistEntry(env.ALLOWLIST_KV, entry);
  }

  if (!entry) throw new HttpError(403, 'not_on_allowlist');

  return { email, role: entry.role, status: entry.status, name: identity.name };
}

export function requireAdmin(session) {
  if (session.role !== 'admin') throw new HttpError(403, 'admin_only');
}
