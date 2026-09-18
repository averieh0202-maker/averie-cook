import { assertPublicPayload, PUBLIC_DISH_KEYS } from "./privacy";
import type { Category, Dish } from "./types";

export type CatalogSnapshot = {
  generatedAt?: string;
  source?: string;
  categories: Category[];
  dishes: Dish[];
};

function assetBase(): string {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.BASE_URL === "string"
      ? import.meta.env.BASE_URL
      : "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function snapshotUrl(file = "catalog.json"): string {
  return `${assetBase()}data/${file}`;
}

function asCategory(raw: unknown): Category | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  return {
    id: row.id,
    name: typeof row.name === "string" && row.name ? row.name : row.id,
    sort: Number(row.sort) || 0,
  };
}

export function pickPublicDish(raw: unknown): Dish | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  const categories = Array.isArray(row.categories)
    ? row.categories.map(asCategory).filter((c): c is Category => Boolean(c))
    : [];
  const ratingCount = Number(row.ratingCount) || 0;
  const dish: Dish = {
    id: row.id,
    title: row.title,
    status: row.status === "want_cook" ? "want_cook" : "cooked",
    categories,
    coverUrl: typeof row.coverUrl === "string" ? row.coverUrl : null,
    cookedAt: typeof row.cookedAt === "string" ? row.cookedAt : null,
    sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
    sourceType: typeof row.sourceType === "string" ? row.sourceType : null,
    ratingAvg: ratingCount > 0 && row.ratingAvg != null ? Number(row.ratingAvg) : null,
    ratingCount,
    wantEatCount: Number(row.wantEatCount) || 0,
    myScore: null,
    wanted: false,
    published: row.published === false ? false : true,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
  const out = {} as Dish;
  for (const key of PUBLIC_DISH_KEYS) {
    (out as Record<string, unknown>)[key] = dish[key];
  }
  return out;
}

export function normalizeCatalog(raw: unknown): CatalogSnapshot {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const categories = Array.isArray(row.categories)
    ? row.categories.map(asCategory).filter((c): c is Category => Boolean(c))
    : [];
  const dishes = Array.isArray(row.dishes)
    ? row.dishes.map(pickPublicDish).filter((d): d is Dish => Boolean(d))
    : [];
  const catalog: CatalogSnapshot = {
    generatedAt: typeof row.generatedAt === "string" ? row.generatedAt : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    categories: categories.sort((a, b) => a.sort - b.sort),
    dishes,
  };
  assertPublicPayload(catalog);
  return catalog;
}

export function dishesForStatus(dishes: Dish[], status: "cooked" | "want_cook" | "want_eat"): Dish[] {
  if (status === "want_eat") return dishes.filter((d) => d.wantEatCount > 0);
  return dishes.filter((d) => d.status === status);
}

export function findSnapshotDish(dishes: Dish[], id: string): Dish | undefined {
  return dishes.find((d) => d.id === id);
}

/** Live D1 can omit cookedAt/categories after a partial ingest; keep snapshot values. */
export function overlayLiveDish(snapshot: Dish | undefined, live: Dish): Dish {
  if (!snapshot) return live;
  return {
    ...live,
    cookedAt: live.cookedAt || snapshot.cookedAt,
    categories: live.categories.length ? live.categories : snapshot.categories,
    coverUrl: live.coverUrl || snapshot.coverUrl,
  };
}

export function overlayLiveDishes(snapshotDishes: Dish[], liveDishes: Dish[]): Dish[] {
  const byId = new Map(snapshotDishes.map((dish) => [dish.id, dish]));
  return liveDishes.map((dish) => overlayLiveDish(byId.get(dish.id), dish));
}

let cached: CatalogSnapshot | null = null;
let inflight: Promise<CatalogSnapshot> | null = null;

export function getCachedCatalog(): CatalogSnapshot | null {
  return cached;
}

export function setCachedCatalogForTests(value: CatalogSnapshot | null): void {
  cached = value;
  inflight = null;
}

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch(snapshotUrl("catalog.json"))
      .then(async (res) => {
        if (!res.ok) throw new Error(`snapshot ${res.status}`);
        const data: unknown = await res.json();
        const catalog = normalizeCatalog(data);
        cached = catalog;
        return catalog;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

if (typeof window !== "undefined") {
  void loadCatalogSnapshot().catch(() => {
    // Pages still call loadCatalogSnapshot; this only overlaps first paint.
  });
}
