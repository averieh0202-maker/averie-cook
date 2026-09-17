export type DishStatus = "cooked" | "want_cook";

export type Category = {
  id: string;
  name: string;
  sort: number;
};

export type Recipe = Record<string, unknown>;

export type PublicDish = {
  id: string;
  title: string;
  status: DishStatus;
  categories: Category[];
  coverUrl: string | null;
  cookedAt: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  wantEatCount: number;
  myScore: number | null;
  wanted: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OwnerDish = PublicDish & {
  recipe: Recipe | null;
  coverPath: string | null;
};

export type DishRow = {
  id: string;
  title: string;
  status: DishStatus;
  categories: string;
  cover_path: string | null;
  cooked_at: string | null;
  source_url: string | null;
  source_type: string | null;
  recipe?: string | null;
  published: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  rating_sum: number;
  rating_count: number;
  want_eat_count: number;
  my_score: number | null;
  wanted: number | null;
};

/** Keys that must never appear on anonymous dish JSON. */
export const PRIVATE_JSON_TOKENS = [
  "recipe",
  "notes",
  "calories",
  "ingredients",
  "ingredients_v1",
  "ingredients_v2_next",
  "steps",
  "tasting",
  "improvements",
  "summary",
  "cover_path",
  "coverPath",
] as const;

const PUBLIC_DISH_KEYS: Array<keyof PublicDish> = [
  "id",
  "title",
  "status",
  "categories",
  "coverUrl",
  "cookedAt",
  "sourceUrl",
  "sourceType",
  "ratingAvg",
  "ratingCount",
  "wantEatCount",
  "myScore",
  "wanted",
  "published",
  "createdAt",
  "updatedAt",
];

export function buildCoverUrl(
  coverPath: string | null | undefined,
  assetBaseUrl: string,
  apiOrigin: string,
): string | null {
  if (!coverPath) return null;
  const safe = sanitizeCoverPath(coverPath);
  if (!safe) return null;
  if (safe.startsWith("covers/")) {
    return `${apiOrigin.replace(/\/$/, "")}/api/media/${encodeURIComponent(safe.slice("covers/".length))}`;
  }
  const base = assetBaseUrl.replace(/\/$/, "");
  return `${base}/${safe}`;
}

/** Relative cover paths only. Rejects traversal, schemes, and absolute URLs. */
export function sanitizeCoverPath(input: string): string | null {
  const trimmed = input.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  if (trimmed.includes("..")) return null;
  if (trimmed.includes("\\")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  if (!/^(uploads|covers)\/[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function parseCategories(
  raw: string,
  catalog: Map<string, Category>,
): Category[] {
  let ids: unknown = [];
  try {
    ids = JSON.parse(raw);
  } catch {
    ids = [];
  }
  if (!Array.isArray(ids)) return [];
  const out: Category[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const cat = catalog.get(id);
    if (cat) out.push(cat);
  }
  return out;
}

export function toPublicDish(
  row: DishRow,
  catalog: Map<string, Category>,
  assetBaseUrl: string,
  apiOrigin: string,
): PublicDish {
  const count = Number(row.rating_count) || 0;
  const sum = Number(row.rating_sum) || 0;
  const dto: PublicDish = {
    id: row.id,
    title: row.title,
    status: row.status,
    categories: parseCategories(row.categories, catalog),
    coverUrl: buildCoverUrl(row.cover_path, assetBaseUrl, apiOrigin),
    cookedAt: row.cooked_at,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    ratingAvg: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    ratingCount: count,
    wantEatCount: Number(row.want_eat_count) || 0,
    myScore: row.my_score == null ? null : Number(row.my_score),
    wanted: Boolean(row.wanted),
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return dto;
}

export function toOwnerDish(
  row: DishRow,
  catalog: Map<string, Category>,
  assetBaseUrl: string,
  apiOrigin: string,
): OwnerDish {
  let recipe: Recipe | null = null;
  if (row.recipe) {
    try {
      const parsed = JSON.parse(row.recipe) as unknown;
      if (parsed && typeof parsed === "object") recipe = parsed as Recipe;
    } catch {
      recipe = null;
    }
  }
  return {
    ...toPublicDish(row, catalog, assetBaseUrl, apiOrigin),
    recipe,
    coverPath: sanitizeCoverPath(row.cover_path || "") && row.cover_path ? row.cover_path : null,
  };
}

export function jsonContainsPrivateTokens(payload: unknown): string[] {
  const raw = JSON.stringify(payload);
  return PRIVATE_JSON_TOKENS.filter((token) => {
    const re = new RegExp(`"${token}"\\s*:`);
    return re.test(raw);
  });
}

export function assertPublicPayload(payload: unknown): void {
  const hits = jsonContainsPrivateTokens(payload);
  if (hits.length) {
    throw new Error(`public payload leaked private keys: ${hits.join(", ")}`);
  }
}

export function pickPublicKeys(dish: PublicDish): PublicDish {
  const out = {} as PublicDish;
  for (const key of PUBLIC_DISH_KEYS) {
    (out as Record<string, unknown>)[key] = dish[key];
  }
  return out;
}
