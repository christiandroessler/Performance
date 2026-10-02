// Strikte E-Mail-Pruefung fuer Einladungen (docs/MODULE.md P-12). Vorher nur `includes('@')` - so
// konnte ein String wie `<img src=x onerror=...>@x` in die Allowlist gelangen. Bewusst enger als
// RFC 5322: Google-Konten kennen nur Buchstaben, Ziffern und Punkte (Workspace-Aliase evtl. + _ - %);
// Zeichen wie < > " ' & Leerzeichen werden nie akzeptiert. Die Adresse muss bereits kleingeschrieben
// und getrimmt sein (handleInvite normalisiert vorher).

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * @param {unknown} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}
