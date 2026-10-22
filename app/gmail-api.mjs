import {
  assertMessageId,
  deepFreeze,
  projectListPage,
  projectMessage,
  projectMessageReference,
  projectProfile,
  projectRejectedMessage,
} from "./gmail-api-schema.mjs";
import { parseBoundedJson } from "./gmail-response.mjs";

export const GMAIL_API_ORIGIN = "https://gmail.googleapis.com";
export const RECENT_MAIL_QUERY = "newer_than:30d {in:inbox in:sent}";
export const GMAIL_PILOT_LIMITS = Object.freeze({
  maxMessages: 200,
  maxPages: 4,
  pageSize: 50,
});

const API_ROOT = "/gmail/v1/users/me";
const TOKEN = /^[\u0021-\u007e]{1,4096}$/u;
const RECOVERABLE_MESSAGE_ERRORS = new Set([
  "GMAIL_HTTP_ERROR_404",
  "GMAIL_MESSAGE_SCHEMA_INVALID",
  "GMAIL_RESPONSE_INVALID_JSON",
  "GMAIL_RESPONSE_TOO_LARGE",
]);

function fail(code) {
  throw new Error(code);
}

function accessCredential(value) {
  if (typeof value === "string" && TOKEN.test(value)) {
    return Object.freeze({ rejectionHandle: value, token: value });
  }
  if (value && typeof value === "object" && TOKEN.test(value.token)) {
    return Object.freeze({ rejectionHandle: value, token: value.token });
  }
  fail("GMAIL_AUTH_REQUIRED");
}

function assertSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal !== "object" || typeof signal.aborted !== "boolean") {
    throw new TypeError("GMAIL_ABORT_SIGNAL_INVALID");
  }
  if (signal.aborted) fail("GMAIL_ABORTED");
}

function buildUrl(path, query = {}) {
  if (typeof path !== "string" || !path.startsWith(`${API_ROOT}/`)) {
    fail("GMAIL_ENDPOINT_INVALID");
  }
  const url = new URL(path, GMAIL_API_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.append(key, String(value));
  }
  if (url.origin !== GMAIL_API_ORIGIN || !url.pathname.startsWith(`${API_ROOT}/`)) {
    fail("GMAIL_ENDPOINT_INVALID");
  }
  return url;
}

function responseLimit(path) {
  if (path.endsWith("/profile")) return 16 * 1024;
  if (path.endsWith("/messages")) return 256 * 1024;
  return 512 * 1024;
}

export function createGmailApiClient({ fetchImpl, getAccessToken, onTokenRejected = async () => {} }) {
  if (typeof fetchImpl !== "function" || typeof getAccessToken !== "function"
    || typeof onTokenRejected !== "function") {
    throw new TypeError("GMAIL_CLIENT_CONFIGURATION_INVALID");
  }

  async function request(path, query, { signal } = {}) {
    assertSignal(signal);
    let credential;
    try {
      credential = accessCredential(await getAccessToken());
    } catch {
      fail("GMAIL_AUTH_REQUIRED");
    }
    const { token } = credential;
    const url = buildUrl(path, query);
    let response;
    try {
      response = await fetchImpl(url.href, {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") fail("GMAIL_ABORTED");
      if (error?.message === "GMAIL_AUTH_REQUIRED") fail("GMAIL_AUTH_REQUIRED");
      fail("GMAIL_NETWORK_FAILED");
    }
    if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
      fail("GMAIL_RESPONSE_INVALID");
    }
    let responseOrigin = GMAIL_API_ORIGIN;
    try {
      if (response.url) responseOrigin = new URL(response.url).origin;
    } catch {
      fail("GMAIL_RESPONSE_ORIGIN_INVALID");
    }
    if (response.redirected || responseOrigin !== GMAIL_API_ORIGIN) {
      fail("GMAIL_RESPONSE_ORIGIN_INVALID");
    }
    if (!response.ok) {
      if (response.status === 401) {
        try {
          await onTokenRejected(credential.rejectionHandle);
        } catch { /* cache cleanup is best effort */ }
        fail("GMAIL_AUTH_REQUIRED");
      }
      if (response.status === 403) fail("GMAIL_ACCESS_DENIED");
      fail(`GMAIL_HTTP_ERROR_${response.status}`);
    }
    return parseBoundedJson(response, { limit: responseLimit(path), signal });
  }

  async function getProfile(options) {
    return projectProfile(await request(`${API_ROOT}/profile`, undefined, options));
  }

  async function discoverRecentMessages({ limit = GMAIL_PILOT_LIMITS.maxMessages, signal } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > GMAIL_PILOT_LIMITS.maxMessages) {
      throw new RangeError("GMAIL_DISCOVERY_LIMIT_INVALID");
    }
    const found = new Map();
    const seenTokens = new Set();
    let pageToken;
    let pages = 0;
    let more = false;
    while (pages < GMAIL_PILOT_LIMITS.maxPages && found.size < limit) {
      const requested = Math.min(GMAIL_PILOT_LIMITS.pageSize, limit - found.size);
      const page = projectListPage(await request(`${API_ROOT}/messages`, {
        maxResults: requested,
        pageToken,
        q: RECENT_MAIL_QUERY,
      }, { signal }), requested);
      pages += 1;
      for (const message of page.messages) {
        const prior = found.get(message.id);
        if (prior && prior.threadId !== message.threadId) fail("GMAIL_LIST_SCHEMA_INVALID");
        found.set(message.id, message);
      }
      more = page.nextPageToken !== null;
      if (!more || found.size >= limit) break;
      if (seenTokens.has(page.nextPageToken)) fail("GMAIL_PAGE_TOKEN_INVALID");
      seenTokens.add(page.nextPageToken);
      pageToken = page.nextPageToken;
    }
    return deepFreeze({
      messages: [...found.values()].slice(0, limit),
      pages,
      query: RECENT_MAIL_QUERY,
      truncated: more,
    });
  }

  async function getMessage(id, options) {
    assertMessageId(id);
    return projectMessage(await request(`${API_ROOT}/messages/${encodeURIComponent(id)}`, {
      format: "full",
    }, options), id);
  }

  async function getMessages(references, { signal } = {}) {
    if (!Array.isArray(references) || references.length > GMAIL_PILOT_LIMITS.maxMessages) {
      throw new RangeError("GMAIL_MESSAGE_BATCH_INVALID");
    }
    const projected = references.map(projectMessageReference);
    if (new Set(projected.map(({ id }) => id)).size !== projected.length) {
      fail("GMAIL_MESSAGE_BATCH_INVALID");
    }
    const messages = [];
    for (const reference of projected) {
      try {
        const message = await getMessage(reference.id, { signal });
        if (reference.verifyThreadId && message.threadId !== reference.threadId) {
          fail("GMAIL_MESSAGE_SCHEMA_INVALID");
        }
        messages.push(message);
      } catch (error) {
        if (!RECOVERABLE_MESSAGE_ERRORS.has(error?.message)) throw error;
        messages.push(projectRejectedMessage(reference, error.message));
      }
    }
    return Object.freeze(messages);
  }

  async function loadRecentMailbox({ expectedEmail, limit, signal } = {}) {
    if (typeof expectedEmail !== "string" || expectedEmail.length > 320) {
      fail("GMAIL_ACCOUNT_CONFIRMATION_REQUIRED");
    }
    const profile = await getProfile({ signal });
    if (profile.emailAddress.toLowerCase() !== expectedEmail.toLowerCase()) {
      fail("GMAIL_ACCOUNT_MISMATCH");
    }
    const discovery = await discoverRecentMessages({ limit, signal });
    const messages = await getMessages(discovery.messages, { signal });
    return deepFreeze({ accountId: profile.accountId, discovery, messages, profile });
  }

  return Object.freeze({ discoverRecentMessages, getMessage, getMessages, getProfile, loadRecentMailbox });
}
