const MESSAGE_ID = /^[A-Za-z0-9_-]{1,256}$/u;
const ATTACHMENT_ID = /^[\u0021-\u007e]{1,4096}$/u;
const EMAIL_ADDRESS = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,255}$/u;
export const PAGE_TOKEN = /^[\u0021-\u007e]{1,1024}$/u;

function fail(code) {
  throw new Error(code);
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function assertMessageId(value, code = "GMAIL_MESSAGE_ID_INVALID") {
  if (typeof value !== "string" || !MESSAGE_ID.test(value)) fail(code);
  return value;
}

export function projectMessageReference(reference) {
  if (typeof reference === "string") {
    const id = assertMessageId(reference);
    return Object.freeze({ id, threadId: id, verifyThreadId: false });
  }
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    fail("GMAIL_MESSAGE_BATCH_INVALID");
  }
  return Object.freeze({
    id: assertMessageId(reference.id),
    threadId: assertMessageId(reference.threadId, "GMAIL_THREAD_ID_INVALID"),
    verifyThreadId: true,
  });
}

export function projectRejectedMessage(reference, code) {
  return deepFreeze({
    id: reference.id,
    threadId: reference.threadId,
    internalDate: "0",
    labelIds: [],
    payload: { mimeType: "text/plain", filename: "", body: {} },
    pilotFetchError: code,
  });
}

export function projectProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.emailAddress !== "string" || value.emailAddress.length > 320
    || !EMAIL_ADDRESS.test(value.emailAddress)
    || typeof value.historyId !== "string" || !/^\d{1,32}$/u.test(value.historyId)
    || !Number.isSafeInteger(value.messagesTotal) || value.messagesTotal < 0
    || !Number.isSafeInteger(value.threadsTotal) || value.threadsTotal < 0) {
    fail("GMAIL_PROFILE_SCHEMA_INVALID");
  }
  return deepFreeze({
    accountId: value.emailAddress,
    emailAddress: value.emailAddress,
    historyId: value.historyId,
    messagesTotal: value.messagesTotal,
    threadsTotal: value.threadsTotal,
  });
}

export function projectListPage(value, requested) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("GMAIL_LIST_SCHEMA_INVALID");
  }
  const messages = value.messages ?? [];
  if (!Array.isArray(messages) || messages.length > requested) fail("GMAIL_LIST_SCHEMA_INVALID");
  const projected = messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      fail("GMAIL_LIST_SCHEMA_INVALID");
    }
    return Object.freeze({
      id: assertMessageId(message.id, "GMAIL_LIST_SCHEMA_INVALID"),
      threadId: assertMessageId(message.threadId, "GMAIL_LIST_SCHEMA_INVALID"),
    });
  });
  const nextPageToken = value.nextPageToken ?? null;
  if (nextPageToken !== null
    && (typeof nextPageToken !== "string" || !PAGE_TOKEN.test(nextPageToken))) {
    fail("GMAIL_PAGE_TOKEN_INVALID");
  }
  return { messages: projected, nextPageToken };
}

function copyHeaders(headers) {
  if (headers === undefined) return undefined;
  if (!Array.isArray(headers) || headers.length > 128) fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  return headers.map((header) => {
    if (!header || typeof header !== "object" || Array.isArray(header)
      || typeof header.name !== "string" || header.name.length > 256
      || typeof header.value !== "string" || header.value.length > 16_000) {
      fail("GMAIL_MESSAGE_SCHEMA_INVALID");
    }
    return { name: header.name, value: header.value };
  });
}

function copyPart(part, state, depth = 0) {
  if (!part || typeof part !== "object" || Array.isArray(part) || depth > 8) {
    fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  }
  state.parts += 1;
  if (state.parts > 64) fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  const mimeType = typeof part.mimeType === "string" ? part.mimeType : "text/plain";
  const filename = typeof part.filename === "string" ? part.filename : "";
  if (mimeType.length > 256 || filename.length > 1024) fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  const body = part.body ?? {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  }
  const attachmentId = body.attachmentId;
  if (attachmentId !== undefined
    && (typeof attachmentId !== "string" || !ATTACHMENT_ID.test(attachmentId))) {
    fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  }
  if (body.size !== undefined && (!Number.isSafeInteger(body.size) || body.size < 0)) {
    fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  }
  const attachmentLike = Boolean(filename || attachmentId || mimeType === "message/rfc822");
  const projectedBody = {};
  if (attachmentId !== undefined) projectedBody.attachmentId = attachmentId;
  if (body.size !== undefined) projectedBody.size = body.size;
  if (!attachmentLike && ["text/plain", "text/html"].includes(mimeType.toLowerCase())
    && body.data !== undefined) {
    if (typeof body.data !== "string" || body.data.length > 700_000) {
      fail("GMAIL_MESSAGE_SCHEMA_INVALID");
    }
    projectedBody.data = body.data;
  }
  const projected = { mimeType, filename, body: projectedBody };
  const headers = copyHeaders(part.headers);
  if (headers !== undefined) projected.headers = headers;
  if (!attachmentLike && part.parts !== undefined) {
    if (!Array.isArray(part.parts)) fail("GMAIL_MESSAGE_SCHEMA_INVALID");
    projected.parts = part.parts.map((child) => copyPart(child, state, depth + 1));
  }
  return projected;
}

export function projectMessage(value, requestedId) {
  const internalDate = Number(value?.internalDate);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.id !== requestedId || typeof value.internalDate !== "string"
    || !/^\d{1,20}$/u.test(value.internalDate) || !Number.isSafeInteger(internalDate)
    || internalDate <= 0 || internalDate > 8_640_000_000_000_000
    || !Array.isArray(value.labelIds) || value.labelIds.length > 64
    || value.labelIds.some((label) => typeof label !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/u.test(label))) {
    fail("GMAIL_MESSAGE_SCHEMA_INVALID");
  }
  return deepFreeze({
    id: assertMessageId(value.id, "GMAIL_MESSAGE_SCHEMA_INVALID"),
    threadId: assertMessageId(value.threadId, "GMAIL_MESSAGE_SCHEMA_INVALID"),
    internalDate: value.internalDate,
    labelIds: [...value.labelIds],
    payload: copyPart(value.payload, { parts: 0 }),
  });
}
