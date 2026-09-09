/**
 * CNC-PRO — Robust offline storage layer
 * Handles: localStorage quota, version migration, IndexedDB fallback, backup rotation
 * Fully offline, no network.
 */

const PREFIX = "cnc-cabinet-designer-pro-v";
const BACKUP_PREFIX = "cnc-backup-v";
const LEGACY_KEYS = [
  "cnc-cabinet-designer",
  "cnc-cabinet-designer-pro",
  "cnc-cabinet-designer-pro-v",
];

function allLocalKeys(): string[] {
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

/** Find newest persisted state across all versioned keys */
export function findLatestPersistedKey(currentVersion: number): string | null {
  const keys = allLocalKeys().filter((k) => k.startsWith(PREFIX) || LEGACY_KEYS.some((lg) => k.startsWith(lg)));
  if (keys.length === 0) return null;
  // sort by version number descending, then by recency if possible
  const parsed = keys
    .map((k) => {
      const m = k.match(/-v(\d+)$/);
      const v = m ? parseInt(m[1], 10) : 0;
      return { k, v };
    })
    .sort((a, b) => b.v - a.v);
  // prefer current version if exists, else highest version
  const currentKey = `${PREFIX}${currentVersion}`;
  if (parsed.some((p) => p.k === currentKey)) return currentKey;
  return parsed[0]?.k ?? null;
}

export function loadRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveRaw(key: string, value: string): { ok: boolean; quota: boolean; error?: string } {
  try {
    localStorage.setItem(key, value);
    return { ok: true, quota: false };
  } catch (e: any) {
    const msg = String(e?.message || e);
    const quota = msg.includes("QuotaExceeded") || msg.includes("quota") || msg.includes("storage");
    return { ok: false, quota, error: msg };
  }
}

export function removeRaw(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/* ---------- IndexedDB fallback (tiny wrapper, no external dep) ---------- */

const IDB_DB = "cnc-pro-db";
const IDB_STORE = "kv";
const IDB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function idbSet(key: string, value: string): Promise<boolean> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        const v = req.result;
        resolve(typeof v === "string" ? v : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/* ---------- Backup rotation (keep last 5) ---------- */

export function rotateBackups(currentVersion: number, currentData: string) {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const key = `${BACKUP_PREFIX}${currentVersion}-${stamp}`;
    localStorage.setItem(key, currentData);
    // keep only 5 newest backups for this version
    const all = allLocalKeys()
      .filter((k) => k.startsWith(`${BACKUP_PREFIX}${currentVersion}-`))
      .sort()
      .reverse();
    all.slice(5).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {
    // quota — ignore, main save matters more
  }
}

export function listBackups(currentVersion: number): { key: string; date: string; size: number }[] {
  return allLocalKeys()
    .filter((k) => k.startsWith(`${BACKUP_PREFIX}${currentVersion}-`))
    .map((k) => {
      const raw = loadRaw(k);
      return { key: k, date: k.replace(`${BACKUP_PREFIX}${currentVersion}-`, ""), size: raw ? raw.length : 0 };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/* ---------- Storage quota info ---------- */

export function storageInfo(): { used: number; quota: number; percent: number; count: number } {
  let used = 0;
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k);
      if (v) {
        used += k.length + v.length;
        count++;
      }
    }
  } catch {}
  // localStorage quota is typically ~5MB, but we estimate 5MB = 5*1024*1024 chars ~ 2 bytes per char? rough
  const quota = 5 * 1024 * 1024;
  const percent = Math.min(100, Math.round((used / quota) * 100));
  return { used, quota, percent, count };
}

/* ---------- Safe JSON parse with migration ---------- */

export function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
