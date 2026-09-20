// Google Sign-In (ID-Token fuer die Worker-Identitaetspruefung) und ein
// getrenntes OAuth2-Access-Token fuer den Drive-Zugriff (Scope
// drive.appdata). Beides laeuft ueber Google Identity Services rein im
// Browser - der Worker sieht nur das ID-Token, nie ein Drive- oder gar ein
// Strava-Token (FA-AUTH-04, Kap. 5.1 Komponententabelle).

import { getPublicConfig } from './config.js';

let currentIdToken = null;
let idTokenPayload = null;
let tokenClient = null;
let driveAccessToken = null;
let driveAccessTokenExpiry = 0;

function waitForGis() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) return resolve();
    const check = setInterval(() => {
      if (window.google && window.google.accounts) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
}

/** Rendert den Google-Sign-In-Button in `container` (DOM-Element) und loest bei Erfolg mit dem ID-Token auf. */
export async function signInWithGoogle(container) {
  await waitForGis();
  const { googleClientId } = await getPublicConfig();

  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        try {
          setIdToken(response.credential);
          resolve(currentIdToken);
        } catch (err) {
          reject(err);
        }
      },
    });
    window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with' });
  });
}

/**
 * "Angemeldet bleiben": versucht beim App-Start ein frisches ID-Token OHNE Klick zu bekommen
 * (Google One Tap/FedCM, funktioniert nur wenn der Browser noch bei Google angemeldet ist und
 * `disableAutoSelect()` seit dem letzten Login nicht aufgerufen wurde, siehe signOut() unten).
 * Liefert das Token bei Erfolg, sonst `null` - NIE einen Fehler/Hang, damit main.js in jedem
 * Fall (kein Google-Cookie, Tracking-Schutz blockiert den stillen Callback fuer immer wie bei
 * requestDriveAccess() oben beobachtet, Nutzer hat frueher abgelehnt) einfach auf den sichtbaren
 * Sign-in-Button zurueckfallen kann.
 */
export async function trySilentSignIn() {
  await waitForGis();
  const { googleClientId } = await getPublicConfig();

  const attempt = () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (token) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: true,
        callback: (response) => {
          try {
            setIdToken(response.credential);
            finish(currentIdToken);
          } catch {
            finish(null);
          }
        },
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
          finish(null);
        }
      });
    });

  try {
    return await withTimeout(attempt(), 5000, 'stille Google-Wiederanmeldung');
  } catch {
    return null;
  }
}

function setIdToken(idToken) {
  currentIdToken = idToken;
  idTokenPayload = decodeJwtPayload(idToken);
}

export function getIdToken() {
  return currentIdToken;
}

export function getSignedInEmail() {
  return idTokenPayload ? idTokenPayload.email : null;
}

function decodeJwtPayload(jwt) {
  const payloadB64 = jwt.split('.')[1];
  const json = decodeURIComponent(
    atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
  return JSON.parse(json);
}

/**
 * Absicherung: `hint` (siehe unten) garantiert bei Google NICHT zuverlaessig, dass die STILLE
 * Token-Erneuerung (`prompt:''`) tatsaechlich fuer das angeforderte Konto ausgestellt wird, wenn
 * im selben Browser mehrere Google-Sitzungen aktiv sind - genau das wurde live beobachtet (Kopf-
 * zeile zeigte korrekt Konto B, Drive-Zugriff kam trotz `hint` weiterhin von Konto A). Statt dem
 * `hint` blind zu vertrauen, wird das tatsaechlich erhaltene Token aktiv gegen `sub` (Googles
 * stabile Konto-ID, aus dem ID-Token) geprueft, BEVOR es irgendwo verwendet wird. Bei Abweichung
 * wird NICHT stillschweigend weitergemacht (das waere exakt der Fehler von vorher), sondern ein
 * Fehler geworfen - der Aufrufer unten faellt dann auf den SICHTBAREN Consent-Dialog zurueck
 * (der Nutzer bestaetigt das Konto dort explizit selbst), statt Trainingsdaten eines falschen
 * Kontos zu laden.
 */
async function verifyDriveTokenAccount(accessToken, expectedSub) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error('Drive-Zugriffstoken konnte nicht geprueft werden.');
  const info = await res.json();
  if (info.sub !== expectedSub) {
    throw new Error('Drive-Zugriff wurde fuer ein anderes Google-Konto erteilt als angemeldet - abgebrochen, um keine falschen Daten zu laden.');
  }
}

/**
 * FA-AUTH-02 Schritt 3: expliziter Drive-Zugriff (Scope drive.appdata), zeitlich getrennt von
 * der Anmeldung (Schritt 1). Die Google-Sign-In-Identitaet (ID-Token, Schritt 1) und dieser
 * Drive-OAuth-Grant sind ZWEI unabhaengige Google-Ablaeufe - `hint` bindet den Drive-Grant an
 * dieselbe E-Mail wie der ID-Token, `verifyDriveTokenAccount` oben prueft das Ergebnis zusaetzlich
 * aktiv nach (siehe deren Kommentar).
 */
export async function requestDriveAccess() {
  await waitForGis();
  const { googleClientId } = await getPublicConfig();
  const hint = getSignedInEmail() || undefined;
  const expectedSub = idTokenPayload && idTokenPayload.sub;

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      hint,
      callback: () => {}, // wird pro Aufruf unten ueberschrieben
    });
  }

  const tryWithPrompt = (prompt) =>
    new Promise((resolve, reject) => {
      tokenClient.callback = async (response) => {
        if (response.error) return reject(new Error(response.error));
        try {
          if (expectedSub) await verifyDriveTokenAccount(response.access_token, expectedSub);
        } catch (err) {
          reject(err);
          return;
        }
        driveAccessToken = response.access_token;
        driveAccessTokenExpiry = Date.now() + (response.expires_in || 3600) * 1000 - 60_000;
        resolve(driveAccessToken);
      };
      tokenClient.requestAccessToken({ prompt, hint });
    });

  // Erst still versuchen (funktioniert oft nach einem Seiten-Neuladen, z. B.
  // nach dem Strava-Redirect, wenn der Nutzer kurz zuvor schon zugestimmt hat)
  // - erst bei Fehlschlag/Zeitlimit den sichtbaren Consent-Dialog zeigen.
  //
  // Beobachtet: Browser-Tracking-Schutz kann die stille Erneuerung blockieren (Cookie-Zugriff
  // auf accounts.google.com verweigert) - dann feuert der Callback NIE, ohne jeden Fehler, und
  // jede Drive-Anfrage haengt fuer immer (sichtbar dadurch, dass ganze Teile der Oberflaeche
  // nie rendern, ohne Fehlermeldung). Nur der STILLE Versuch bekommt daher ein Zeitlimit - der
  // sichtbare Consent-Dialog braucht bewusst kein Limit, da der Nutzer dort selbst reagieren muss.
  try {
    return await withTimeout(tryWithPrompt(''), 8000, 'stille Google-Token-Erneuerung');
  } catch {
    return tryWithPrompt('consent');
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: Zeitlimit (${ms / 1000}s) ueberschritten`)), ms))]);
}

/** Liefert ein gueltiges Drive-Access-Token, erneuert es bei Bedarf still (ohne erneuten Consent-Dialog). */
export async function getDriveAccessToken() {
  if (driveAccessToken && Date.now() < driveAccessTokenExpiry) return driveAccessToken;
  return requestDriveAccess();
}

export function signOut() {
  currentIdToken = null;
  idTokenPayload = null;
  driveAccessToken = null;
  driveAccessTokenExpiry = 0;
  if (window.google && window.google.accounts) {
    window.google.accounts.id.disableAutoSelect();
  }
}
