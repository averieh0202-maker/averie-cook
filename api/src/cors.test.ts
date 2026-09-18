import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedOrigin, resolveAssetBase } from "./cors";

test("CORS allows github.io, pages.dev production, and local Vite", () => {
  assert.equal(isAllowedOrigin("https://averieh0202-maker.github.io"), true);
  assert.equal(isAllowedOrigin("https://averie-cook.pages.dev"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin(""), false);
});

test("CORS allows Cloudflare Pages preview origins", () => {
  assert.equal(isAllowedOrigin("https://abc123def.averie-cook.pages.dev"), true);
  assert.equal(isAllowedOrigin("https://a-b-c.averie-cook.pages.dev"), true);
  assert.equal(isAllowedOrigin("https://other-project.pages.dev"), false);
  assert.equal(isAllowedOrigin("https://averie-cook.pages.dev.evil.com"), false);
});

test("CORS allows the request's own origin (same-origin Pages / pages dev)", () => {
  assert.equal(
    isAllowedOrigin("https://averie-cook-xyz.pages.dev", "https://averie-cook-xyz.pages.dev/api/dishes"),
    true,
  );
  assert.equal(
    isAllowedOrigin("http://127.0.0.1:8788", "http://127.0.0.1:8788/api/account/login"),
    true,
  );
  assert.equal(
    isAllowedOrigin("https://evil.example", "https://averie-cook.pages.dev/api/dishes"),
    false,
  );
});

test("asset base uses pages.dev origin so covers stay same-host", () => {
  assert.equal(
    resolveAssetBase("https://averieh0202-maker.github.io/averie-cook", "https://averie-cook.pages.dev/api/dishes"),
    "https://averie-cook.pages.dev",
  );
  assert.equal(
    resolveAssetBase(
      "https://averieh0202-maker.github.io/averie-cook",
      "https://averie-cook-api.averieh0202.workers.dev/api/dishes",
    ),
    "https://averieh0202-maker.github.io/averie-cook",
  );
});
