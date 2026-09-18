import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { jsonContainsPrivateTokens } from "./privacy";
import { dishesForStatus, findSnapshotDish, normalizeCatalog, overlayLiveDish, pickPublicDish } from "./snapshot";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("pickPublicDish drops recipe fields and visitor-specific scores", () => {
  const dish = pickPublicDish({
    id: "x",
    title: "测试菜",
    status: "cooked",
    categories: [{ id: "chinese", name: "中式", sort: 3 }],
    coverUrl: "covers/x.svg",
    cookedAt: "2026-09-16",
    ratingAvg: 8,
    ratingCount: 1,
    myScore: 9,
    wanted: true,
    recipe: { summary: "secret", steps: ["do not leak"] },
    coverPath: "covers/secret.jpg",
  });
  assert.ok(dish);
  assert.equal(dish.myScore, null);
  assert.equal(dish.wanted, false);
  assert.equal("recipe" in dish, false);
  assert.deepEqual(jsonContainsPrivateTokens({ dish }), []);
});

test("normalizeCatalog and status filters", () => {
  const catalog = normalizeCatalog({
    generatedAt: "2026-09-18T00:00:00.000Z",
    categories: [{ id: "beef", name: "牛肉", sort: 5 }],
    dishes: [
      {
        id: "a",
        title: "卤肉饭",
        status: "cooked",
        categories: [{ id: "beef", name: "牛肉", sort: 5 }],
        cookedAt: "2026-09-16",
        ratingAvg: 8,
        ratingCount: 1,
        wantEatCount: 2,
      },
      {
        id: "b",
        title: "想做面",
        status: "want_cook",
        categories: [],
        wantEatCount: 0,
      },
    ],
  });
  assert.equal(dishesForStatus(catalog.dishes, "cooked").length, 1);
  assert.equal(dishesForStatus(catalog.dishes, "want_cook")[0].id, "b");
  assert.equal(dishesForStatus(catalog.dishes, "want_eat")[0].id, "a");
  assert.equal(findSnapshotDish(catalog.dishes, "a")?.title, "卤肉饭");
});

test("committed Pages snapshot is anonymous and has covers", () => {
  const catalog = JSON.parse(readFileSync(join(root, "web/public/data/catalog.json"), "utf8"));
  const cooked = JSON.parse(readFileSync(join(root, "web/public/data/dishes-cooked.json"), "utf8"));
  assert.deepEqual(jsonContainsPrivateTokens(catalog), []);
  assert.deepEqual(jsonContainsPrivateTokens(cooked), []);
  assert.equal(cooked.dishes.length, 3);
  const ids = cooked.dishes.map((d: { id: string }) => d.id).sort();
  assert.deepEqual(ids, [
    "2026-09-14-chicken-pumpkin-risotto",
    "2026-09-15-porcini-risotto",
    "2026-09-16-beef-short-rib-rice",
  ].sort());
  for (const dish of cooked.dishes) {
    assert.equal(typeof dish.title, "string");
    assert.ok(dish.coverUrl && String(dish.coverUrl).startsWith("covers/"));
    assert.equal(dish.coverUrl.includes("workers.dev"), false);
    assert.equal(dish.myScore, null);
    assert.equal(dish.wanted, false);
    assert.ok(!("recipe" in dish));
  }
  const risotto = cooked.dishes.find((d: { id: string }) => d.id === "2026-09-14-chicken-pumpkin-risotto");
  assert.ok(risotto.ratingAvg);
  assert.ok(risotto.ratingCount >= 1);
  assert.equal(risotto.cookedAt, "2026-09-14");
  assert.ok(Array.isArray(risotto.categories) && risotto.categories.length > 0);
  for (const dish of cooked.dishes) {
    assert.equal(typeof dish.cookedAt, "string");
    assert.match(dish.cookedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("overlayLiveDish keeps snapshot cookedAt and categories when live wiped them", () => {
  const snap = pickPublicDish({
    id: "2026-09-14-chicken-pumpkin-risotto",
    title: "意式鸡肉南瓜烩饭",
    status: "cooked",
    categories: [{ id: "italian", name: "意式", sort: 1 }],
    cookedAt: "2026-09-14",
    coverUrl: "covers/2026-09-14-chicken-pumpkin-risotto.jpg",
  });
  assert.ok(snap);
  const live = pickPublicDish({
    id: "2026-09-14-chicken-pumpkin-risotto",
    title: "意式鸡肉南瓜烩饭",
    status: "cooked",
    categories: [],
    cookedAt: null,
    coverUrl: "/api/media/new.jpg",
    ratingAvg: 8.8,
    ratingCount: 4,
  });
  assert.ok(live);
  const merged = overlayLiveDish(snap, live);
  assert.equal(merged.cookedAt, "2026-09-14");
  assert.equal(merged.categories.length, 1);
  assert.equal(merged.categories[0].id, "italian");
  assert.equal(merged.ratingCount, 4);
  assert.equal(merged.coverUrl, "/api/media/new.jpg");
});
