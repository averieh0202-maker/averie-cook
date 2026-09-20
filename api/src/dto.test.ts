import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPublicPayload,
  buildCoverUrl,
  jsonContainsPrivateTokens,
  parseRatingScore,
  pickPublicKeys,
  sanitizeCoverPath,
  toOwnerDish,
  toPublicDish,
  type Category,
  type DishRow,
} from "./dto";

const catalog = new Map<string, Category>([
  ["italian", { id: "italian", name: "意式", sort: 1 }],
  ["risotto", { id: "risotto", name: "烩饭", sort: 2 }],
  ["chicken", { id: "chicken", name: "鸡肉", sort: 6 }],
]);

function sampleRow(): DishRow {
  return {
    id: "2026-09-14-chicken-pumpkin-risotto",
    title: "意式鸡肉南瓜烩饭",
    status: "cooked",
    categories: JSON.stringify(["italian", "risotto", "chicken"]),
    cover_path: "uploads/2026-09-14-chicken-pumpkin-risotto.jpg",
    cooked_at: "2026-09-14",
    source_url: null,
    source_type: null,
    recipe: JSON.stringify({
      summary: "secret",
      ingredients: ["Arborio 150g"],
      steps: ["熬高汤"],
      tasting: "略咸",
      improvements: ["汤量减少"],
      calories: 999,
      notes: "private",
    }),
    published: 1,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    rating_sum: 16,
    rating_count: 2,
    want_eat_count: 3,
    my_score: 8,
    wanted: 1,
  };
}

test("sanitizeCoverPath rejects traversal and schemes", () => {
  assert.equal(sanitizeCoverPath("uploads/ok.jpg"), "uploads/ok.jpg");
  assert.equal(sanitizeCoverPath("covers/abc.jpg"), "covers/abc.jpg");
  assert.equal(sanitizeCoverPath("../etc/passwd"), null);
  assert.equal(sanitizeCoverPath("uploads/../../secret"), null);
  assert.equal(sanitizeCoverPath("https://evil.test/x.jpg"), null);
  assert.equal(sanitizeCoverPath("/uploads/ok.jpg"), "uploads/ok.jpg");
  assert.equal(sanitizeCoverPath("uploads/nested/x.jpg"), null);
});

test("public DTO never contains recipe or private keys", () => {
  const row = sampleRow();
  const dish = pickPublicKeys(
    toPublicDish(row, catalog, "https://averieh0202-maker.github.io/averie-cook", "https://api.example"),
  );
  assert.equal(dish.ratingAvg, 8);
  assert.equal(dish.coverUrl, "https://averieh0202-maker.github.io/averie-cook/covers/2026-09-14-chicken-pumpkin-risotto.jpg");
  assert.deepEqual(
    dish.categories.map((c) => c.name),
    ["意式", "烩饭", "鸡肉"],
  );
  assert.equal("recipe" in dish, false);
  const leaked = jsonContainsPrivateTokens({ dish });
  assert.deepEqual(leaked, []);
  assert.doesNotThrow(() => assertPublicPayload({ dish }));
  const raw = JSON.stringify({ dish });
  assert.equal(raw.includes("Arborio"), false);
  assert.equal(raw.includes("熬高汤"), false);
  assert.equal(raw.includes("secret"), false);
});

test("owner DTO includes recipe after authentication", () => {
  const dish = toOwnerDish(
    sampleRow(),
    catalog,
    "https://averieh0202-maker.github.io/averie-cook",
    "https://api.example",
  );
  assert.ok(dish.recipe);
  assert.equal((dish.recipe as { summary?: string }).summary, "secret");
  assert.equal(dish.coverPath, "uploads/2026-09-14-chicken-pumpkin-risotto.jpg");
});

test("owner DTO rating stays on the 1–10 scale", () => {
  const dish = toOwnerDish(
    sampleRow(),
    catalog,
    "https://averieh0202-maker.github.io/averie-cook",
    "https://api.example",
  );
  assert.equal(dish.myScore, 8);
  assert.equal(dish.ratingAvg, 8);
  assert.equal(parseRatingScore(10), 10);
  assert.equal(parseRatingScore(5), 5);
});

test("buildCoverUrl routes KV covers through the API origin", () => {
  assert.equal(
    buildCoverUrl("covers/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg", "https://pages.example/averie-cook", "https://api.example"),
    "https://api.example/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg",
  );
  assert.equal(buildCoverUrl("../x", "https://a", "https://b"), null);
});

test("buildCoverUrl serves bundled seed covers from Pages, not workers.dev", () => {
  assert.equal(
    buildCoverUrl(
      "covers/2026-09-14-chicken-pumpkin-risotto.jpg",
      "https://averieh0202-maker.github.io/averie-cook",
      "https://averie-cook-api.averieh0202.workers.dev",
    ),
    "https://averieh0202-maker.github.io/averie-cook/covers/2026-09-14-chicken-pumpkin-risotto.jpg",
  );
  assert.equal(
    buildCoverUrl(
      "uploads/2026-09-14-chicken-pumpkin-risotto.jpg",
      "https://averieh0202-maker.github.io/averie-cook",
      "https://api.example",
    ),
    "https://averieh0202-maker.github.io/averie-cook/covers/2026-09-14-chicken-pumpkin-risotto.jpg",
  );
  assert.equal(
    buildCoverUrl(
      "covers/2026-09-15-porcini-risotto.jpg",
      "https://averieh0202-maker.github.io/averie-cook",
      "https://averie-cook-api.averieh0202.workers.dev",
    ),
    "https://averieh0202-maker.github.io/averie-cook/covers/2026-09-15-porcini-risotto.jpg",
  );
});
