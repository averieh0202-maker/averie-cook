import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISH_UPDATE_SQL,
  ingestInsertBinds,
  ingestUpdateBinds,
  parseIngestBody,
} from "./ingest";

test("UPDATE SQL uses COALESCE so omitted fields are not wiped", () => {
  assert.match(DISH_UPDATE_SQL, /cooked_at=COALESCE\(\?, cooked_at\)/);
  assert.match(DISH_UPDATE_SQL, /categories=COALESCE\(\?, categories\)/);
  assert.match(DISH_UPDATE_SQL, /source_url=COALESCE\(\?, source_url\)/);
  assert.match(DISH_UPDATE_SQL, /source_type=COALESCE\(\?, source_type\)/);
  assert.match(DISH_UPDATE_SQL, /cover_path=COALESCE\(\?, cover_path\)/);
  assert.match(DISH_UPDATE_SQL, /recipe=COALESCE\(\?, recipe\)/);
  assert.match(DISH_UPDATE_SQL, /title=COALESCE\(\?, title\)/);
});

test("cover-only ingest on an existing dish omits cookedAt and categories", () => {
  const parsed = parseIngestBody(
    {
      id: "2026-09-14-chicken-pumpkin-risotto",
      title: "意式鸡肉南瓜烩饭",
      status: "cooked",
      coverPath: "covers/f6004f48-3251-4d43-ac82-f549bee11c83.jpg",
    },
    true,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.cookedAt, null);
  assert.equal(parsed.value.categoriesJson, null);
  assert.equal(parsed.value.sourceUrl, null);
  assert.equal(parsed.value.recipeJson, null);
  assert.equal(parsed.value.coverPath, "covers/f6004f48-3251-4d43-ac82-f549bee11c83.jpg");

  const binds = ingestUpdateBinds(parsed.value, "2026-09-18T00:00:00.000Z");
  assert.equal(binds[4], null, "cooked_at bind is NULL so COALESCE keeps the stored date");
  assert.equal(binds[2], null, "categories bind is NULL so COALESCE keeps stored tags");
  assert.equal(binds[3], "covers/f6004f48-3251-4d43-ac82-f549bee11c83.jpg");
});

test("provided cookedAt and categories are written on update", () => {
  const parsed = parseIngestBody(
    {
      id: "2026-09-14-chicken-pumpkin-risotto",
      cookedAt: "2026-09-14",
      categories: ["italian", "risotto", "chicken"],
    },
    true,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.cookedAt, "2026-09-14");
  assert.equal(parsed.value.categoriesJson, JSON.stringify(["italian", "risotto", "chicken"]));
  assert.equal(parsed.value.title, null);
  assert.equal(parsed.value.status, null);
});

test("new dishes still require title and status", () => {
  const missingTitle = parseIngestBody({ id: "new-dish", status: "cooked" }, false);
  assert.equal(missingTitle.ok, false);
  const missingStatus = parseIngestBody({ id: "new-dish", title: "新菜" }, false);
  assert.equal(missingStatus.ok, false);
  const ok = parseIngestBody({ id: "new-dish", title: "新菜", status: "want_cook" }, false);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  const binds = ingestInsertBinds(ok.value, "2026-09-18T00:00:00.000Z");
  assert.equal(binds[1], "新菜");
  assert.equal(binds[2], "want_cook");
  assert.equal(binds[3], "[]");
  assert.equal(binds[5], null);
});
