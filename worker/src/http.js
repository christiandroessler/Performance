// Kleine HTTP-Hilfsfunktionen: JSON-Antworten, CORS (nur die eine bekannte
// Frontend-Origin, Kap. 5.1 Komponententabelle: Frontend <-> Worker).

export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data, init, env) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(env ? corsHeaders(env) : {}), ...(init && init.headers) },
  });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
