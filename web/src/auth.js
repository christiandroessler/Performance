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

/** FA-AUTH-02 Schritt 3: expliziter Drive-Zugriff (Scope drive.appdata), zeitlich getrennt von der Anmeldung (Schritt 1). */
export async function requestDriveAccess() {
  await waitForGis();
  const { googleClientId } = await getPublicConfig();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: () => {}, // wird pro Aufruf unten ueberschrieben
    });
  }

  const tryWithPrompt = (prompt) =>
    new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) return reject(new Error(response.error));
        driveAccessToken = response.access_token;
        driveAccessTokenExpiry = Date.now() + (response.expires_in || 3600) * 1000 - 60_000;
        resolve(driveAccessToken);
      };
      tokenClient.requestAccessToken({ prompt });
    });

  // Erst still versuchen (funktioniert oft nach einem Seiten-Neuladen, z. B.
  // nach dem Strava-Redirect, wenn der Nutzer kurz zuvor schon zugestimmt hat)
  // - erst bei Fehlschlag den sichtbaren Consent-Dialog zeigen.
  try {
    return await tryWithPrompt('');
  } catch {
    return tryWithPrompt('consent');
  }
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
