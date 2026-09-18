import { DISH_ID_RE } from "./auth";
import { sanitizeCoverPath, type DishStatus } from "./dto";

export type IngestParsed = {
  id: string;
  deleted: boolean;
  title: string | null;
  status: DishStatus | null;
  categoriesJson: string | null;
  coverPath: string | null;
  cookedAt: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  recipeJson: string | null;
  published: number | null;
};

export type IngestParseResult =
  | { ok: true; value: IngestParsed }
  | { ok: false; error: string; status: 400 };

/** UPDATE keeps existing values when the bind is NULL (field omitted). */
export const DISH_UPDATE_SQL = `UPDATE dishes SET
  title=COALESCE(?, title),
  status=COALESCE(?, status),
  categories=COALESCE(?, categories),
  cover_path=COALESCE(?, cover_path),
  cooked_at=COALESCE(?, cooked_at),
  source_url=COALESCE(?, source_url),
  source_type=COALESCE(?, source_type),
  recipe=COALESCE(?, recipe),
  published=COALESCE(?, published),
  deleted_at=NULL,
  updated_at=?
WHERE id=?`;

export const DISH_INSERT_SQL = `INSERT INTO dishes (
  id, title, status, categories, cover_path, cooked_at, source_url, source_type,
  recipe, published, deleted_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`;

function optionalTrimmed(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function parseIngestBody(body: Record<string, unknown>, existing: boolean): IngestParseResult {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!DISH_ID_RE.test(id)) return { ok: false, error: "id 须为 1–80 位字母数字._-", status: 400 };

  if (body.deleted === true) {
    return {
      ok: true,
      value: {
        id,
        deleted: true,
        title: null,
        status: null,
        categoriesJson: null,
        coverPath: null,
        cookedAt: null,
        sourceUrl: null,
        sourceType: null,
        recipeJson: null,
        published: null,
      },
    };
  }

  let title: string | null = null;
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 80) {
      return { ok: false, error: "title 必填，最多 80 字", status: 400 };
    }
    title = body.title.trim();
  } else if (!existing) {
    return { ok: false, error: "title 必填，最多 80 字", status: 400 };
  }

  let status: DishStatus | null = null;
  if ("status" in body) {
    if (body.status !== "want_cook" && body.status !== "cooked") {
      return { ok: false, error: "status 须为 cooked | want_cook", status: 400 };
    }
    status = body.status;
  } else if (!existing) {
    return { ok: false, error: "status 须为 cooked | want_cook", status: 400 };
  }

  let categoriesJson: string | null = null;
  if (Array.isArray(body.categories)) {
    const categories = body.categories.filter((x): x is string => typeof x === "string").slice(0, 12);
    categoriesJson = JSON.stringify(categories);
  }

  let coverPath: string | null = null;
  if (typeof body.coverPath === "string" && body.coverPath.trim()) {
    coverPath = sanitizeCoverPath(body.coverPath);
    if (!coverPath) return { ok: false, error: "coverPath 非法", status: 400 };
  }

  const cookedAt = optionalTrimmed(body.cookedAt, 10);
  const sourceUrl = optionalTrimmed(body.sourceUrl, 500);
  const sourceType = optionalTrimmed(body.sourceType, 40);
  const published = "published" in body ? (body.published === false ? 0 : 1) : null;
  const recipeJson =
    body.recipe && typeof body.recipe === "object" ? JSON.stringify(body.recipe) : null;

  return {
    ok: true,
    value: {
      id,
      deleted: false,
      title,
      status,
      categoriesJson,
      coverPath,
      cookedAt,
      sourceUrl,
      sourceType,
      recipeJson,
      published,
    },
  };
}

export function ingestUpdateBinds(parsed: IngestParsed, now: string): unknown[] {
  return [
    parsed.title,
    parsed.status,
    parsed.categoriesJson,
    parsed.coverPath,
    parsed.cookedAt,
    parsed.sourceUrl,
    parsed.sourceType,
    parsed.recipeJson,
    parsed.published,
    now,
    parsed.id,
  ];
}

export function ingestInsertBinds(parsed: IngestParsed, now: string): unknown[] {
  return [
    parsed.id,
    parsed.title,
    parsed.status,
    parsed.categoriesJson ?? "[]",
    parsed.coverPath,
    parsed.cookedAt,
    parsed.sourceUrl,
    parsed.sourceType,
    parsed.recipeJson,
    parsed.published ?? 1,
    now,
    now,
  ];
}
