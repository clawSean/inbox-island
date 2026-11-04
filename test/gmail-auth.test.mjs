import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createGmailAuth, GMAIL_READONLY_SCOPE, TOKEN_LEASE_MILLISECONDS,
} from "../app/gmail-auth.mjs";

const TOKEN = "chrome-extension-token-that-must-not-leak";

function result(token = TOKEN, scopes = [GMAIL_READONLY_SCOPE]) {
  return { grantedScopes: scopes, token };
}

function harness({ clearAll, clock = Date.now, getToken, removeToken } = {}) {
  const calls = [];
  const identityApi = {
    clearAllCachedAuthTokens() {
      calls.push(["clear-all"]);
      return clearAll ? clearAll() : Promise.resolve();
    },
    getAuthToken(options) {
      calls.push(["get", structuredClone(options)]);
      return getToken ? getToken(options, calls.filter(([kind]) => kind === "get").length)
        : Promise.resolve(result());
    },
    removeCachedAuthToken(options) {
      calls.push(["remove", structuredClone(options)]);
      return removeToken ? removeToken(options) : Promise.resolve();
    },
  };
  return { auth: createGmailAuth({ clock, identityApi }), calls };
}

test("Chrome identity requests only gmail.readonly with granular interactive consent", async () => {
  const { auth, calls } = harness();
  const credential = await auth.connectFromUserGesture();
  assert.equal(credential.token, TOKEN);
  assert.deepEqual(calls[0], ["get", {
    enableGranularPermissions: true,
    interactive: true,
    scopes: [GMAIL_READONLY_SCOPE],
  }]);
});

test("getAuthToken starts synchronously in the user click turn", async () => {
  let finish;
  const { auth, calls } = harness({
    getToken: () => new Promise((resolve) => { finish = () => resolve(result()); }),
  });
  const connecting = auth.connectFromUserGesture();
  assert.equal(calls.filter(([kind]) => kind === "get").length, 1);
  finish();
  await connecting;
});

test("missing, malformed, or overbroad token responses fail closed", async () => {
  for (const response of [
    undefined,
    TOKEN,
    { token: TOKEN },
    result(""),
    result(TOKEN, []),
    result(TOKEN, [GMAIL_READONLY_SCOPE, "openid"]),
  ]) {
    const { auth } = harness({ getToken: () => Promise.resolve(response) });
    await assert.rejects(auth.connectFromUserGesture(), {
      message: "GMAIL_AUTH_RESPONSE_INVALID",
    });
  }
});

test("provider denial becomes an actionable code", async () => {
  const { auth } = harness({
    getToken: () => Promise.reject(new Error("The user closed the window")),
  });
  await assert.rejects(auth.connectFromUserGesture(), {
    message: "GMAIL_AUTH_ACCESS_DENIED",
  });
});

test("canceling an in-flight request removes a distinct late browser token", async () => {
  let finish;
  const { auth, calls } = harness({
    getToken: () => new Promise((resolve) => { finish = () => resolve(result("late-token")); }),
  });
  const connecting = auth.connectFromUserGesture();
  auth.invalidatePendingAuth();
  finish();
  await assert.rejects(connecting, { message: "GMAIL_AUTH_CANCELED" });
  assert.equal(auth.hasMemoryToken(), false);
  assert.deepEqual(calls.filter(([kind]) => kind === "remove"), [
    ["remove", { token: "late-token" }],
  ]);
});

test("credentials use a conservative lease and stale leases cannot clear a reused token", async () => {
  let now = 10_000;
  const { auth, calls } = harness({ clock: () => now });
  const first = await auth.connectFromUserGesture();
  auth.forgetMemoryToken();
  await new Promise((resolve) => setImmediate(resolve));
  const second = await auth.connectFromUserGesture();
  assert.equal(await auth.removeAccessToken(first), false);
  assert.equal(auth.hasMemoryToken(), true);
  now += TOKEN_LEASE_MILLISECONDS;
  await assert.rejects(auth.getCachedAccessToken(), { message: "GMAIL_AUTH_EXPIRED" });
  assert.equal(auth.hasMemoryToken(), false);
  assert.ok(calls.filter(([kind]) => kind === "remove").length >= 2);
  assert.equal(second.token, TOKEN);
});

test("cache cleanup failure blocks reuse instead of hiding a standing token", async () => {
  const { auth } = harness({
    removeToken: () => Promise.reject(new Error("cache unavailable")),
  });
  const credential = await auth.connectFromUserGesture();
  await assert.rejects(auth.removeAccessToken(credential), {
    message: "GMAIL_AUTH_CACHE_CLEAR_FAILED",
  });
  assert.equal(auth.hasMemoryToken(), false);
  await assert.rejects(auth.connectFromUserGesture(), {
    message: "GMAIL_AUTH_CACHE_CLEAR_FAILED",
  });
});

test("Disconnect attempts broad Chrome cleanup after narrow token cleanup fails", async () => {
  const { auth, calls } = harness({
    removeToken: () => Promise.reject(new Error("narrow cache unavailable")),
  });
  await auth.connectFromUserGesture();
  assert.deepEqual(await auth.disconnect(), {
    browserAuthorizationCleared: true,
    connectedInMemory: false,
    forgottenFromMemory: true,
    googleGrantRevoked: false,
  });
  assert.deepEqual(calls.slice(-2), [
    ["remove", { token: TOKEN }],
    ["clear-all"],
  ]);
  await auth.connectFromUserGesture();
});

test("disconnect clears extension auth state without claiming Google-grant revocation", async () => {
  const { auth, calls } = harness();
  await auth.connectFromUserGesture();
  assert.deepEqual(await auth.disconnect(), {
    browserAuthorizationCleared: true,
    connectedInMemory: false,
    forgottenFromMemory: true,
    googleGrantRevoked: false,
  });
  assert.deepEqual(calls.slice(-2), [
    ["remove", { token: TOKEN }],
    ["clear-all"],
  ]);
});

test("compiled auth boundary matches the Chrome Extension client record", async () => {
  const [identity, manifest] = await Promise.all([
    readFile(new URL("../extension/identity.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../extension/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(identity.oauth_client_type, "chrome-extension");
  assert.equal(identity.oauth_client_id, manifest.oauth2.client_id);
  assert.equal(identity.oauth_flow, "getAuthToken-chrome-extension");
  assert.deepEqual(manifest.oauth2.scopes, [GMAIL_READONLY_SCOPE]);
  assert.equal(Object.keys(identity).some((key) => /secret/iu.test(key)), false);
});

test("auth module has no persistence, profile lookup, Web flow, logging, or secret surface", async () => {
  const source = await readFile(new URL("../app/gmail-auth.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|chrome\.storage)\b/u);
  assert.doesNotMatch(source, /getProfileUserInfo|launchWebAuthFlow/u);
  assert.match(source, /getAuthToken/u);
  assert.match(source, /removeCachedAuthToken/u);
  assert.doesNotMatch(source, /\bconsole\s*\./u);
  assert.doesNotMatch(source, /client_secret|<script|import\s*\(/iu);
});
