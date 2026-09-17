import { sign } from "hono/jwt";
import { VISITOR_KEY_RE, hmacHex, timingSafeEqual, verifyRaterSession } from "./auth";

export const DISPLAY_NAME_MAX = 16;
export const PIN_RE = /^\d{4,6}$/;
export const RATER_SESSION_TTL_SEC = 400 * 24 * 60 * 60;
export const RATER_LOGIN_MAX_ATTEMPTS = 12;

export type RaterRow = {
  id: string;
  display_name: string;
  pin_hash: string;
  visitor_key: string;
};

export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

export function displayNameNorm(name: string): string {
  return name.toLowerCase();
}

export function parsePin(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const pin = String(raw).trim();
  if (!PIN_RE.test(pin)) return null;
  return pin;
}

export async function hashPin(pin: string, nameNorm: string, secret: string): Promise<string> {
  return hmacHex(secret, `rater-pin:${nameNorm}:${pin}`);
}

export async function issueRaterToken(
  secret: string,
  visitorKey: string,
  displayName: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: "rater",
      vk: visitorKey,
      name: displayName,
      iat: now,
      exp: now + RATER_SESSION_TTL_SEC,
    },
    secret,
    "HS256",
  );
}

export async function loginOrRegisterRater(
  db: D1Database,
  secret: string,
  input: { displayName: unknown; pin: unknown; guestVisitorKey: string | null },
): Promise<
  | { ok: true; displayName: string; visitorKey: string }
  | { ok: false; status: 400 | 401 | 409 | 503; error: string }
> {
  if (!secret || secret.length < 16) {
    return { ok: false, status: 503, error: "账号服务未配置" };
  }
  const displayName = normalizeDisplayName(input.displayName);
  const pin = parsePin(input.pin);
  if (!displayName || !pin) {
    return { ok: false, status: 400, error: "昵称 1–16 字，PIN 为 4–6 位数字" };
  }

  const norm = displayNameNorm(displayName);
  const existing = await db
    .prepare(
      "SELECT id, display_name, pin_hash, visitor_key FROM raters WHERE display_name_norm = ?",
    )
    .bind(norm)
    .first<RaterRow>();

  if (existing) {
    const got = await hashPin(pin, norm, secret);
    if (!(await timingSafeEqual(got, existing.pin_hash, secret))) {
      return { ok: false, status: 401, error: "昵称或 PIN 不对" };
    }
    return { ok: true, displayName: existing.display_name, visitorKey: existing.visitor_key };
  }

  const pinHash = await hashPin(pin, norm, secret);
  let visitorKey =
    input.guestVisitorKey && VISITOR_KEY_RE.test(input.guestVisitorKey)
      ? input.guestVisitorKey.toLowerCase()
      : crypto.randomUUID();
  const taken = await db
    .prepare("SELECT 1 AS x FROM raters WHERE visitor_key = ?")
    .bind(visitorKey)
    .first();
  if (taken) visitorKey = crypto.randomUUID();

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO raters (id, display_name, display_name_norm, pin_hash, visitor_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(visitorKey, displayName, norm, pinHash, visitorKey, now)
      .run();
  } catch {
    return { ok: false, status: 409, error: "请再试一次" };
  }
  return { ok: true, displayName, visitorKey };
}

export async function findRaterByVisitorKey(
  db: D1Database,
  visitorKey: string,
): Promise<{ displayName: string; visitorKey: string } | null> {
  const row = await db
    .prepare("SELECT display_name, visitor_key FROM raters WHERE visitor_key = ?")
    .bind(visitorKey)
    .first<{ display_name: string; visitor_key: string }>();
  if (!row) return null;
  return { displayName: row.display_name, visitorKey: row.visitor_key };
}

export async function resolveRater(
  db: D1Database,
  secret: string | undefined,
  raterToken: string | null,
  visitorKey: string | null,
): Promise<{ displayName: string; visitorKey: string } | null> {
  const fromToken = await verifyRaterSession(raterToken, secret);
  if (fromToken) {
    const row = await findRaterByVisitorKey(db, fromToken.visitorKey);
    if (row) return row;
  }
  if (visitorKey) return findRaterByVisitorKey(db, visitorKey);
  return null;
}
