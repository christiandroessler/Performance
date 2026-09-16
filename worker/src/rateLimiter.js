// App-weite Drosselung fuer Strava-Aufrufe (FA-SYNC-04, Kap. 3.2 "Ratelimit
// gilt fuer die gesamte App"). Strava liefert den aktuellen Verbrauch in
// Antwort-Headern mit (X-RateLimit-Limit / X-RateLimit-Usage, Format
// "15-Minuten-Fenster,Tag"). Der zuletzt bekannte Stand wird in KV gehalten,
// damit alle Worker-Instanzen und alle Nutzer denselben (einzigen) Kontostand
// sehen. Reine Funktionen, kein KV-Zugriff hier (siehe kvStore.js).

const SAFETY_MARGIN = 0.9; // bleibt unter dem tatsaechlichen Limit als Puffer fuer parallele Anfragen
const STALE_AFTER_MS = 15 * 60 * 1000; // ein 15-Minuten-Fenster: aelterer Stand gilt als ueberholt

/** @param {Headers} headers - Antwort-Header eines Strava-API-Aufrufs */
export function parseStravaRateLimitHeaders(headers) {
  const limit = headers.get('X-RateLimit-Limit');
  const usage = headers.get('X-RateLimit-Usage');
  if (!limit || !usage) return null;
  const [limit15min, limitDaily] = limit.split(',').map(Number);
  const [usage15min, usageDaily] = usage.split(',').map(Number);
  if ([limit15min, limitDaily, usage15min, usageDaily].some(Number.isNaN)) return null;
  return { limit15min, limitDaily, usage15min, usageDaily, updatedAt: Date.now() };
}

/** true, wenn nach aktuellem Kenntnisstand noch Kontingent fuer einen weiteren Aufruf da ist. */
export function hasQuota(state, now = Date.now()) {
  if (!state) return true; // noch kein bekannter Stand -> ersten Aufruf zulassen, Header danach auswerten
  if (now - state.updatedAt > STALE_AFTER_MS) return true; // Stand koennte aus einem laengst abgelaufenen Fenster stammen
  const underShortTerm = state.usage15min < state.limit15min * SAFETY_MARGIN;
  const underDaily = state.usageDaily < state.limitDaily * SAFETY_MARGIN;
  return underShortTerm && underDaily;
}

/** true, wenn das TAGES-Kontingent (nicht nur das 15-Minuten-Fenster) ausgeschoepft ist -
 * dann lohnt sich Warten erst am naechsten Tag (FA-SYNC-02: "mehrtaegig bei erschoepftem Kontingent"). */
export function isDailyQuotaExhausted(state, now = Date.now()) {
  if (!state) return false;
  if (now - state.updatedAt > STALE_AFTER_MS) return false;
  return state.usageDaily >= state.limitDaily * SAFETY_MARGIN;
}

/** Sekunden bis zum naechsten 15-Minuten-Fenster (UTC-Ausrichtung, wie Strava). */
export function secondsUntilNextWindow(now = new Date()) {
  const minutesIntoWindow = now.getUTCMinutes() % 15;
  const secondsIntoWindow = minutesIntoWindow * 60 + now.getUTCSeconds();
  return 15 * 60 - secondsIntoWindow;
}

/** Sekunden bis Tagesbeginn UTC (Strava's Tageskontingent-Reset, siehe Strava-API-Doku). */
export function secondsUntilNextDay(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}
