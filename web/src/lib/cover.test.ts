import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  filenameFromCoverUrl,
  isWorkerMediaUrl,
  resolveCoverUrl,
} from "./cover";

test("filenameFromCoverUrl reads Pages, uploads, and relative covers", () => {
  assert.equal(
    filenameFromCoverUrl("https://averieh0202-maker.github.io/averie-cook/covers/2026-09-14-chicken-pumpkin-risotto.jpg"),
    "2026-09-14-chicken-pumpkin-risotto.jpg",
  );
  assert.equal(filenameFromCoverUrl("covers/2026-09-15-porcini-risotto.jpg"), "2026-09-15-porcini-risotto.jpg");
  assert.equal(
    filenameFromCoverUrl("https://averie-cook-api.averieh0202.workers.dev/api/media/abc.jpg"),
    "abc.jpg",
  );
});

test("isWorkerMediaUrl flags workers.dev and /api/media", () => {
  assert.equal(isWorkerMediaUrl("https://averie-cook-api.averieh0202.workers.dev/api/media/x.jpg"), true);
  assert.equal(isWorkerMediaUrl("/api/media/x.jpg"), true);
  assert.equal(isWorkerMediaUrl("https://averieh0202-maker.github.io/averie-cook/covers/x.jpg"), false);
  assert.equal(isWorkerMediaUrl("covers/x.jpg"), false);
});

test("resolveCoverUrl prefers Pages files and never returns workers.dev", () => {
  assert.equal(
    resolveCoverUrl({
      id: "2026-09-14-chicken-pumpkin-risotto",
      coverUrl: "https://averie-cook-api.averieh0202.workers.dev/api/media/2026-09-14-chicken-pumpkin-risotto.jpg",
    }),
    "/covers/2026-09-14-chicken-pumpkin-risotto.jpg",
  );
  assert.equal(
    resolveCoverUrl({ id: "2026-09-15-porcini-risotto", coverUrl: null }),
    "/covers/2026-09-15-porcini-risotto.jpg",
  );
  assert.equal(
    resolveCoverUrl({ id: "2026-09-16-beef-short-rib-rice", coverUrl: null }),
    "/covers/2026-09-16-beef-short-rib-rice.jpg",
  );
  assert.equal(
    resolveCoverUrl("https://averie-cook-api.averieh0202.workers.dev/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg"),
    null,
  );
  const resolved = resolveCoverUrl("covers/2026-09-14-chicken-pumpkin-risotto.jpg");
  assert.equal(resolved, "/covers/2026-09-14-chicken-pumpkin-risotto.jpg");
  assert.equal(resolved && isWorkerMediaUrl(resolved), false);
});

test("bundled home covers are JPEG files", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const name of [
    "2026-09-14-chicken-pumpkin-risotto.jpg",
    "2026-09-15-porcini-risotto.jpg",
    "2026-09-16-beef-short-rib-rice.jpg",
  ]) {
    const buf = readFileSync(join(root, "public/covers", name));
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
    assert.equal(buf[2], 0xff);
    assert.ok(buf.length > 10_000);
  }
});
