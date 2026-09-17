import { getVisitorKey } from "./visitor";
import type { Dish } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Visitor-Key", getVisitorKey());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
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

export function listDishes(status: "cooked" | "want_cook" | "want_eat") {
  return request<{ dishes: Dish[] }>(`/api/dishes?status=${encodeURIComponent(status)}`);
}

export function getDish(id: string) {
  return request<{ dish: Dish; owner: boolean }>(`/api/dishes/${encodeURIComponent(id)}`);
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

export function ownerLogin(password: string) {
  return request<{ ok: boolean; owner: boolean }>("/api/owner/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function ownerLogout() {
  return request<{ ok: boolean; owner: boolean }>("/api/owner/logout", { method: "POST" });
}
