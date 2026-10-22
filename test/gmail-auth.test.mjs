import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createGmailAuth, GMAIL_READONLY_SCOPE, PILOT_OAUTH_CLIENT_ID, TOKEN_LEASE_MILLISECONDS,
} from "../app/gmail-auth.mjs";

const EXTENSION_ID = "jeemdbgakejlmmmbngpihndfkjiddbhl";
const REDIRECT_URI = `https://${EXTENSION_ID}.chromiumapp.org/oauth2`;
const TOKEN = "pilot-token-that-must-not-leak";

function redirect(url, overrides = {}) {
  const request = new URL(url);
  const result = new URL(REDIRECT_URI);
  result.hash = new URLSearchParams({
    access_token: TOKEN,
    expires_in: "3599",
    scope: GMAIL_READONLY_SCOPE,
    state: request.searchParams.get("state"),
    token_type: "Bearer",
    ...overrides,
  });
  return result.href;
}

function harness({ clock = Date.now, launch } = {}) {
  const calls = [];
  const identityApi = {
    getRedirectURL: (path) => {
      calls.push(["redirect", path]);
      return REDIRECT_URI;
    },
    launchWebAuthFlow(options) {
      calls.push(["launch", structuredClone(options)]);
      return launch ? launch(options) : Promise.resolve(redirect(options.url));
    },
  };
  return {
    auth: createGmailAuth({
      clientId: PILOT_OAUTH_CLIENT_ID,
      clock,
      cryptoApi: { getRandomValues: (bytes) => bytes.fill(7) },
      identityApi,
      runtimeApi: { id: EXTENSION_ID },
    }),
    calls,
  };
}

test("web chooser requests only gmail.readonly and explicit account choice", async () => {
  const { auth, calls } = harness();
  const credential = await auth.connectFromUserGesture();
  assert.equal(credential.token, TOKEN);
  const launch = calls.find(([kind]) => kind === "launch")[1];
  const url = new URL(launch.url);
  assert.equal(launch.interactive, true);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), PILOT_OAUTH_CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), GMAIL_READONLY_SCOPE);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("response_type"), "token");
});

test("launchWebAuthFlow starts synchronously in the user click turn", async () => {
  let finish;
  const { auth, calls } = harness({ launch: ({ url }) => new Promise((resolve) => {
    finish = () => resolve(redirect(url));
  }) });
  const connecting = auth.connectFromUserGesture();
  assert.equal(calls.filter(([kind]) => kind === "launch").length, 1);
  finish();
  await connecting;
});

test("redirect state, origin, token type, scope, and expiry fail closed", async () => {
  for (const mutate of [
    (url) => redirect(url, { state: "wrong" }),
    (url) => redirect(url, { scope: `${GMAIL_READONLY_SCOPE} openid` }),
    (url) => redirect(url, { token_type: "MAC" }),
    (url) => redirect(url, { expires_in: "0" }),
    (url) => redirect(url).replace("chromiumapp.org", "example.com"),
  ]) {
    const { auth } = harness({ launch: ({ url }) => Promise.resolve(mutate(url)) });
    await assert.rejects(auth.connectFromUserGesture(), { message: "GMAIL_AUTH_RESPONSE_INVALID" });
  }
});

test("provider denial becomes an actionable code", async () => {
  const { auth } = harness({ launch: () => Promise.reject(new Error("The user closed the window")) });
  await assert.rejects(auth.connectFromUserGesture(), { message: "GMAIL_AUTH_ACCESS_DENIED" });
});

test("canceling an in-flight chooser rejects a late callback", async () => {
  let finish;
  const { auth } = harness({ launch: ({ url }) => new Promise((resolve) => {
    finish = () => resolve(redirect(url));
  }) });
  const connecting = auth.connectFromUserGesture();
  auth.invalidatePendingAuth();
  finish();
  await assert.rejects(connecting, { message: "GMAIL_AUTH_CANCELED" });
  assert.equal(auth.hasMemoryToken(), false);
});

test("credentials use a conservative local lease and stale leases cannot clear new access", async () => {
  let now = 10_000;
  const { auth } = harness({ clock: () => now });
  const first = await auth.connectFromUserGesture();
  now += TOKEN_LEASE_MILLISECONDS;
  await assert.rejects(auth.getCachedAccessToken(), { message: "GMAIL_AUTH_EXPIRED" });
  const second = await auth.connectFromUserGesture();
  assert.equal(await auth.removeAccessToken(first), false);
  assert.equal(auth.hasMemoryToken(), true);
  assert.equal(await auth.removeAccessToken(second), true);
});

test("disconnect clears memory without claiming Google-grant revocation", async () => {
  const { auth } = harness();
  await auth.connectFromUserGesture();
  assert.deepEqual(await auth.disconnect(), {
    connectedInMemory: false, forgottenFromMemory: true, googleGrantRevoked: false,
  });
});

test("compiled auth boundary matches the public Web client record", async () => {
  const identity = JSON.parse(await readFile(new URL("../extension/identity.json", import.meta.url), "utf8"));
  assert.equal(identity.oauth_client_type, "web-application");
  assert.equal(identity.oauth_client_id, PILOT_OAUTH_CLIENT_ID);
  assert.equal(identity.oauth_flow, "launchWebAuthFlow-implicit-private-pilot");
  assert.equal(Object.keys(identity).some((key) => /secret/iu.test(key)), false);
});

test("auth module has no persistence, profile lookup, logging, or secret surface", async () => {
  const source = await readFile(new URL("../app/gmail-auth.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|chrome\.storage)\b/u);
  assert.doesNotMatch(source, /getProfileUserInfo|getAuthToken/u);
  assert.doesNotMatch(source, /\bconsole\s*\./u);
  assert.doesNotMatch(source, /client_secret|<script|import\s*\(/iu);
});
