/**
 * Encode an entire project into a URL-safe string (deflate-compressed base64url).
 * Works fully in the browser — no server required. The string is placed after
 * the URL hash (#p=...) so anyone opening the link loads the exact project.
 */

export interface SharePayload {
  settings: unknown;
  cabinets: unknown;
  project: unknown;
  customers: unknown;
  library: unknown;
  grain: unknown;
}

/**
 * base64url-encode raw bytes. We chunk the conversion because spreading a
 * large Uint8Array into String.fromCharCode(...) throws "Maximum call stack
 * size exceeded" once the payload exceeds ~125k bytes (a project with several
 * cabinets frequently does), breaking the Share link feature. Chunking keeps
 * every individual call far below the engine's argument/stack limit.
 */
const b64url = (bytes: Uint8Array) => {
  const CHUNK = 0x8000; // 32 KiB per fromCharCode call — safe on all engines
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string) => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const toBuf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const stream = new Blob([toBuf(data)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([toBuf(data)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeProject(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  try {
    return b64url(await deflate(json));
  } catch {
    // CompressionStream unavailable (older browser) — plain base64 fallback
    return b64url(json);
  }
}

export async function decodeProject(s: string): Promise<SharePayload | null> {
  try {
    const bytes = fromB64url(s);
    try {
      const out = await inflate(bytes);
      return JSON.parse(new TextDecoder().decode(out));
    } catch {
      return JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch {
    return null;
  }
}

/** Read #p=... from the current URL, if present */
export function shareParamFromUrl(): string | null {
  const h = window.location.hash;
  const m = h.match(/#p=([A-Za-z0-9\-_]+)/);
  return m ? m[1] : null;
}

export function clearShareParam() {
  if (window.location.hash.includes("p=")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export async function buildShareUrl(payload: SharePayload): Promise<string> {
  const enc = await encodeProject(payload);
  const base = window.location.origin + window.location.pathname + window.location.search;
  return `${base}#p=${enc}`;
}
