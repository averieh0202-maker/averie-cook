import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cookiePathFromBase,
  expireVisitorCookie,
  getVisitorKey,
  isVisitorKey,
  parseCookieValue,
  pickVisitorKey,
  resetVisitorIdentity,
  serializeVisitorCookie,
  setVisitorKey,
  VISITOR_COOKIE,
  VISITOR_KEY_STORAGE,
  _resetVisitorStateForTests,
  _setVisitorStoreForTests,
  type VisitorStore,
} from "./visitor";

function memoryStore(init?: { local?: string | null; cookie?: string | null; throwLocal?: boolean }): {
  store: VisitorStore;
  local: { value: string | null };
  cookie: { value: string | null };
} {
  const local = { value: init?.local ?? null };
  const cookie = { value: init?.cookie ?? null };
  const throwLocal = Boolean(init?.throwLocal);
  return {
    local,
    cookie,
    store: {
      readLocal() {
        if (throwLocal) throw new Error("blocked");
        return local.value;
      },
      writeLocal(value) {
        if (throwLocal) throw new Error("blocked");
        local.value = value;
      },
      clearLocal() {
        if (throwLocal) throw new Error("blocked");
        local.value = null;
      },
      readCookie() {
        return cookie.value;
      },
      writeCookie(value) {
        cookie.value = value;
      },
      clearCookie() {
        cookie.value = null;
      },
    },
  };
}

const SAMPLE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER = "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("isVisitorKey accepts UUID v4 and rejects garbage", () => {
  assert.equal(isVisitorKey(SAMPLE), true);
  assert.equal(isVisitorKey(SAMPLE.toUpperCase()), true);
  assert.equal(isVisitorKey("not-a-uuid"), false);
  assert.equal(isVisitorKey(""), false);
  assert.equal(isVisitorKey(null), false);
});

test("pickVisitorKey prefers valid localStorage then cookie; ignores junk", () => {
  assert.equal(pickVisitorKey(SAMPLE, OTHER), SAMPLE);
  assert.equal(pickVisitorKey("nope", OTHER), OTHER);
  assert.equal(pickVisitorKey(null, SAMPLE), SAMPLE);
  assert.equal(pickVisitorKey("nope", "also-nope"), null);
  assert.equal(pickVisitorKey(` ${SAMPLE.toUpperCase()} `, null), SAMPLE);
});

test("cookiePathFromBase uses Pages prefix or /", () => {
  assert.equal(cookiePathFromBase("/averie-cook/"), "/averie-cook");
  assert.equal(cookiePathFromBase("/averie-cook"), "/averie-cook");
  assert.equal(cookiePathFromBase("/"), "/");
  assert.equal(cookiePathFromBase(""), "/");
});

test("serializeVisitorCookie is first-party Lax with long max-age", () => {
  const encoded = serializeVisitorCookie(SAMPLE, "/averie-cook", true);
  assert.match(encoded, new RegExp(`^${VISITOR_COOKIE}=${SAMPLE}`));
  assert.match(encoded, /Path=\/averie-cook/);
  assert.match(encoded, /Max-Age=34560000/);
  assert.match(encoded, /SameSite=Lax/);
  assert.match(encoded, /Secure/);
  const parsed = parseCookieValue(`${VISITOR_COOKIE}=${SAMPLE}; other=1`, VISITOR_COOKIE);
  assert.equal(parsed, SAMPLE);
  const expired = expireVisitorCookie("/averie-cook", true);
  assert.match(expired, /Max-Age=0/);
});

test("getVisitorKey restores from local or cookie and writes back to both", () => {
  _resetVisitorStateForTests();
  const { store, local, cookie } = memoryStore({ cookie: SAMPLE });
  _setVisitorStoreForTests(store);
  assert.equal(getVisitorKey(), SAMPLE);
  assert.equal(local.value, SAMPLE);
  assert.equal(cookie.value, SAMPLE);
  assert.equal(getVisitorKey(), SAMPLE);
  _resetVisitorStateForTests();
});

test("getVisitorKey does not mint when localStorage throws if cookie is valid", () => {
  _resetVisitorStateForTests();
  const { store, cookie } = memoryStore({ cookie: SAMPLE, throwLocal: true });
  _setVisitorStoreForTests(store);
  assert.equal(getVisitorKey(), SAMPLE);
  assert.equal(cookie.value, SAMPLE);
  assert.equal(getVisitorKey(), SAMPLE);
  _resetVisitorStateForTests();
});

test("getVisitorKey mints once and reuses memory when storage is empty", () => {
  _resetVisitorStateForTests();
  const { store, local, cookie } = memoryStore();
  _setVisitorStoreForTests(store);
  const first = getVisitorKey();
  assert.equal(isVisitorKey(first), true);
  assert.equal(local.value, first);
  assert.equal(cookie.value, first);
  local.value = null;
  cookie.value = null;
  assert.equal(getVisitorKey(), first);
  _resetVisitorStateForTests();
});

test("setVisitorKey and resetVisitorIdentity replace the sticky id", () => {
  _resetVisitorStateForTests();
  const { store, local, cookie } = memoryStore();
  _setVisitorStoreForTests(store);
  assert.equal(setVisitorKey(SAMPLE), SAMPLE);
  assert.equal(local.value, SAMPLE);
  const guest = resetVisitorIdentity();
  assert.equal(isVisitorKey(guest), true);
  assert.notEqual(guest, SAMPLE);
  assert.equal(local.value, guest);
  assert.equal(cookie.value, guest);
  assert.notEqual(guest, VISITOR_KEY_STORAGE);
  _resetVisitorStateForTests();
});
