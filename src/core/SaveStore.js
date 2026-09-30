/**
 * The save: everything the player keeps between visits, in IndexedDB.
 *
 *   progress — red souls in hand and the upgrade levels   (`combat/Progress.js`)
 *   stage1   — 一ノ章: cleared, best time, checkpoint, lesson done (`world/Stage.js`)
 *   prefs    — the settings screen: volumes, quality, camera   (`ui/SettingsPanel.js`)
 *
 * The game reads it synchronously, every time, from a copy held in memory; the
 * database is only where that copy is loaded from once at boot (`open`) and
 * written back to shortly after each change (`set` → a debounced `flush`),
 * and at once when the page is hidden or closed. So a change is never waited
 * on and a crash loses at most the last quarter second.
 *
 * Where IndexedDB is missing or refused (some private windows), the same
 * record goes to localStorage instead, and failing that it lives for the
 * session. The first open also carries over the localStorage keys earlier
 * versions of the game wrote, so nobody's souls or clear are lost in the move.
 */
const DB_NAME = 'samurai';
const STORE = 'save';
const SLOT = 'slot1';
const FALLBACK_KEY = 'samurai.save';
/** What earlier versions kept in localStorage, and where it goes now. */
const LEGACY = { progress: 'samurai.progress', stage1: 'samurai.stage1' };
const FLUSH_DELAY = 250;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class SaveStore {
  constructor() {
    /** @type {Record<string, any>} */
    this.data = {};
    /** 'indexeddb' | 'localStorage' | 'memory' — where writes go. */
    this.backend = 'memory';
    this.db = null;
    this._timer = 0;
    this._pending = null;
    this._onHide = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };
  }

  /** Load the save. Never rejects: a store that cannot be opened is a fresh one. */
  async open() {
    try {
      if (!globalThis.indexedDB) throw new Error('no IndexedDB');
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
      const stored = await request(this.db.transaction(STORE).objectStore(STORE).get(SLOT));
      this.backend = 'indexeddb';
      this.data = stored && typeof stored === 'object' ? stored : {};
    } catch {
      this.db = null;
      this.backend = this._localOk() ? 'localStorage' : 'memory';
      this.data = this._readLocal(FALLBACK_KEY) ?? {};
    }

    // Carry the old keys over once.
    let migrated = false;
    for (const [key, legacy] of Object.entries(LEGACY)) {
      if (this.data[key]) continue;
      const old = this._readLocal(legacy);
      if (old) {
        this.data[key] = old;
        migrated = true;
      }
    }
    if (migrated) await this.flush();

    document.addEventListener('visibilitychange', this._onHide);
    window.addEventListener('pagehide', this._onHide);
    return this;
  }

  /** A copy of one record (or `fallback` when there is none). */
  get(key, fallback = {}) {
    const value = this.data[key];
    return value === undefined ? structuredClone(fallback) : structuredClone(value);
  }

  /** Replace one record; written back shortly. */
  set(key, value) {
    this.data[key] = structuredClone(value);
    this.data.updatedAt = Date.now();
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), FLUSH_DELAY);
  }

  /** Merge into one record. */
  patch(key, partial) {
    this.set(key, { ...this.get(key), ...partial });
  }

  /** Write now. Resolves once the record is on disk (or could not be). */
  flush() {
    clearTimeout(this._timer);
    this._timer = 0;
    const snapshot = structuredClone(this.data);
    if (this.db) {
      this._pending = new Promise((resolve) => {
        try {
          const tx = this.db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(snapshot, SLOT);
          tx.oncomplete = () => resolve(true);
          tx.onerror = tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
      return this._pending;
    }
    if (this.backend === 'localStorage') {
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
        return Promise.resolve(true);
      } catch {
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(false);
  }

  /** Forget everything (the settings screen's 「セーブ削除」). */
  async clear() {
    this.data = {};
    for (const legacy of Object.values(LEGACY)) {
      try {
        localStorage.removeItem(legacy);
      } catch {}
    }
    await this.flush();
  }

  _localOk() {
    try {
      const probe = '__samurai_probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  _readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  dispose() {
    this.flush();
    document.removeEventListener('visibilitychange', this._onHide);
    window.removeEventListener('pagehide', this._onHide);
  }
}

/** The one save the game uses. `main.js` opens it before the app is built. */
export const save = new SaveStore();
