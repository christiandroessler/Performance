// Minimale In-Memory-Nachbildung der Cloudflare-KV-Schnittstelle fuer Tests
// (get/put/delete/list mit prefix+cursor, optionales expirationTtl).

export class FakeKv {
  constructor() {
    this.store = new Map(); // key -> { value, expiresAt: number|null }
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key, value, options = {}) {
    const expiresAt = options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = '', cursor } = {}) {
    const allKeys = [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const pageSize = 2; // klein halten, um Paginierung/cursor-Logik im Test zu erzwingen
    const page = allKeys.slice(start, start + pageSize);
    const listComplete = start + pageSize >= allKeys.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: listComplete,
      cursor: listComplete ? undefined : String(start + pageSize),
    };
  }
}
