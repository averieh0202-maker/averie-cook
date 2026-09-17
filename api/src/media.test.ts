import assert from "node:assert/strict";
import { test } from "node:test";
import { isMediaFilename, sniffImage } from "./media";

test("isMediaFilename accepts seed and uuid covers", () => {
  assert.equal(isMediaFilename("2026-09-14-chicken-pumpkin-risotto.jpg"), true);
  assert.equal(isMediaFilename("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png"), true);
  assert.equal(isMediaFilename("../x.jpg"), false);
  assert.equal(isMediaFilename("x.gif"), false);
});

test("sniffImage reads JPEG magic", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffImage(jpeg)?.mime, "image/jpeg");
  assert.equal(sniffImage(new Uint8Array([1, 2, 3, 4])), null);
});
