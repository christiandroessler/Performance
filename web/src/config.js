// Zur Laufzeit vom Worker geladene, oeffentliche Konfiguration (Client-ID
// etc.). Der Worker-Basis-URL ist die einzige Stelle, die je nach Umgebung
// (lokal/Preview/Produktion) angepasst werden muss.
export const WORKER_ORIGIN = window.__WORKER_ORIGIN__ || 'http://127.0.0.1:8787';

let cachedConfig = null;

export async function getPublicConfig() {
  if (cachedConfig) return cachedConfig;
  const res = await fetch(`${WORKER_ORIGIN}/api/config`);
  if (!res.ok) throw new Error(`Konfiguration konnte nicht geladen werden: ${res.status}`);
  cachedConfig = await res.json();
  return cachedConfig;
}
