/** Sticky first-party visitor identity: localStorage + cookie + in-memory. */

export const VISITOR_KEY_STORAGE = "visitor_key";
export const VISITOR_COOKIE = "averie_visitor_key";
/** Chrome caps Max-Age at ~400 days. */
export const VISITOR_COOKIE_MAX_AGE = 34560000;

export const VISITOR_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitorStore = {
  readLocal(): string | null;
  writeLocal(value: string): void;
  clearLocal(): void;
  readCookie(): string | null;
  writeCookie(value: string): void;
  clearCookie(): void;
};

let memoryKey: string | null = null;
let storeOverride: VisitorStore | null = null;

export function isVisitorKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 64 && VISITOR_KEY_RE.test(trimmed);
}

export function cookiePathFromBase(base: string): string {
  const trimmed = (base || "/").replace(/\/+$/, "");
  return trimmed || "/";
}

export function parseCookieValue(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

export function serializeVisitorCookie(key: string, path: string, secure: boolean, maxAge = VISITOR_COOKIE_MAX_AGE): string {
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  const parts = [
    `${VISITOR_COOKIE}=${key}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    `Expires=${expires}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function expireVisitorCookie(path: string, secure: boolean): string {
  return serializeVisitorCookie("", path, secure, 0);
}

export function pickVisitorKey(localValue: string | null, cookieValue: string | null): string | null {
  if (isVisitorKey(localValue)) return localValue.trim().toLowerCase();
  if (isVisitorKey(cookieValue)) return cookieValue.trim().toLowerCase();
  return null;
}

function pagesBase(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL || "/";
}

function defaultStore(): VisitorStore {
  const path = cookiePathFromBase(pagesBase());
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  return {
    readLocal() {
      try {
        return localStorage.getItem(VISITOR_KEY_STORAGE);
      } catch {
        return null;
      }
    },
    writeLocal(value) {
      try {
        localStorage.setItem(VISITOR_KEY_STORAGE, value);
      } catch {
        // private mode / quota — cookie + memory still hold identity
      }
    },
    clearLocal() {
      try {
        localStorage.removeItem(VISITOR_KEY_STORAGE);
      } catch {
        // ignore
      }
    },
    readCookie() {
      if (typeof document === "undefined") return null;
      try {
        return parseCookieValue(document.cookie, VISITOR_COOKIE);
      } catch {
        return null;
      }
    },
    writeCookie(value) {
      if (typeof document === "undefined") return;
      try {
        document.cookie = serializeVisitorCookie(value, path, secure);
      } catch {
        // ignore
      }
    },
    clearCookie() {
      if (typeof document === "undefined") return;
      try {
        document.cookie = expireVisitorCookie(path, secure);
      } catch {
        // ignore
      }
    },
  };
}

function store(): VisitorStore {
  return storeOverride || defaultStore();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function persist(key: string): void {
  const s = store();
  try {
    s.writeLocal(key);
  } catch {
    // localStorage blocked — cookie / memory still hold identity
  }
  try {
    s.writeCookie(key);
  } catch {
    // ignore
  }
}

function remember(key: string): string {
  const normalized = key.trim().toLowerCase();
  memoryKey = normalized;
  persist(normalized);
  return normalized;
}

function readStored(): { local: string | null; cookie: string | null } {
  const s = store();
  let local: string | null = null;
  let cookie: string | null = null;
  try {
    local = s.readLocal();
  } catch {
    local = null;
  }
  try {
    cookie = s.readCookie();
  } catch {
    cookie = null;
  }
  return { local, cookie };
}

export function getVisitorKey(): string {
  if (isVisitorKey(memoryKey)) {
    persist(memoryKey);
    return memoryKey.trim().toLowerCase();
  }
  const { local, cookie } = readStored();
  const picked = pickVisitorKey(local, cookie);
  if (picked) return remember(picked);
  return remember(uuid());
}

export function setVisitorKey(key: string): string {
  if (!isVisitorKey(key)) {
    throw new Error("invalid visitor_key");
  }
  return remember(key);
}

/** Logout: drop stored identity, then mint a fresh guest key. */
export function resetVisitorIdentity(): string {
  memoryKey = null;
  const s = store();
  try {
    s.clearLocal();
  } catch {
    // ignore
  }
  try {
    s.clearCookie();
  } catch {
    // ignore
  }
  return remember(uuid());
}

export function _setVisitorStoreForTests(next: VisitorStore | null): void {
  storeOverride = next;
  memoryKey = null;
}

export function _resetVisitorStateForTests(): void {
  memoryKey = null;
  storeOverride = null;
}
