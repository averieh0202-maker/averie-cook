#!/usr/bin/env node
/**
 * Build anonymous dish snapshots for GitHub Pages.
 * Never writes recipe / notes / calories / ingredients / steps.
 *
 * Usage: node scripts/export-public-snapshot.mjs
 * Optional: AVERIE_API_BASE to overlay live ratings when reachable.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
];

const PUBLIC_DISH_KEYS = [
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

const COVER_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

export function repoRootFrom(metaUrl = import.meta.url) {
  return join(dirname(fileURLToPath(metaUrl)), "..");
}

export function jsonContainsPrivateTokens(payload) {
  const raw = JSON.stringify(payload);
  return PRIVATE_JSON_TOKENS.filter((token) => new RegExp(`"${token}"\\s*:`).test(raw));
}

export function assertPublicPayload(payload) {
  const hits = jsonContainsPrivateTokens(payload);
  if (hits.length) {
    throw new Error(`public payload leaked private keys: ${hits.join(", ")}`);
  }
}

function isSafeCoverFilename(name) {
  return /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/i.test(name);
}

export function listCoverFiles(coversDir) {
  try {
    return new Set(readdirSync(coversDir).filter((name) => isSafeCoverFilename(name)));
  } catch {
    return new Set();
  }
}

export function pagesCoverForDish(dishId, coverFiles) {
  if (!dishId) return null;
  for (const ext of COVER_EXTS) {
    const filename = `${dishId}${ext}`;
    if (coverFiles.has(filename)) return `covers/${filename}`;
  }
  return null;
}

export function categoryMap(categories) {
  const map = new Map();
  for (const cat of categories || []) {
    if (cat && typeof cat.id === "string") map.set(cat.id, { id: cat.id, name: String(cat.name || cat.id), sort: Number(cat.sort) || 0 });
  }
  return map;
}

function resolveCategories(rawIds, catalog) {
  if (!Array.isArray(rawIds)) return [];
  const out = [];
  for (const item of rawIds) {
    if (item && typeof item === "object" && typeof item.id === "string") {
      out.push(catalog.get(item.id) || { id: item.id, name: String(item.name || item.id), sort: Number(item.sort) || 0 });
      continue;
    }
    if (typeof item === "string" && catalog.has(item)) out.push(catalog.get(item));
  }
  return out;
}

function isoFromCookedAt(cookedAt) {
  if (typeof cookedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(cookedAt)) {
    return `${cookedAt.slice(0, 10)}T00:00:00.000Z`;
  }
  return "2026-09-17T00:00:00.000Z";
}

export function pickPublicDish(raw, catalog, coverFiles) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.title !== "string") {
    return null;
  }
  const status = raw.status === "want_cook" ? "want_cook" : "cooked";
  const cookedAt = typeof raw.cookedAt === "string" ? raw.cookedAt : null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : isoFromCookedAt(cookedAt);
  const coverUrl = pagesCoverForDish(raw.id, coverFiles);
  const ratingCount = Number(raw.ratingCount) || 0;
  const ratingAvg = ratingCount > 0 && raw.ratingAvg != null ? Math.round(Number(raw.ratingAvg) * 10) / 10 : null;
  const dish = {
    id: raw.id,
    title: raw.title,
    status,
    categories: resolveCategories(raw.categories, catalog),
    coverUrl,
    cookedAt,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null,
    sourceType: typeof raw.sourceType === "string" ? raw.sourceType : null,
    ratingAvg,
    ratingCount,
    wantEatCount: Number(raw.wantEatCount) || 0,
    myScore: null,
    wanted: false,
    published: raw.published === false ? false : true,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
  };
  const out = {};
  for (const key of PUBLIC_DISH_KEYS) out[key] = dish[key];
  return out;
}

export function dishesFromSeed(seed, coverFiles) {
  const catalog = categoryMap(seed.categories);
  const dishes = [];
  for (const row of seed.dishes || []) {
    const dish = pickPublicDish(row, catalog, coverFiles);
    if (dish) dishes.push(dish);
  }
  return { categories: [...catalog.values()].sort((a, b) => a.sort - b.sort), dishes };
}

function indexById(dishes) {
  const map = new Map();
  for (const dish of dishes) map.set(dish.id, dish);
  return map;
}

export function mergeLiveDishes(baseDishes, liveDishes, catalog, coverFiles) {
  const byId = indexById(baseDishes);
  for (const raw of liveDishes || []) {
    const live = pickPublicDish(raw, catalog, coverFiles);
    if (!live) continue;
    const prev = byId.get(live.id);
    byId.set(live.id, {
      ...live,
      coverUrl: live.coverUrl || prev?.coverUrl || null,
      ratingAvg: live.ratingCount > 0 ? live.ratingAvg : prev?.ratingAvg ?? null,
      ratingCount: live.ratingCount > 0 ? live.ratingCount : prev?.ratingCount ?? 0,
      wantEatCount: live.wantEatCount || prev?.wantEatCount || 0,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const ac = a.cookedAt || "";
    const bc = b.cookedAt || "";
    if (ac !== bc) return bc.localeCompare(ac);
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

export function applyPreviousRatings(dishes, previousDishes) {
  const prev = indexById(previousDishes || []);
  return dishes.map((dish) => {
    const last = prev.get(dish.id);
    if (!last) return dish;
    if (dish.ratingCount > 0) return dish;
    return {
      ...dish,
      ratingAvg: last.ratingAvg ?? null,
      ratingCount: last.ratingCount || 0,
      wantEatCount: dish.wantEatCount || last.wantEatCount || 0,
    };
  });
}

async function fetchLive(apiBase, timeoutMs) {
  if (!apiBase) return null;
  const base = apiBase.replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [cooked, wantCook, categories] = await Promise.all([
      fetch(`${base}/api/dishes?status=cooked`, { signal: ctrl.signal }),
      fetch(`${base}/api/dishes?status=want_cook`, { signal: ctrl.signal }),
      fetch(`${base}/api/categories`, { signal: ctrl.signal }),
    ]);
    if (!cooked.ok) return null;
    const cookedJson = await cooked.json();
    const wantCookJson = wantCook.ok ? await wantCook.json() : { dishes: [] };
    const catJson = categories.ok ? await categories.json() : { categories: [] };
    return {
      dishes: [...(cookedJson.dishes || []), ...(wantCookJson.dishes || [])],
      categories: catJson.categories || [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function exportSnapshot(root = repoRootFrom(), options = {}) {
  const apiBase =
    options.apiBase ??
    process.env.AVERIE_API_BASE ??
    process.env.VITE_API_BASE_URL ??
    "https://averie-cook-api.averieh0202.workers.dev";
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchLiveCatalog = options.fetchLive ?? fetchLive;

  const seed = readJson(join(root, "data/seed.json"));
  if (!seed) throw new Error("missing data/seed.json");
  const coverFiles = listCoverFiles(join(root, "web/public/covers"));
  const fromSeed = dishesFromSeed(seed, coverFiles);
  const previous = readJson(join(root, "web/public/data/catalog.json"));

  let categories = fromSeed.categories;
  let dishes = applyPreviousRatings(fromSeed.dishes, previous?.dishes);

  const live = await fetchLiveCatalog(apiBase, timeoutMs);
  let source = "seed";
  if (live) {
    const liveCatalog = live.categories?.length ? categoryMap(live.categories) : categoryMap(categories);
    if (live.categories?.length) {
      categories = [...liveCatalog.values()].sort((a, b) => a.sort - b.sort);
    }
    dishes = mergeLiveDishes(dishes, live.dishes, liveCatalog, coverFiles);
    source = "seed+live";
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    source,
    categories,
    dishes,
  };
  assertPublicPayload(catalog);
  for (const dish of dishes) {
    if (typeof dish.coverUrl === "string" && /workers\.dev|\/api\/media\//i.test(dish.coverUrl)) {
      throw new Error(`snapshot coverUrl must not point at Worker media: ${dish.id} ${dish.coverUrl}`);
    }
  }

  const cooked = dishes.filter((d) => d.status === "cooked");
  const wantCook = dishes.filter((d) => d.status === "want_cook");
  const cookedOut = { generatedAt: catalog.generatedAt, source, dishes: cooked };
  const wantCookOut = { generatedAt: catalog.generatedAt, source, dishes: wantCook };
  assertPublicPayload(cookedOut);
  assertPublicPayload(wantCookOut);

  writeJson(join(root, "web/public/data/catalog.json"), catalog);
  writeJson(join(root, "web/public/data/dishes-cooked.json"), cookedOut);
  writeJson(join(root, "web/public/data/dishes-want-cook.json"), wantCookOut);
  return catalog;
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  exportSnapshot()
    .then((catalog) => {
      const cooked = catalog.dishes.filter((d) => d.status === "cooked").length;
      console.log(`Wrote public snapshot (${catalog.source}): ${cooked} cooked, ${catalog.dishes.length} total`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
