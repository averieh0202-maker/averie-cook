import { tokenFromAuthorization, verifyOwnerSession, verifyRaterSession } from "./auth";
import { parseRatingScore } from "./dto";
import { issueRaterToken } from "./account";
import { sign } from "hono/jwt";
import { test } from "node:test";
import assert from "node:assert/strict";

test("tokenFromAuthorization reads Bearer tokens only", () => {
  assert.equal(tokenFromAuthorization("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(tokenFromAuthorization("bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(tokenFromAuthorization("Basic abc"), null);
  assert.equal(tokenFromAuthorization(""), null);
  assert.equal(tokenFromAuthorization(undefined), null);
});

test("verifyOwnerSession accepts owner JWT and rejects garbage", async () => {
  const secret = "test-session-secret-16";
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ sub: "owner", iat: now, exp: now + 60 }, secret, "HS256");
  assert.equal(await verifyOwnerSession(token, secret), true);
  assert.equal(await verifyOwnerSession(token, "other-session-secret"), false);
  assert.equal(await verifyOwnerSession("not-a-jwt", secret), false);
  assert.equal(await verifyOwnerSession("", secret), false);
  const visitor = await sign({ sub: "visitor", iat: now, exp: now + 60 }, secret, "HS256");
  assert.equal(await verifyOwnerSession(visitor, secret), false);
});

test("verifyRaterSession accepts rater JWT and rejects owner/garbage", async () => {
  const secret = "test-session-secret-16";
  const vk = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const token = await issueRaterToken(secret, vk, "小明");
  const got = await verifyRaterSession(token, secret);
  assert.deepEqual(got, { visitorKey: vk, displayName: "小明" });
  assert.equal(await verifyRaterSession(token, "other-session-secret-16"), null);
  const owner = await sign(
    { sub: "owner", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 },
    secret,
    "HS256",
  );
  assert.equal(await verifyRaterSession(owner, secret), null);
});

test("parseRatingScore accepts 1–10 integers only", () => {
  assert.equal(parseRatingScore(1), 1);
  assert.equal(parseRatingScore(10), 10);
  assert.equal(parseRatingScore(6), 6);
  assert.equal(parseRatingScore(0), null);
  assert.equal(parseRatingScore(11), null);
  assert.equal(parseRatingScore(4.5), null);
  assert.equal(parseRatingScore("8"), 8);
  assert.equal(parseRatingScore("nope"), null);
});
