import { getVisitorKey, setVisitorKey, resetVisitorIdentity } from "./visitor";
import type { Category, Dish } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const OWNER_TOKEN_KEY = "averie_owner_token";
const RATER_TOKEN_KEY = "averie_rater_token";
const RATER_NAME_KEY = "averie_rater_name";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isUnreachableError(err: unknown): boolean {
  if (err instanceof ApiError && (err.message === "slow" || err.status === 0)) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message)) return true;
  return false;
}

export function getOwnerToken(): string | null {
  try {
    const token = localStorage.getItem(OWNER_TOKEN_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function setOwnerToken(token: string): void {
  try {
    localStorage.setItem(OWNER_TOKEN_KEY, token);
  } catch {
    // private mode / blocked storage — cookie path may still work same-origin
  }
}

export function clearOwnerToken(): void {
  try {
    localStorage.removeItem(OWNER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getRaterToken(): string | null {
  try {
    const token = localStorage.getItem(RATER_TOKEN_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function setRaterToken(token: string): void {
  try {
    localStorage.setItem(RATER_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearRaterToken(): void {
  try {
    localStorage.removeItem(RATER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getCachedRaterName(): string | null {
  try {
    const name = localStorage.getItem(RATER_NAME_KEY);
    return name && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

export function setCachedRaterName(name: string): void {
  try {
    localStorage.setItem(RATER_NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function clearCachedRaterName(): void {
  try {
    localStorage.removeItem(RATER_NAME_KEY);
  } catch {
    // ignore
  }
}

export function clearRaterSession(): void {
  clearRaterToken();
  clearCachedRaterName();
  resetVisitorIdentity();
}

const GET_TIMEOUT_MS = 3500;
const MUTATION_TIMEOUT_MS = 8000;

function timeoutSignal(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onParentAbort = () => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Visitor-Key", getVisitorKey());
  const ownerToken = getOwnerToken();
  if (ownerToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${ownerToken}`);
  }
  const raterToken = getRaterToken();
  if (raterToken && !headers.has("X-Rater-Token")) {
    headers.set("X-Rater-Token", raterToken);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (init.method || "GET").toUpperCase();
  const timeoutMs = method === "GET" || method === "HEAD" ? GET_TIMEOUT_MS : MUTATION_TIMEOUT_MS;
  const parentSignal = init.signal ?? undefined;
  const { signal, cancel } = timeoutSignal(parentSignal, timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal,
    });
  } catch (err) {
    cancel();
    if (err instanceof DOMException && err.name === "AbortError") {
      if (parentSignal?.aborted) throw err;
      throw new ApiError("slow", 0);
    }
    if (err instanceof Error && err.name === "AbortError") {
      if (parentSignal?.aborted) throw err;
      throw new ApiError("slow", 0);
    }
    throw err;
  }
  cancel();
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `请求失败（${res.status}）`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function listCategories(init: RequestInit = {}) {
  return request<{ categories: Category[] }>("/api/categories", init);
}

export function listDishes(status: "cooked" | "want_cook" | "want_eat", init: RequestInit = {}) {
  return request<{ dishes: Dish[] }>(`/api/dishes?status=${encodeURIComponent(status)}`, init);
}

export function getDish(id: string, init: RequestInit = {}) {
  return request<{ dish: Dish; owner: boolean }>(`/api/dishes/${encodeURIComponent(id)}`, init);
}

export function rateDish(id: string, score: number) {
  return request<{ ok: boolean; myScore: number; ratingAvg: number | null; ratingCount: number }>(
    `/api/dishes/${encodeURIComponent(id)}/rate`,
    { method: "POST", body: JSON.stringify({ score }) },
  );
}

export function toggleWantEat(id: string) {
  return request<{ ok: boolean; wanted: boolean; wantEatCount: number }>(
    `/api/dishes/${encodeURIComponent(id)}/want-eat`,
    { method: "POST" },
  );
}

export function ownerMe() {
  return request<{ owner: boolean }>("/api/owner/me");
}

export async function ownerLogin(password: string) {
  const res = await request<{ ok: boolean; owner: boolean; token?: string }>("/api/owner/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (typeof res.token === "string" && res.token.trim()) {
    setOwnerToken(res.token.trim());
  }
  return res;
}

export async function ownerLogout() {
  clearOwnerToken();
  return request<{ ok: boolean; owner: boolean }>("/api/owner/logout", { method: "POST" });
}

export function accountMe() {
  return request<{ rater: boolean; displayName?: string; visitorKey?: string }>("/api/account/me");
}

export async function accountLogin(displayName: string, pin: string) {
  const res = await request<{
    ok: boolean;
    rater: boolean;
    displayName: string;
    visitorKey: string;
    token?: string;
  }>("/api/account/login", {
    method: "POST",
    body: JSON.stringify({ displayName, pin }),
  });
  if (typeof res.visitorKey === "string" && res.visitorKey.trim()) {
    setVisitorKey(res.visitorKey.trim());
  }
  if (typeof res.token === "string" && res.token.trim()) {
    setRaterToken(res.token.trim());
  }
  if (typeof res.displayName === "string" && res.displayName.trim()) {
    setCachedRaterName(res.displayName.trim());
  }
  return res;
}
