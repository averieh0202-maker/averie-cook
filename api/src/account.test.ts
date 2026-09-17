import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPin, normalizeDisplayName, parsePin } from "./account";

test("normalizeDisplayName trims and rejects empty or oversized names", () => {
  assert.equal(normalizeDisplayName("  小明  "), "小明");
  assert.equal(normalizeDisplayName("Averie"), "Averie");
  assert.equal(normalizeDisplayName("a".repeat(16)), "a".repeat(16));
  assert.equal(normalizeDisplayName("a".repeat(17)), null);
  assert.equal(normalizeDisplayName("   "), null);
  assert.equal(normalizeDisplayName(""), null);
  assert.equal(normalizeDisplayName(12), null);
  assert.equal(normalizeDisplayName("多   空格"), "多 空格");
});

test("parsePin accepts 4–6 digits only", () => {
  assert.equal(parsePin("1234"), "1234");
  assert.equal(parsePin("123456"), "123456");
  assert.equal(parsePin(1234), "1234");
  assert.equal(parsePin("123"), null);
  assert.equal(parsePin("1234567"), null);
  assert.equal(parsePin("12ab"), null);
  assert.equal(parsePin(""), null);
  assert.equal(parsePin(" 1234 "), "1234");
});

test("hashPin is deterministic and name-scoped; never equals the raw PIN", async () => {
  const secret = "test-session-secret-16";
  const a = await hashPin("1234", "xiaoming", secret);
  const b = await hashPin("1234", "xiaoming", secret);
  const otherName = await hashPin("1234", "averie", secret);
  const otherPin = await hashPin("9999", "xiaoming", secret);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(a, "1234");
  assert.notEqual(a, otherName);
  assert.notEqual(a, otherPin);
  assert.match(a, /^[0-9a-f]+$/);
});
