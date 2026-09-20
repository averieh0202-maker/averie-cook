/**
 * Averie Cook API — Hono app shared by:
 *   - Cloudflare Pages Functions (canonical, same-origin /api on pages.dev)
 *   - Legacy Worker at averie-cook-api.*.workers.dev
 * Public dish JSON never includes recipe / notes / calories.
 */
import { Hono } from "hono";
import journal, { authenticatedRater } from "./journal";
import type { Context } from "hono";
import { cors } from "hono/cors";
import {
  issueRaterToken,
  loginOrRegisterRater,
  RATER_LOGIN_MAX_ATTEMPTS,
  resolveRater,
} from "./account";
import {
  checkLoginRateLimit,
  clientIp,
  DISH_ID_RE,
  ingestAuthorized,
  isOwner,
  issueOwnerSession,
  clearOwnerCookie,
  ownerOrIngest,
  passwordConfigured,
  readRaterToken,
  readVisitorKey,
  timingSafeEqual,
} from "./auth";
import {
  assertPublicPayload,
  type Category,
  type DishRow,
  parseRatingScore,
  pickPublicKeys,
  toOwnerDish,
  toPublicDish,
} from "./dto";
import type { Env } from "./env";
import {
  DISH_INSERT_SQL,
  DISH_UPDATE_SQL,
  ingestInsertBinds,
  ingestUpdateBinds,
  parseIngestBody,
} from "./ingest";
import { CoverFilterError } from "./foodFilter";
import { filterCoverBytes } from "./imageCodec";
import {
  getMedia,
  isMediaFilename,
  MAX_UPLOAD_BYTES,
  mediaResponse,
  putMedia,
  sniffImage,
} from "./media";
import { isAllowedOrigin, resolveAssetBase } from "./cors";
import { ensureSeed } from "./seed";

const PRIVATE_CACHE = "private, no-store";

const DISH_SELECT = `
  d.id, d.title, d.status, d.categories, d.cover_path, d.cooked_at,
  d.source_url, d.source_type, d.published, d.deleted_at, d.created_at, d.updated_at,
  (SELECT COALESCE(SUM(score), 0) FROM ratings r WHERE r.dish_id = d.id) AS rating_sum,
  (SELECT COUNT(*) FROM ratings r WHERE r.dish_id = d.id) AS rating_count,
  (SELECT COUNT(*) FROM want_eat w WHERE w.dish_id = d.id) AS want_eat_count,
  (SELECT MAX(created_at) FROM want_eat w WHERE w.dish_id = d.id) AS last_want_eat_at
`;

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  if (!c.req.path.startsWith("/api/media/")) {
    c.header("Cache-Control", PRIVATE_CACHE);
  }
  c.header("X-Content-Type-Options", "nosniff");
});

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return "";
      return isAllowedOrigin(origin, c.req.url) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Visitor-Key", "X-Rater-Token", "X-Ingest-Secret"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  try {
    await ensureSeed(c.env);
  } catch (err) {
    console.error("seed failed", err);
  }
  return next();
});

function apiOrigin(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin;
}

function assetBase(env: Env, requestUrl: string): string {
  return resolveAssetBase(env.ASSET_BASE_URL, requestUrl);
}

async function loadCatalog(db: D1Database): Promise<Map<string, Category>> {
  const { results } = await db
    .prepare("SELECT id, name, sort FROM categories ORDER BY sort ASC")
    .all<Category>();
  const map = new Map<string, Category>();
  for (const row of results || []) map.set(row.id, row);
  return map;
}

function publicWhere(ownerAll: boolean): string {
  return ownerAll ? "1=1" : "d.published = 1 AND d.deleted_at IS NULL";
}

async function fetchDish(
  db: D1Database,
  id: string,
  visitorKey: string | null,
  includeRecipe: boolean,
): Promise<DishRow | null> {
  const recipeCol = includeRecipe ? ", d.recipe" : "";
  const myScore = visitorKey
    ? "(SELECT score FROM ratings r WHERE r.dish_id = d.id AND r.visitor_key = ?) AS my_score"
    : "NULL AS my_score";
  const wanted = visitorKey
    ? "(SELECT 1 FROM want_eat w WHERE w.dish_id = d.id AND w.visitor_key = ?) AS wanted"
    : "NULL AS wanted";
  const sql = `SELECT ${DISH_SELECT}${recipeCol}, ${myScore}, ${wanted} FROM dishes d WHERE d.id = ?`;
  const stmt = db.prepare(sql);
  const binds: unknown[] = [];
  if (visitorKey) binds.push(visitorKey, visitorKey);
  binds.push(id);
  return stmt.bind(...binds).first<DishRow>();
}

app.get("/health", (c) => c.json({ ok: true, service: "averie-cook-api" }));

app.get("/api/categories", async (c) => {
  const catalog = await loadCatalog(c.env.DB);
  return c.json({ categories: [...catalog.values()].sort((a, b) => a.sort - b.sort) });
});

app.get("/api/dishes", async (c) => {
  const owner = await isOwner(c);
  const status = (c.req.query("status") || "").trim();
  const visitorKey = readVisitorKey(c);
  const includeAll = owner && c.req.query("all") === "1";
  const catalog = await loadCatalog(c.env.DB);

  const myScore = visitorKey
    ? "(SELECT score FROM ratings r WHERE r.dish_id = d.id AND r.visitor_key = ?) AS my_score"
    : "NULL AS my_score";
  const wanted = visitorKey
    ? "(SELECT 1 FROM want_eat w WHERE w.dish_id = d.id AND w.visitor_key = ?) AS wanted"
    : "NULL AS wanted";

  let where = publicWhere(includeAll);
  const binds: unknown[] = [];
  if (visitorKey) binds.push(visitorKey, visitorKey);

  if (status === "cooked" || status === "want_cook") {
    where += " AND d.status = ?";
    binds.push(status);
  } else if (status === "want_eat") {
    where += " AND (SELECT COUNT(*) FROM want_eat w WHERE w.dish_id = d.id) > 0";
  } else if (status) {
    return c.json({ error: "status 须为 cooked | want_cook | want_eat" }, 400);
  }

  const order =
    status === "want_eat"
      ? "want_eat_count DESC, last_want_eat_at DESC, d.updated_at DESC"
      : "d.cooked_at DESC, d.created_at DESC";

  const sql = `SELECT ${DISH_SELECT}, ${myScore}, ${wanted}
    FROM dishes d
    WHERE ${where}
    ORDER BY ${order}`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<DishRow>();
  const dishes = (results || []).map((row) =>
    pickPublicKeys(toPublicDish(row, catalog, assetBase(c.env, c.req.url), apiOrigin(c))),
  );
  assertPublicPayload({ dishes });
  return c.json({ dishes });
});

app.get("/api/dishes/:id", async (c) => {
  const id = c.req.param("id");
  if (!DISH_ID_RE.test(id)) return c.json({ error: "无效的菜谱 id" }, 400);
  const owner = await isOwner(c);
  const visitorKey = readVisitorKey(c);
  const row = await fetchDish(c.env.DB, id, visitorKey, owner);
  if (!row) return c.json({ error: "找不到这道菜" }, 404);
  if (!owner && (!row.published || row.deleted_at)) {
    return c.json({ error: "找不到这道菜" }, 404);
  }

  const catalog = await loadCatalog(c.env.DB);
  if (owner) {
    const dish = toOwnerDish(row, catalog, assetBase(c.env, c.req.url), apiOrigin(c));
    return c.json({ dish, owner: true });
  }
  const dish = pickPublicKeys(toPublicDish(row, catalog, assetBase(c.env, c.req.url), apiOrigin(c)));
  assertPublicPayload({ dish });
  return c.json({ dish, owner: false });
});

app.post("/api/dishes/:id/rate", async (c) => {
  return c.json({ error: "请在对应日期的家食记中评分" }, 410);
});

app.post("/api/dishes/:id/want-eat", (c) => c.json({ error: "请使用新版点菜接口" }, 410));

app.get("/api/owner/me", async (c) => {
  return c.json({ owner: await isOwner(c) });
});

app.post("/api/owner/login", async (c) => {
  const configured = passwordConfigured(c.env);
  if (!configured.ok) return c.json({ error: configured.error }, 503);

  const limit = await checkLoginRateLimit(c.env.DB, clientIp(c));
  if (!limit.ok) {
    return c.json({ error: "尝试过多，请稍后再试", retrySec: limit.retrySec }, 429);
  }

  let body: { password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "请求体必须是 JSON" }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  const ok = await timingSafeEqual(password, c.env.OWNER_PASSWORD, c.env.OWNER_SESSION_SECRET);
  if (!ok) return c.json({ error: "密码不对" }, 401);

  const token = await issueOwnerSession(c);
  // Same-origin Cloudflare Pages can use the httpOnly cookie (SameSite=Lax).
  // GitHub Pages → workers.dev still needs JSON `token` + Bearer: third-party
  // cookies are often blocked even with SameSite=None; Secure; Partitioned.
  return c.json({ ok: true, owner: true, token });
});

app.post("/api/owner/logout", async (c) => {
  clearOwnerCookie(c);
  return c.json({ ok: true, owner: false });
});

app.get("/api/account/me", async (c) => {
  const rater = await authenticatedRater(c);
  if (!rater) return c.json({ rater: false });
  const token = await issueRaterToken(c.env.OWNER_SESSION_SECRET, rater.visitorKey, rater.displayName);
  return c.json({ rater: true, displayName: rater.displayName, visitorKey: rater.visitorKey, token });
});

app.post("/api/account/login", async (c) => {
  const secret = c.env.OWNER_SESSION_SECRET?.trim() || "";
  if (!secret || secret.length < 16) return c.json({ error: "账号服务未配置" }, 503);

  const limit = await checkLoginRateLimit(c.env.DB, clientIp(c), "rater-login", RATER_LOGIN_MAX_ATTEMPTS);
  if (!limit.ok) {
    return c.json({ error: "尝试过多，请稍后再试", retrySec: limit.retrySec }, 429);
  }

  let body: { displayName?: unknown; pin?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "请求体必须是 JSON" }, 400);
  }

  const result = await loginOrRegisterRater(c.env.DB, secret, {
    displayName: body.displayName,
    pin: body.pin,
    guestVisitorKey: null,
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  const token = await issueRaterToken(secret, result.visitorKey, result.displayName);
  return c.json({
    ok: true,
    rater: true,
    displayName: result.displayName,
    visitorKey: result.visitorKey,
    token,
  });
});

app.get("/api/ingest/health", async (c) => {
  if (!(await ingestAuthorized(c))) {
    return c.json({ error: "需要有效的 X-Ingest-Secret" }, 401);
  }
  return c.json({ ok: true, ingest: true });
});

app.post("/api/ingest/dishes", async (c) => {
  if (!(await ingestAuthorized(c))) {
    return c.json({ error: "需要有效的 X-Ingest-Secret" }, 401);
  }
  return upsertDish(c);
});

app.post("/api/owner/dishes", async (c) => {
  if (!(await ownerOrIngest(c))) {
    return c.json({ error: "需要站长登录或 INGEST_SECRET" }, 401);
  }
  return upsertDish(c);
});

async function upsertDish(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "请求体必须是 JSON" }, 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!DISH_ID_RE.test(id)) return c.json({ error: "id 须为 1–80 位字母数字._-" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM dishes WHERE id = ?").bind(id).first();
  const parsed = parseIngestBody(body, Boolean(existing));
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);

  const now = new Date().toISOString();

  if (parsed.value.deleted) {
    if (!existing) return c.json({ error: "找不到这道菜" }, 404);
    await c.env.DB.prepare("UPDATE dishes SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, id)
      .run();
    return c.json({ ok: true, id, deleted: true });
  }

  if (existing) {
    await c.env.DB.prepare(DISH_UPDATE_SQL).bind(...ingestUpdateBinds(parsed.value, now)).run();
  } else {
    await c.env.DB.prepare(DISH_INSERT_SQL).bind(...ingestInsertBinds(parsed.value, now)).run();
  }

  return c.json({ ok: true, id });
}

app.post("/api/ingest/upload", async (c) => {
  if (!(await ingestAuthorized(c))) {
    return c.json({ error: "需要有效的 X-Ingest-Secret" }, 401);
  }
  return uploadCover(c);
});

app.post("/api/owner/upload", async (c) => {
  if (!(await ownerOrIngest(c))) {
    return c.json({ error: "需要站长登录或 INGEST_SECRET" }, 401);
  }
  return uploadCover(c);
});

async function uploadCover(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody({ all: true });
  } catch {
    return c.json({ error: "须为 multipart/form-data" }, 400);
  }
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "图片须小于 2MB" }, 400);

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) return c.json({ error: "仅支持 JPEG / PNG / WebP" }, 400);

  let filtered: Uint8Array;
  try {
    filtered = await filterCoverBytes(buf, kind);
  } catch (err) {
    console.error("cover filter failed", err);
    const msg = err instanceof CoverFilterError ? err.message : "封面滤镜处理失败";
    return c.json({ error: msg }, 400);
  }

  const filename = `${crypto.randomUUID()}.jpg`;
  await putMedia(c.env, filename, filtered, "image/jpeg");
  const coverPath = `covers/${filename}`;
  return c.json({
    ok: true,
    coverPath,
    coverUrl: `${apiOrigin(c)}/api/media/${encodeURIComponent(filename)}`,
  });
}

app.get("/api/media/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (!isMediaFilename(filename)) {
    return c.json({ error: "无效文件名" }, 400);
  }
  const rec = await getMedia(c.env, filename);
  if (!rec) return c.json({ error: "找不到图片" }, 404);
  return mediaResponse(rec.body, rec.mime);
});

app.post("/api/journal/upload", async (c) => {
  if (!(await authenticatedRater(c)) && !(await ownerOrIngest(c))) return c.json({error:"请先登录"},401);
  return uploadCover(c);
});
app.route("/api/journal", journal);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
