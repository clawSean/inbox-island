import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createGmailApiClient,
  GMAIL_API_ORIGIN,
  GMAIL_PILOT_LIMITS,
  RECENT_MAIL_QUERY,
} from "../app/gmail-api.mjs";
import { normalizeGmailMessage, normalizeMailbox } from "../src/gmail-normalize.mjs";

const ACCESS_TOKEN = "gmail-api-test-token-do-not-persist";

function json(value, init = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

function client(fetchImpl, options = {}) {
  return createGmailApiClient({
    fetchImpl,
    getAccessToken: async () => ACCESS_TOKEN,
    ...options,
  });
}

function profile() {
  return {
    emailAddress: "pilot@example.test",
    historyId: "123456789",
    messagesTotal: 125,
    threadsTotal: 98,
  };
}

function gmailMessage(id = "msg_1", threadId = "thread_1") {
  return {
    id,
    threadId,
    internalDate: "1791586800000",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Sender <sender@example.test>" },
        { name: "To", value: "pilot@example.test" },
        { name: "Subject", value: "Pilot message" },
      ],
      body: { size: 0 },
      parts: [
        { mimeType: "text/plain", body: { data: btoa("Can you review this today?"), size: 26 } },
        {
          mimeType: "application/pdf",
          filename: "brief.pdf",
          body: { attachmentId: "attachment_1", data: btoa("must-not-process"), size: 16 },
        },
      ],
    },
  };
}

test("profile uses the fixed users/me endpoint and returns display identity without token data", async () => {
  const calls = [];
  const api = client(async (url, init) => {
    calls.push({ url, init });
    return json(profile());
  });
  const result = await api.getProfile();
  assert.deepEqual(result, { accountId: "pilot@example.test", ...profile() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${GMAIL_API_ORIGIN}/gmail/v1/users/me/profile`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(ACCESS_TOKEN, "u"));
  assert.equal(Object.isFrozen(result), true);
});

test("recent discovery pins the Inbox/Sent query and stops at the requested hard bound", async () => {
  const urls = [];
  const api = client(async (url) => {
    const parsed = new URL(url);
    urls.push(parsed);
    if (!parsed.searchParams.has("pageToken")) {
      return json({
        messages: [
          { id: "m1", threadId: "t1" },
          { id: "m2", threadId: "t2" },
        ],
        nextPageToken: "page_2",
      });
    }
    return json({ messages: [{ id: "m3", threadId: "t3" }], nextPageToken: "page_3" });
  });
  const result = await api.discoverRecentMessages({ limit: 3 });
  assert.deepEqual(result.messages, [
    { id: "m1", threadId: "t1" },
    { id: "m2", threadId: "t2" },
    { id: "m3", threadId: "t3" },
  ]);
  assert.equal(result.pages, 2);
  assert.equal(result.query, RECENT_MAIL_QUERY);
  assert.equal(result.truncated, true);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].origin, GMAIL_API_ORIGIN);
  assert.equal(urls[0].pathname, "/gmail/v1/users/me/messages");
  assert.equal(urls[0].searchParams.get("q"), RECENT_MAIL_QUERY);
  assert.equal(urls[0].searchParams.get("maxResults"), "3");
  assert.equal(urls[1].searchParams.get("maxResults"), "1");
  assert.equal(urls[1].searchParams.get("pageToken"), "page_2");

  await assert.rejects(
    api.discoverRecentMessages({ limit: GMAIL_PILOT_LIMITS.maxMessages + 1 }),
    { message: "GMAIL_DISCOVERY_LIMIT_INVALID" },
  );
  assert.equal(urls.length, 2);
});

test("discovery caps pagination and rejects unsafe or cycling page tokens", async () => {
  let pages = 0;
  const capped = client(async () => {
    pages += 1;
    return json({
      messages: [{ id: `m${pages}`, threadId: `t${pages}` }],
      nextPageToken: `page_${pages}`,
    });
  });
  const cappedResult = await capped.discoverRecentMessages();
  assert.equal(pages, GMAIL_PILOT_LIMITS.maxPages);
  assert.equal(cappedResult.messages.length, GMAIL_PILOT_LIMITS.maxPages);
  assert.equal(cappedResult.truncated, true);

  const unsafe = client(async () => json({ messages: [], nextPageToken: "bad token?" }));
  await assert.rejects(unsafe.discoverRecentMessages(), { message: "GMAIL_PAGE_TOKEN_INVALID" });

  let cyclePage = 0;
  const cycling = client(async () => {
    cyclePage += 1;
    return json({
      messages: [{ id: `cycle${cyclePage}`, threadId: `thread${cyclePage}` }],
      nextPageToken: "same_token",
    });
  });
  await assert.rejects(cycling.discoverRecentMessages(), { message: "GMAIL_PAGE_TOKEN_INVALID" });
});

test("full message fetch returns only the normalizer contract and never processes attachment data", async () => {
  const calls = [];
  const api = client(async (url, init) => {
    calls.push({ url, init });
    return json(gmailMessage());
  });
  const message = await api.getMessage("msg_1");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, GMAIL_API_ORIGIN);
  assert.equal(url.pathname, "/gmail/v1/users/me/messages/msg_1");
  assert.equal(url.searchParams.get("format"), "full");
  assert.doesNotMatch(url.pathname, /attachments/u);
  assert.equal(message.payload.parts[1].body.attachmentId, "attachment_1");
  assert.equal("data" in message.payload.parts[1].body, false);
  assert.equal(Object.isFrozen(message), true);

  const normalized = normalizeGmailMessage(message);
  assert.equal(normalized.body, "Can you review this today?");
  assert.deepEqual(normalized.flags, ["attachment_unsupported"]);
});

test("bounded mailbox load verifies profile before listing and fetching message payloads", async () => {
  const paths = [];
  const api = client(async (url, init) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    assert.equal(init.method, "GET");
    assert.equal(parsed.origin, GMAIL_API_ORIGIN);
    if (parsed.pathname.endsWith("/profile")) return json(profile());
    if (parsed.pathname.endsWith("/messages")) {
      return json({ messages: [{ id: "msg_1", threadId: "thread_1" }] });
    }
    return json(gmailMessage());
  });
  const mailbox = await api.loadRecentMailbox({ expectedEmail: "pilot@example.test", limit: 1 });
  assert.equal(mailbox.accountId, "pilot@example.test");
  assert.equal(mailbox.messages.length, 1);
  assert.equal(mailbox.messages[0].id, "msg_1");
  assert.deepEqual(paths, [
    "/gmail/v1/users/me/profile",
    "/gmail/v1/users/me/messages",
    "/gmail/v1/users/me/messages/msg_1",
  ]);
  assert.doesNotMatch(JSON.stringify(mailbox), new RegExp(ACCESS_TOKEN, "u"));
});

test("wrong expected account stops after profile and before message discovery", async () => {
  const paths = [];
  const api = client(async (url) => {
    paths.push(new URL(url).pathname);
    return json(profile());
  });
  await assert.rejects(api.loadRecentMailbox({
    expectedEmail: "other@example.test", limit: 1,
  }), { message: "GMAIL_ACCOUNT_MISMATCH" });
  assert.deepEqual(paths, ["/gmail/v1/users/me/profile"]);
});

test("one unsafe message becomes an id-bound placeholder while the next message continues", async () => {
  const fetched = [];
  const api = client(async (url) => {
    const id = new URL(url).pathname.split("/").at(-1);
    fetched.push(id);
    if (id === "bad") {
      return json({
        ...gmailMessage("bad", "untrusted_thread"),
        snippet: "private content must not enter the placeholder",
      });
    }
    return json(gmailMessage("good", "thread_good"));
  });
  const messages = await api.getMessages([
    { id: "bad", threadId: "thread_bad" },
    { id: "good", threadId: "thread_good" },
  ]);
  assert.deepEqual(fetched, ["bad", "good"]);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    id: "bad",
    threadId: "thread_bad",
    internalDate: "0",
    labelIds: [],
    payload: { mimeType: "text/plain", filename: "", body: {} },
    pilotFetchError: "GMAIL_MESSAGE_SCHEMA_INVALID",
  });
  assert.doesNotMatch(JSON.stringify(messages[0]), /private content/u);
  assert.equal(messages[1].id, "good");

  const normalized = normalizeMailbox(messages);
  assert.equal(normalized[0].id, "bad");
  assert.equal(normalized[0].threadId, "thread_bad");
  assert.deepEqual(normalized[0].flags, ["malformed_content"]);
  assert.equal(normalized[0].normalizationError, "GMAIL_MESSAGE_SCHEMA_INVALID");
  assert.equal(normalized[1].id, "good");
  assert.equal(normalized[1].normalizationError, null);
});

test("invalid JSON, oversized content, and MIME complexity recover per message", async () => {
  const cases = [
    {
      code: "GMAIL_RESPONSE_INVALID_JSON",
      flag: "malformed_content",
      response: () => new Response("not-json"),
    },
    {
      code: "GMAIL_RESPONSE_TOO_LARGE",
      flag: "oversized_input",
      response: () => new Response("{}", { headers: { "content-length": String(513 * 1024) } }),
    },
    {
      code: "GMAIL_MESSAGE_SCHEMA_INVALID",
      flag: "malformed_content",
      response: () => {
        const message = gmailMessage("bad", "thread_bad");
        let part = { mimeType: "text/plain", body: { data: btoa("safe") } };
        for (let index = 0; index < 10; index += 1) {
          part = { mimeType: "multipart/mixed", body: {}, parts: [part] };
        }
        message.payload = part;
        return json(message);
      },
    },
  ];
  for (const scenario of cases) {
    const api = client(async (url) => new URL(url).pathname.endsWith("/bad")
      ? scenario.response()
      : json(gmailMessage("good", "thread_good")));
    const messages = await api.getMessages([
      { id: "bad", threadId: "thread_bad" },
      { id: "good", threadId: "thread_good" },
    ]);
    assert.equal(messages[0].pilotFetchError, scenario.code);
    assert.equal(messages[0].id, "bad");
    assert.equal(messages[0].threadId, "thread_bad");
    assert.equal(messages[1].id, "good");
    const normalized = normalizeGmailMessage(messages[0]);
    assert.deepEqual(normalized.flags, [scenario.flag]);
    assert.equal(normalized.normalizationError, scenario.code);
    assert.doesNotMatch(normalized.body, /not-json|safe/u);
  }
});

test("a disappeared message 404 becomes a bound placeholder and the batch continues", async () => {
  const api = client(async (url) => new URL(url).pathname.endsWith("/gone")
    ? new Response("gone", { status: 404 })
    : json(gmailMessage("good", "thread_good")));
  const messages = await api.getMessages([
    { id: "gone", threadId: "thread_gone" },
    { id: "good", threadId: "thread_good" },
  ]);
  assert.equal(messages[0].id, "gone");
  assert.equal(messages[0].threadId, "thread_gone");
  assert.equal(messages[0].pilotFetchError, "GMAIL_HTTP_ERROR_404");
  assert.equal(messages[1].id, "good");
  const normalized = normalizeGmailMessage(messages[0]);
  assert.deepEqual(normalized.flags, ["malformed_content"]);
  assert.equal(normalized.normalizationError, "GMAIL_HTTP_ERROR_404");

  const fatal404 = client(async () => new Response("gone", { status: 404 }));
  await assert.rejects(fatal404.getProfile(), { message: "GMAIL_HTTP_ERROR_404" });
  await assert.rejects(fatal404.discoverRecentMessages({ limit: 1 }), {
    message: "GMAIL_HTTP_ERROR_404",
  });
});

test("string message references do not assume the Gmail thread id equals the message id", async () => {
  const api = client(async () => json(gmailMessage("m1", "different_thread")));
  const messages = await api.getMessages(["m1"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "m1");
  assert.equal(messages[0].threadId, "different_thread");
  assert.equal("pilotFetchError" in messages[0], false);
});

test("auth, network, and abort failures remain fatal to the message batch", async () => {
  const references = [{ id: "m1", threadId: "t1" }];
  const auth = client(async () => json(gmailMessage("m1", "t1")), {
    getAccessToken: async () => { throw new Error("no token"); },
  });
  await assert.rejects(auth.getMessages(references), { message: "GMAIL_AUTH_REQUIRED" });

  const network = client(async () => { throw new Error("offline"); });
  await assert.rejects(network.getMessages(references), { message: "GMAIL_NETWORK_FAILED" });

  const denied = client(async () => new Response("denied", { status: 403 }));
  await assert.rejects(denied.getMessages(references), { message: "GMAIL_ACCESS_DENIED" });

  const server = client(async () => new Response("failed", { status: 500 }));
  await assert.rejects(server.getMessages(references), { message: "GMAIL_HTTP_ERROR_500" });

  const controller = new AbortController();
  controller.abort();
  const aborted = client(async () => json(gmailMessage("m1", "t1")));
  await assert.rejects(aborted.getMessages(references, { signal: controller.signal }), {
    message: "GMAIL_ABORTED",
  });
});

test("message and list schema errors fail closed before reaching triage", async () => {
  const wrongId = client(async () => json(gmailMessage("different")));
  await assert.rejects(wrongId.getMessage("requested"), {
    message: "GMAIL_MESSAGE_SCHEMA_INVALID",
  });

  const overfullPage = client(async () => json({
    messages: [
      { id: "m1", threadId: "t1" },
      { id: "m2", threadId: "t2" },
    ],
  }));
  await assert.rejects(overfullPage.discoverRecentMessages({ limit: 1 }), {
    message: "GMAIL_LIST_SCHEMA_INVALID",
  });

  const api = client(async () => json(gmailMessage()));
  await assert.rejects(api.getMessage("../escape"), { message: "GMAIL_MESSAGE_ID_INVALID" });
  await assert.rejects(
    api.getMessages(Array.from({ length: GMAIL_PILOT_LIMITS.maxMessages + 1 }, (_, index) => `m${index}`)),
    { message: "GMAIL_MESSAGE_BATCH_INVALID" },
  );
});

test("HTTP, network, and abort failures expose stable token-free errors", async () => {
  const network = client(async () => {
    throw new Error(`socket failed with ${ACCESS_TOKEN}`);
  });
  await assert.rejects(network.getProfile(), { message: "GMAIL_NETWORK_FAILED" });

  const server = client(async () => new Response(`server echoed ${ACCESS_TOKEN}`, { status: 500 }));
  await assert.rejects(server.getProfile(), (error) => {
    assert.equal(error.message, "GMAIL_HTTP_ERROR_500");
    assert.doesNotMatch(error.message, new RegExp(ACCESS_TOKEN, "u"));
    return true;
  });

  let rejected = 0;
  const unauthorized = client(async () => new Response("denied", { status: 401 }), {
    onTokenRejected: async () => { rejected += 1; },
  });
  await assert.rejects(unauthorized.getProfile(), { message: "GMAIL_AUTH_REQUIRED" });
  assert.equal(rejected, 1);

  let fetched = false;
  const aborted = client(async () => {
    fetched = true;
    return json(profile());
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(aborted.getProfile({ signal: controller.signal }), {
    message: "GMAIL_ABORTED",
  });
  assert.equal(fetched, false);

  const abortedBody = client(async () => ({
    body: {
      getReader: () => ({
        cancel: async () => {},
        read: async () => { throw new DOMException("stopped", "AbortError"); },
        releaseLock: () => {},
      }),
    },
    headers: new Headers(),
    ok: true,
    redirected: false,
    status: 200,
    url: `${GMAIL_API_ORIGIN}/gmail/v1/users/me/profile`,
  }));
  await assert.rejects(abortedBody.getProfile(), { message: "GMAIL_ABORTED" });
});

test("response size and JSON parsing are bounded", async () => {
  const oversized = client(async () => new Response("{}", {
    headers: { "content-length": String(17 * 1024) },
  }));
  await assert.rejects(oversized.getProfile(), { message: "GMAIL_RESPONSE_TOO_LARGE" });

  const malformed = client(async () => new Response("not-json"));
  await assert.rejects(malformed.getProfile(), { message: "GMAIL_RESPONSE_INVALID_JSON" });

  let cancelledWith = null;
  const chunks = [new Uint8Array(10 * 1024), new Uint8Array(10 * 1024)];
  const streaming = client(async () => ({
    body: {
      getReader: () => ({
        cancel: async (reason) => { cancelledWith = reason; },
        read: async () => chunks.length ? { done: false, value: chunks.shift() } : { done: true },
        releaseLock: () => {},
      }),
    },
    headers: new Headers(),
    ok: true,
    redirected: false,
    status: 200,
    url: `${GMAIL_API_ORIGIN}/gmail/v1/users/me/profile`,
  }));
  await assert.rejects(streaming.getProfile(), { message: "GMAIL_RESPONSE_TOO_LARGE" });
  assert.equal(cancelledWith, "response-too-large");
});

test("Gmail boundary has no mutations, attachment endpoint, persistence, or logging", async () => {
  const source = await readFile(new URL("../app/gmail-api.mjs", import.meta.url), "utf8");
  const schema = await readFile(new URL("../app/gmail-api-schema.mjs", import.meta.url), "utf8");
  const response = await readFile(new URL("../app/gmail-response.mjs", import.meta.url), "utf8");
  assert.match(source, new RegExp(GMAIL_API_ORIGIN.replaceAll(".", "\\."), "u"));
  const boundary = `${source}\n${schema}\n${response}`;
  assert.doesNotMatch(boundary, /\/attachments(?:\/|["'`])/u);
  assert.doesNotMatch(boundary, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/u);
  assert.doesNotMatch(boundary, /\b(?:localStorage|sessionStorage|indexedDB|chrome\.storage)\b/u);
  assert.doesNotMatch(boundary, /\bconsole\s*\./u);
});
