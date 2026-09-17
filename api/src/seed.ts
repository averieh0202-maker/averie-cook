import risottoCover from "./assets/2026-09-14-chicken-pumpkin-risotto.jpg";
import type { Category } from "./dto";
import type { Env } from "./env";
import { putMedia, SEED_COVER_FILENAME, SEED_COVER_PATH } from "./media";

export const SEED_CATEGORIES: Category[] = [
  { id: "italian", name: "意式", sort: 1 },
  { id: "risotto", name: "烩饭", sort: 2 },
  { id: "chinese", name: "中式", sort: 3 },
  { id: "braise", name: "卤煮", sort: 4 },
  { id: "beef", name: "牛肉", sort: 5 },
  { id: "chicken", name: "鸡肉", sort: 6 },
  { id: "mushroom", name: "菌菇", sort: 7 },
  { id: "staple", name: "主食", sort: 8 },
];

type SeedDish = {
  id: string;
  title: string;
  status: "cooked" | "want_cook";
  categories: string[];
  cookedAt?: string;
  coverPath?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  recipe: Record<string, unknown>;
};

export const SEED_DISHES: SeedDish[] = [
  {
    id: "2026-09-14-chicken-pumpkin-risotto",
    title: "意式鸡肉南瓜烩饭",
    status: "cooked",
    categories: ["italian", "risotto", "chicken"],
    cookedAt: "2026-09-14",
    coverPath: SEED_COVER_PATH,
    recipe: {
      summary: "Arborio 鸡肉南瓜烩饭第一版；浓稠与南瓜软糯有改进空间。",
      ingredients: [
        "Arborio 150g",
        "鸡腿骨高汤材料与约2L水",
        "贝贝南瓜（第二批；第一批糊弃）",
        "总统黄油收尾30g（下次20g）",
        "帕马森适量",
      ],
      steps: ["熬高汤；烤南瓜", "煎鸡盛出；炒洋葱煸米", "分次加汤约650ml（偏多）", "帕马森+黄油收尾"],
      tasting: "略咸；乳状浓稠不足；南瓜干烤不软糯",
      improvements: [
        "汤量450–500ml/150g",
        "盐后置；黄油20g",
        "南瓜小丁同煨或半压泥",
        "鸡肉倒数第二勺汤回锅",
      ],
    },
  },
  {
    id: "2026-09-15-porcini-risotto",
    title: "牛肝菌意式烩饭",
    status: "cooked",
    categories: ["italian", "risotto", "mushroom"],
    cookedAt: "2026-09-15",
    coverPath: null,
    recipe: {
      summary: "培根+牛肝菌；熟度与黄油比例获认可。",
      ingredients: [
        "Arborio 150g",
        "薄培根约6片",
        "蒜2瓣",
        "牛肝菌170g",
        "浓缩高汤50ml+水550ml",
        "总统黄油约20g + 帕马森",
      ],
      steps: ["培根煎至边缘焦香", "菌炒软出汁后煸米至边缘透明", "分次加汤约550ml", "离火黄油+帕马森"],
      tasting: "略有硬芯刚好；黄油20g刚好；盐约一半已够",
    },
  },
  {
    id: "2026-09-16-beef-short-rib-rice",
    title: "牛肋条卤肉饭",
    status: "cooked",
    categories: ["chinese", "braise", "beef", "staple"],
    cookedAt: "2026-09-16",
    coverPath: null,
    recipe: {
      summary: "略咸；下次生抽/老抽/味醂/冰糖均减半（冰糖10g）。",
      ingredients_v1: "生抽50 老抽15 味醂30 冰糖20 + 黄豆酱1勺等",
      ingredients_v2_next: "生抽25 老抽约8 味醂15 冰糖10；黄豆酱暂1勺",
      steps: ["肋条煎上色", "洋葱微焦+香菇+肉", "调料后开水炖软收汁"],
      tasting: "稍微有点咸",
    },
  },
];

function coverBytes(): Uint8Array {
  return risottoCover instanceof Uint8Array ? risottoCover : new Uint8Array(risottoCover);
}

let seeded = false;

/**
 * Idempotent. Never overwrites existing dish rows (recipes/ratings stay after redeploy).
 * Empty D1 gets the 3 seed dishes + risotto cover blob.
 */
export async function ensureSeed(env: Env): Promise<void> {
  if (seeded) return;
  const catStmts = SEED_CATEGORIES.map((cat) =>
    env.DB.prepare(
      "INSERT INTO categories (id, name, sort) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
    ).bind(cat.id, cat.name, cat.sort),
  );
  await env.DB.batch(catStmts);

  const now = new Date().toISOString();
  const dishStmts = SEED_DISHES.map((dish) =>
    env.DB.prepare(
      `INSERT INTO dishes (
        id, title, status, categories, cover_path, cooked_at, source_url, source_type,
        recipe, published, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
    ).bind(
      dish.id,
      dish.title,
      dish.status,
      JSON.stringify(dish.categories),
      dish.coverPath ?? null,
      dish.cookedAt ?? null,
      dish.sourceUrl ?? null,
      dish.sourceType ?? null,
      JSON.stringify(dish.recipe),
      now,
      now,
    ),
  );
  await env.DB.batch(dishStmts);

  await putMedia(env, SEED_COVER_FILENAME, coverBytes(), "image/jpeg");

  // Point the seed risotto at durable Worker media if it still referenced Pages static files.
  await env.DB.prepare(
    `UPDATE dishes SET cover_path = ?
     WHERE id = ? AND (cover_path IS NULL OR cover_path LIKE 'uploads/%')`,
  )
    .bind(SEED_COVER_PATH, "2026-09-14-chicken-pumpkin-risotto")
    .run();
  seeded = true;
}
