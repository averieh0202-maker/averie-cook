import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPublicPayload,
  dishesFromSeed,
  jsonContainsPrivateTokens,
  mergeLiveDishes,
  pagesCoverForDish,
  pickPublicDish,
} from "./export-public-snapshot.mjs";

const coverFiles = new Set([
  "2026-09-14-chicken-pumpkin-risotto.jpg",
  "2026-09-15-porcini-risotto.svg",
  "2026-09-16-beef-short-rib-rice.svg",
]);

const seed = {
  categories: [{ id: "italian", name: "意式", sort: 1 }],
  dishes: [
    {
      id: "2026-09-14-chicken-pumpkin-risotto",
      title: "意式鸡肉南瓜烩饭",
      status: "cooked",
      categories: ["italian"],
      cookedAt: "2026-09-14",
      recipe: { summary: "secret", steps: ["熬高汤"], ingredients: ["Arborio"] },
    },
  ],
};

test("seed snapshot strips recipes and uses Pages covers", () => {
  const { dishes } = dishesFromSeed(seed, coverFiles);
  assert.equal(dishes.length, 1);
  assert.equal(dishes[0].coverUrl, "covers/2026-09-14-chicken-pumpkin-risotto.jpg");
  assert.equal(dishes[0].myScore, null);
  assert.deepEqual(jsonContainsPrivateTokens({ dishes }), []);
  assert.doesNotThrow(() => assertPublicPayload({ dishes }));
  const raw = JSON.stringify(dishes);
  assert.equal(raw.includes("Arborio"), false);
  assert.equal(raw.includes("熬高汤"), false);
  assert.equal(raw.includes("secret"), false);
});

test("live overlay copies ratings but never Worker media URLs", () => {
  const catalog = new Map([["italian", { id: "italian", name: "意式", sort: 1 }]]);
  const base = [
    pickPublicDish(seed.dishes[0], catalog, coverFiles),
    pickPublicDish(
      {
        id: "2026-09-15-porcini-risotto",
        title: "牛肝菌意式烩饭",
        status: "cooked",
        categories: ["italian"],
        cookedAt: "2026-09-15",
      },
      catalog,
      coverFiles,
    ),
  ].filter(Boolean);
  const merged = mergeLiveDishes(
    base,
    [
      {
        id: "2026-09-14-chicken-pumpkin-risotto",
        title: "意式鸡肉南瓜烩饭",
        status: "cooked",
        categories: [{ id: "italian", name: "意式", sort: 1 }],
        coverUrl: "https://averie-cook-api.averieh0202.workers.dev/api/media/2026-09-14-chicken-pumpkin-risotto.jpg",
        cookedAt: "2026-09-14",
        ratingAvg: 8.7,
        ratingCount: 3,
        wantEatCount: 0,
        myScore: 10,
        wanted: true,
        recipe: { summary: "nope" },
      },
    ],
    catalog,
    coverFiles,
  );
  const risotto = merged.find((d) => d.id === "2026-09-14-chicken-pumpkin-risotto");
  assert.equal(risotto.ratingAvg, 8.7);
  assert.equal(risotto.ratingCount, 3);
  assert.equal(risotto.myScore, null);
  assert.equal(risotto.wanted, false);
  assert.equal(risotto.coverUrl, "covers/2026-09-14-chicken-pumpkin-risotto.jpg");
  assert.equal(pagesCoverForDish("2026-09-15-porcini-risotto", coverFiles), "covers/2026-09-15-porcini-risotto.svg");
  assert.deepEqual(jsonContainsPrivateTokens({ dishes: merged }), []);
});

test("live overlay keeps seed cookedAt and categories when API sent null/empty", () => {
  const catalog = new Map([["italian", { id: "italian", name: "意式", sort: 1 }]]);
  const base = [
    pickPublicDish(seed.dishes[0], catalog, coverFiles),
  ].filter(Boolean);
  const merged = mergeLiveDishes(
    base,
    [
      {
        id: "2026-09-14-chicken-pumpkin-risotto",
        title: "意式鸡肉南瓜烩饭",
        status: "cooked",
        categories: [],
        cookedAt: null,
        ratingAvg: 8.8,
        ratingCount: 4,
      },
    ],
    catalog,
    coverFiles,
  );
  const risotto = merged.find((d) => d.id === "2026-09-14-chicken-pumpkin-risotto");
  assert.equal(risotto.cookedAt, "2026-09-14");
  assert.equal(risotto.categories[0].id, "italian");
  assert.equal(risotto.ratingAvg, 8.8);
});
