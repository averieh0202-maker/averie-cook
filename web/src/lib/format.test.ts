import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCookedAt, formatScore10 } from "./format";
import { homepageRatingState } from "./rating-ui";

test("formatCookedAt renders Chinese calendar dates", () => {
  assert.equal(formatCookedAt("2026-09-14"), "2026年9月14日");
  assert.equal(formatCookedAt("2026-09-14T00:00:00.000Z"), "2026年9月14日");
  assert.equal(formatCookedAt(" 2026-12-01 "), "2026年12月1日");
});

test("formatScore10 keeps one decimal on the 10-point scale", () => {
  assert.equal(formatScore10(8.7), "8.7");
  assert.equal(formatScore10(null), "—");
});

test("homepage ScorePicker is hidden after this visitor has rated", () => {
  assert.deepEqual(homepageRatingState(null), {
    showPicker: true,
    caption: "点选 1–10 分（每人一票）",
  });
  assert.deepEqual(homepageRatingState(8), {
    showPicker: false,
    caption: "你评了 8 分",
  });
});
