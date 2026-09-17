import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type { Env } from "./env";

export const COOKIE_NAME = "averie_owner";
export const SESSION_TTL_SEC = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const DEV_DEFAULT_PASSWORD = "averie-cook";

export function isProduction(env: Env): boolean {
  return (env.ENVIRONMENT || "").toLowerCase() === "production";
}

export function passwordConfigured(env: Env): { ok: boolean; error?: string } {
  const password = env.OWNER_PASSWORD?.trim() || "";
  const secret = env.OWNER_SESSION_SECRET?.trim() || "";
  if (!secret || secret.length < 16) {
    return { ok: false, error: "站长会话密钥未配置" };
  }
  if (!password) {
    return { ok: false, error: "站长密码未配置" };
  }
  if (isProduction(env) && password === DEV_DEFAULT_PASSWORD) {
    return { ok: false, error: "生产环境必须修改默认站长密码" };
  }
  return { ok: true };
}

export async function timingSafeEqual(a: string, b: string, hmacSecret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(hmacSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ha = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(a)));
  const hb = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(b)));
  if (ha.byteLength !== hb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ha.byteLength; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function cookieOpts(c: Context<{ Bindings: Env }>) {
  const url = new URL(c.req.url);
  const xfProto = c.req.header("x-forwarded-proto") || "";
  const isHttps = url.protocol === "https:" || xfProto.split(",")[0].trim() === "https";
  const origin = c.req.header("origin") || "";
  let crossSite = false;
  if (origin) {
    try {
      crossSite = new URL(origin).origin !== url.origin;
    } catch {
      crossSite = true;
    }
  }
  // Cross-site GitHub Pages → Worker needs None; browsers require Secure with None.
  // Local HTTP (Vite proxy) uses Lax without Secure.
  const sameSite = isHttps && crossSite ? "None" : "Lax";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: sameSite as "None" | "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export async function issueOwnerCookie(c: Context<{ Bindings: Env }>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
    const token = await sign(
    { sub: "owner", iat: now, exp: now + SESSION_TTL_SEC },
    c.env.OWNER_SESSION_SECRET,
    "HS256",
  );
  setCookie(c, COOKIE_NAME, token, cookieOpts(c));
}

export function clearOwnerCookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, COOKIE_NAME, {
    path: "/",
    secure: cookieOpts(c).secure,
    sameSite: cookieOpts(c).sameSite,
  });
}

export async function isOwner(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return false;
  const secret = c.env.OWNER_SESSION_SECRET?.trim();
  if (!secret) return false;
  try {
    const payload = await verify(token, secret, "HS256");
    return payload.sub === "owner";
  } catch {
    return false;
  }
}

export async function ingestAuthorized(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const expected = c.env.INGEST_SECRET?.trim();
  if (!expected || expected.length < 8) return false;
  const got = c.req.header("x-ingest-secret")?.trim() || "";
  if (!got) return false;
  const hmacKey = c.env.OWNER_SESSION_SECRET?.trim() || expected;
  return timingSafeEqual(got, expected, hmacKey);
}

export async function ownerOrIngest(c: Context<{ Bindings: Env }>): Promise<boolean> {
  if (await isOwner(c)) return true;
  return ingestAuthorized(c);
}

export async function checkLoginRateLimit(
  db: D1Database,
  ip: string,
): Promise<{ ok: true } | { ok: false; retrySec: number }> {
  const key = `login:${ip || "unknown"}`;
  const now = Date.now();
  const row = await db
    .prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; reset_at: number }>();

  if (!row || row.reset_at <= now) {
    await db
      .prepare(
        "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count=1, reset_at=excluded.reset_at",
      )
      .bind(key, now + LOGIN_WINDOW_MS)
      .run();
    return { ok: true };
  }
  if (row.count >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, retrySec: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
  }
  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return { ok: true };
}

export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export const VISITOR_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readVisitorKey(c: Context): string | null {
  const raw = (c.req.header("x-visitor-key") || "").trim();
  if (!raw || raw.length > 64) return null;
  if (!VISITOR_KEY_RE.test(raw)) return null;
  return raw.toLowerCase();
}

export const DISH_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
