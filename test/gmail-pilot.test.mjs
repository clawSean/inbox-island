import assert from "node:assert/strict";
import test from "node:test";
import { GMAIL_READONLY_SCOPE } from "../app/gmail-auth.mjs";
import { createGmailPilot, isGmailPilotRuntime } from "../app/gmail-pilot.mjs";

const EXTENSION_ID = "jeemdbgakejlmmmbngpihndfkjiddbhl";
const REDIRECT_URI = `https://${EXTENSION_ID}.chromiumapp.org/oauth2`;
const CLIENT_ID = "270655843779-abcdefghijklmnop.apps.googleusercontent.com";
const ACCESS_TOKEN = "portable-pilot-access-token";

function reply(value, init = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

function profile(email = "pilot@example.test") {
  return {
    emailAddress: email,
    historyId: "123",
    messagesTotal: 1,
    threadsTotal: 1,
  };
}

function message() {
  return {
    id: "m1",
    threadId: "t1",
    internalDate: "1760000000000",
    labelIds: ["INBOX"],
    payload: { headers: [], mimeType: "text/plain", body: { data: "SGVsbG8" } },
  };
}

function successfulRedirect(authUrl, { state, token = ACCESS_TOKEN } = {}) {
  const requested = new URL(authUrl);
  const response = new URL(REDIRECT_URI);
  response.hash = new URLSearchParams({
    access_token: token,
    expires_in: "3599",
    scope: GMAIL_READONLY_SCOPE,
    state: state ?? requested.searchParams.get("state"),
    token_type: "Bearer",
  }).toString();
  return response.href;
}

function pilotScope({ fetchOverride, launchWebAuthFlow } = {}) {
  const fetchCalls = [];
  const launchCalls = [];
  const scope = {
    crypto: {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
        return bytes;
      },
    },
    location: { protocol: "chrome-extension:" },
    chrome: {
      identity: {
        getRedirectURL: () => REDIRECT_URI,
        launchWebAuthFlow(details) {
          launchCalls.push(details);
          const result = launchWebAuthFlow
            ? launchWebAuthFlow(details, launchCalls.length)
            : Promise.resolve(successfulRedirect(details.url));
          return Promise.resolve(result);
        },
      },
      runtime: {
        id: EXTENSION_ID,
      },
    },
    fetch: async (url, init) => {
      fetchCalls.push({ init, url });
      if (fetchOverride) return fetchOverride(url, init, fetchCalls.length);
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/profile")) return reply(profile());
      if (parsed.pathname.endsWith("/messages")) {
        return reply({ messages: [{ id: "m1", threadId: "t1" }] });
      }
      return reply(message());
    },
  };
  return { fetchCalls, launchCalls, scope };
}

function createPilot(harness, options = {}) {
  return createGmailPilot(harness.scope, { clientId: CLIENT_ID, ...options });
}

test("pilot runtime requires an extension page and profile-free identity APIs", () => {
  const harness = pilotScope();
  assert.equal(isGmailPilotRuntime(harness.scope), true);
  assert.equal(isGmailPilotRuntime({ ...harness.scope, location: { protocol: "https:" } }), false);
  assert.equal(isGmailPilotRuntime({
    ...harness.scope,
    chrome: { ...harness.scope.chrome, identity: { launchWebAuthFlow() {} } },
  }), false);
});

test("account selection opens the browser chooser synchronously before yielding", async () => {
  let finish;
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }) => new Promise((resolve) => {
      finish = () => resolve(successfulRedirect(url));
    }),
  });
  const pilot = createPilot(harness);
  const choosing = pilot.chooseGoogleAccount();
  assert.equal(harness.launchCalls.length, 1);
  assert.equal(harness.fetchCalls.length, 0);
  finish();
  assert.deepEqual(await choosing, { email: "pilot@example.test" });
});

test("selection reads only the Gmail profile, then confirmation performs the bounded load", async () => {
  const harness = pilotScope();
  const pilot = createPilot(harness);
  const selected = await pilot.chooseGoogleAccount();
  assert.deepEqual(selected, { email: "pilot@example.test" });
  assert.deepEqual(harness.fetchCalls.map(({ url }) => new URL(url).pathname), [
    "/gmail/v1/users/me/profile",
  ]);
  assert.equal(pilot.hasMemoryToken(), true);
  assert.equal(harness.fetchCalls[0].init.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);

  const mailbox = await pilot.connectAndLoad({ confirmedAccount: selected, limit: 1 });
  assert.equal(mailbox.accountId, "pilot@example.test");
  assert.equal(mailbox.messages.length, 1);
  assert.deepEqual(harness.fetchCalls.map(({ url }) => new URL(url).pathname), [
    "/gmail/v1/users/me/profile",
    "/gmail/v1/users/me/profile",
    "/gmail/v1/users/me/messages",
    "/gmail/v1/users/me/messages/m1",
  ]);
  assert.equal(pilot.hasMemoryToken(), false);
});

test("each new sync requires another explicit account chooser gesture", async () => {
  const harness = pilotScope();
  const pilot = createPilot(harness);
  const first = await pilot.chooseGoogleAccount();
  await pilot.connectAndLoad({ confirmedAccount: first, limit: 1 });
  await assert.rejects(
    pilot.connectAndLoad({ confirmedAccount: first, limit: 1 }),
    { message: "GMAIL_ACCOUNT_CONFIRMATION_REQUIRED" },
  );
  const second = await pilot.chooseGoogleAccount();
  await pilot.connectAndLoad({ confirmedAccount: second, limit: 1 });
  assert.equal(harness.launchCalls.length, 2);
  assert.equal(pilot.hasMemoryToken(), false);
});

test("an expired selection is purged before sync and a new chooser can start", async () => {
  let now = 1_000;
  const harness = pilotScope();
  const pilot = createPilot(harness, { clock: () => now });
  const selected = await pilot.chooseGoogleAccount();
  const afterSelection = harness.fetchCalls.length;
  now += 3_599_000;
  assert.equal(pilot.hasMemoryToken(), false);
  await assert.rejects(
    pilot.connectAndLoad({ confirmedAccount: selected, limit: 1 }),
    { message: "GMAIL_ACCOUNT_CONFIRMATION_REQUIRED" },
  );
  assert.equal(harness.fetchCalls.length, afterSelection);
  await pilot.chooseGoogleAccount();
  assert.equal(harness.launchCalls.length, 2);
});

test("cancel invalidates a deferred chooser and ignores its late token", async () => {
  let finish;
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }) => new Promise((resolve) => {
      finish = () => resolve(successfulRedirect(url, { token: "late-token" }));
    }),
  });
  const pilot = createPilot(harness);
  const controller = new AbortController();
  const choosing = pilot.chooseGoogleAccount({ signal: controller.signal });
  controller.abort();
  await assert.rejects(choosing, { message: "GMAIL_ABORTED" });
  assert.equal(harness.fetchCalls.length, 0);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pilot.hasMemoryToken(), false);
  assert.equal(harness.fetchCalls.length, 0);
});

test("same-task chooser completion and abort cannot strand a credential", async () => {
  let finish;
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }) => new Promise((resolve) => {
      finish = () => resolve(successfulRedirect(url));
    }),
  });
  const pilot = createPilot(harness);
  const controller = new AbortController();
  const choosing = pilot.chooseGoogleAccount({ signal: controller.signal });
  finish();
  controller.abort();
  await assert.rejects(choosing, { message: "GMAIL_ABORTED" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pilot.hasMemoryToken(), false);
  assert.equal(harness.fetchCalls.length, 0);
});

test("a late chooser A cannot clear the token selected by newer chooser B", async () => {
  const finishes = [];
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }) => new Promise((resolve) => {
      finishes.push(() => resolve(successfulRedirect(url)));
    }),
  });
  const pilot = createPilot(harness);
  const chooserA = pilot.chooseGoogleAccount();
  const chooserB = pilot.chooseGoogleAccount();
  finishes[1]();
  const selectedB = await chooserB;
  assert.equal(pilot.hasMemoryToken(), true);
  finishes[0]();
  await assert.rejects(chooserA, { message: "GMAIL_AUTH_CANCELED" });
  assert.equal(pilot.hasMemoryToken(), true);
  await pilot.connectAndLoad({ confirmedAccount: selectedB, limit: 1 });
  assert.equal(pilot.hasMemoryToken(), false);
});

test("late chooser A network failure cannot clear newer B when Google reuses the token", async () => {
  let rejectProfileA;
  const profileA = new Promise((_, reject) => { rejectProfileA = reject; });
  const harness = pilotScope({
    fetchOverride: async (url, _init, call) => {
      if (call === 1) return profileA;
      const path = new URL(url).pathname;
      if (path.endsWith("/profile")) return reply(profile());
      if (path.endsWith("/messages")) {
        return reply({ messages: [{ id: "m1", threadId: "t1" }] });
      }
      return reply(message());
    },
  });
  const pilot = createPilot(harness);
  const chooserA = pilot.chooseGoogleAccount();
  await new Promise((resolve) => setImmediate(resolve));
  pilot.forgetMemoryToken();
  const selectedB = await pilot.chooseGoogleAccount();
  assert.equal(pilot.hasMemoryToken(), true);
  rejectProfileA(new Error("offline"));
  await assert.rejects(chooserA, { message: "GMAIL_NETWORK_FAILED" });
  assert.equal(pilot.hasMemoryToken(), true, "A cannot clear B's distinct lease");
  await pilot.connectAndLoad({ confirmedAccount: selectedB, limit: 1 });
});

test("late chooser A 401 rejects only A's lease and preserves newer B", async () => {
  let finishProfileA;
  const profileA = new Promise((resolve) => { finishProfileA = resolve; });
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }, call) => Promise.resolve(successfulRedirect(url, {
      token: call === 1 ? "token-a" : "token-b",
    })),
    fetchOverride: async (url, _init, call) => {
      if (call === 1) return profileA;
      const path = new URL(url).pathname;
      if (path.endsWith("/profile")) return reply(profile());
      if (path.endsWith("/messages")) {
        return reply({ messages: [{ id: "m1", threadId: "t1" }] });
      }
      return reply(message());
    },
  });
  const pilot = createPilot(harness);
  const chooserA = pilot.chooseGoogleAccount();
  await new Promise((resolve) => setImmediate(resolve));
  pilot.forgetMemoryToken();
  const selectedB = await pilot.chooseGoogleAccount();
  finishProfileA(new Response("expired", { status: 401 }));
  await assert.rejects(chooserA, { message: "GMAIL_AUTH_REQUIRED" });
  assert.equal(pilot.hasMemoryToken(), true, "stale 401 cleanup cannot clear B");
  await pilot.connectAndLoad({ confirmedAccount: selectedB, limit: 1 });
});

test("disconnect blocks further old-account reads and never substitutes the new lease", async () => {
  let finishSyncAProfile;
  const syncAProfile = new Promise((resolve) => { finishSyncAProfile = resolve; });
  const authorizations = [];
  const harness = pilotScope({
    launchWebAuthFlow: ({ url }, call) => Promise.resolve(successfulRedirect(url, {
      token: call === 1 ? "token-a" : "token-b",
    })),
    fetchOverride: async (url, init, call) => {
      authorizations.push(init.headers.Authorization);
      const path = new URL(url).pathname;
      if (call === 1) return reply(profile("a@example.test"));
      if (call === 2) return syncAProfile;
      if (call === 3) return reply(profile("b@example.test"));
      if (path.endsWith("/profile")) return reply(profile("b@example.test"));
      if (path.endsWith("/messages")) {
        return reply({ messages: [{ id: "m1", threadId: "t1" }] });
      }
      return reply(message());
    },
  });
  const pilot = createPilot(harness);
  const selectedA = await pilot.chooseGoogleAccount();
  const syncingA = pilot.connectAndLoad({ confirmedAccount: selectedA, limit: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  await pilot.disconnect();
  const selectedB = await pilot.chooseGoogleAccount();
  finishSyncAProfile(reply(profile("a@example.test")));
  await assert.rejects(syncingA, { message: "GMAIL_AUTH_REQUIRED" });
  assert.deepEqual(authorizations, [
    "Bearer token-a",
    "Bearer token-a",
    "Bearer token-b",
  ]);
  assert.equal(pilot.hasMemoryToken(), true, "old A cleanup cannot clear selected B");
  const mailboxB = await pilot.connectAndLoad({ confirmedAccount: selectedB, limit: 1 });
  assert.equal(mailboxB.accountId, "b@example.test");
  assert.deepEqual(authorizations.slice(3), [
    "Bearer token-b",
    "Bearer token-b",
    "Bearer token-b",
  ]);
  assert.equal(pilot.hasMemoryToken(), false);
});

test("a changed Gmail identity stops before discovery and forgets the token", async () => {
  const harness = pilotScope({
    fetchOverride: async (url, _init, call) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/profile")) {
        return reply(profile(call === 1 ? "pilot@example.test" : "other@example.test"));
      }
      throw new Error("message discovery must not start");
    },
  });
  const pilot = createPilot(harness);
  const selected = await pilot.chooseGoogleAccount();
  await assert.rejects(
    pilot.connectAndLoad({ confirmedAccount: selected, limit: 1 }),
    { message: "GMAIL_ACCOUNT_MISMATCH" },
  );
  assert.deepEqual(harness.fetchCalls.map(({ url }) => new URL(url).pathname), [
    "/gmail/v1/users/me/profile",
    "/gmail/v1/users/me/profile",
  ]);
  assert.equal(pilot.hasMemoryToken(), false);
});

test("profile failure after OAuth forgets the token and exposes no mailbox request", async () => {
  const harness = pilotScope({
    fetchOverride: async () => new Response("failed", { status: 500 }),
  });
  const pilot = createPilot(harness);
  await assert.rejects(pilot.chooseGoogleAccount(), { message: "GMAIL_HTTP_ERROR_500" });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(pilot.hasMemoryToken(), false);
});

test("confirmation is validated before any Gmail request", async () => {
  const harness = pilotScope();
  const pilot = createPilot(harness);
  const selected = await pilot.chooseGoogleAccount();
  const requestsAfterSelection = harness.fetchCalls.length;
  await assert.rejects(
    pilot.connectAndLoad({ confirmedAccount: undefined, limit: 1 }),
    { message: "GMAIL_ACCOUNT_CONFIRMATION_REQUIRED" },
  );
  assert.equal(harness.fetchCalls.length, requestsAfterSelection);
  assert.equal(pilot.hasMemoryToken(), true, "the valid pending selection remains confirmable");
  await pilot.disconnect();
  assert.equal(pilot.hasMemoryToken(), false);
  assert.deepEqual(selected, { email: "pilot@example.test" });
});

test("a tampered confirmed email clears its lease and allows a clean new chooser", async () => {
  const harness = pilotScope();
  const pilot = createPilot(harness);
  await pilot.chooseGoogleAccount();
  const requestsAfterSelection = harness.fetchCalls.length;
  await assert.rejects(
    pilot.connectAndLoad({ confirmedAccount: { email: "other@example.test" }, limit: 1 }),
    { message: "GMAIL_ACCOUNT_CONFIRMATION_REQUIRED" },
  );
  assert.equal(harness.fetchCalls.length, requestsAfterSelection);
  assert.equal(pilot.hasMemoryToken(), false);
  await pilot.chooseGoogleAccount();
  assert.equal(harness.launchCalls.length, 2);
});
