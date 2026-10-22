import { LIMITS, assertIdentifier } from "./contracts.mjs";
import {
  alternativesMismatch,
  normalizeWhitespace,
  sanitizeHtml,
  stripQuotedReply,
} from "./content-safety.mjs";

const textDecoder = new TextDecoder("utf-8", { fatal: false });
const pilotFetchErrors = new Set([
  "GMAIL_HTTP_ERROR_404",
  "GMAIL_MESSAGE_SCHEMA_INVALID",
  "GMAIL_RESPONSE_INVALID_JSON",
  "GMAIL_RESPONSE_TOO_LARGE",
]);

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function trustedPilotFetchError(raw) {
  if (!exactKeys(raw, [
    "id", "threadId", "internalDate", "labelIds", "payload", "pilotFetchError",
  ]) || !pilotFetchErrors.has(raw.pilotFetchError) || raw.internalDate !== "0"
    || !Array.isArray(raw.labelIds) || raw.labelIds.length !== 0
    || !exactKeys(raw.payload, ["mimeType", "filename", "body"])
    || raw.payload.mimeType !== "text/plain" || raw.payload.filename !== ""
    || !exactKeys(raw.payload.body, [])) return null;
  try {
    assertIdentifier(raw.id, "message_id");
    assertIdentifier(raw.threadId, "thread_id");
  } catch {
    return null;
  }
  return raw.pilotFetchError;
}

function decodeBase64Url(value, budget) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/u.test(value)) {
    throw new Error("MALFORMED_BASE64URL");
  }
  const unpadded = value.replace(/=+$/u, "");
  const estimated = Math.floor((unpadded.length * 3) / 4);
  if (estimated > budget) throw new Error("OVERSIZED_INPUT");
  const base64 = unpadded.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(
    unpadded.length + ((4 - (unpadded.length % 4)) % 4),
    "=",
  );
  let binary;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("MALFORMED_BASE64URL");
  }
  if (binary.length > budget) throw new Error("OVERSIZED_INPUT");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return textDecoder.decode(bytes);
}

function headersFrom(payload) {
  const headers = new Map();
  if (!Array.isArray(payload?.headers)) return headers;
  for (const header of payload.headers) {
    if (typeof header?.name !== "string" || typeof header?.value !== "string") continue;
    const name = header.name.toLowerCase();
    const value = normalizeWhitespace(header.value).slice(0, LIMITS.maxHeaderChars);
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
}

function collectTextParts(part, state, depth = 0) {
  if (!part || typeof part !== "object") throw new Error("MALFORMED_MIME");
  if (depth > LIMITS.maxMimeDepth) throw new Error("MALFORMED_MIME");
  state.parts += 1;
  if (state.parts > LIMITS.maxParts) throw new Error("MALFORMED_MIME");

  const mimeType = String(part.mimeType || "text/plain").toLowerCase();
  if (part.filename || part.body?.attachmentId || mimeType === "message/rfc822") {
    state.flags.add("attachment_unsupported");
    return;
  }
  if (typeof part.body?.data === "string") {
    const decoded = decodeBase64Url(part.body.data, LIMITS.maxDecodedBytes - state.bytes);
    state.bytes += new TextEncoder().encode(decoded).byteLength;
    if (state.bytes > LIMITS.maxDecodedBytes) throw new Error("OVERSIZED_INPUT");
    if (mimeType === "text/plain") state.plain.push(decoded);
    if (mimeType === "text/html") state.html.push(decoded);
  }
  if (part.parts !== undefined && !Array.isArray(part.parts)) throw new Error("MALFORMED_MIME");
  for (const child of part.parts || []) collectTextParts(child, state, depth + 1);
}

function safeTimestamp(raw, headers) {
  const internal = Number(raw.internalDate);
  if (Number.isFinite(internal) && internal > 0) return new Date(internal).toISOString();
  const parsed = Date.parse(headers.get("date") || "");
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  throw new Error("MALFORMED_DATE");
}

function rejectedMessage(raw, code) {
  const safeId = (value, fallback) => String(value || fallback)
    .replace(/[^A-Za-z0-9._:@+-]/gu, "_")
    .slice(0, 160) || fallback;
  const id = safeId(raw?.id, "unknown-message");
  const threadId = safeId(raw?.threadId, `rejected-${id}`);
  const oversized = code === "OVERSIZED_INPUT" || code === "GMAIL_RESPONSE_TOO_LARGE";
  return Object.freeze({
    id,
    threadId,
    direction: "inbound",
    timestamp: "1970-01-01T00:00:00.000Z",
    from: "Unknown sender",
    to: "",
    subject: "Message could not be safely normalized",
    body: oversized ? "Oversized message withheld" : "Malformed message withheld",
    labels: Object.freeze([]),
    flags: Object.freeze([oversized ? "oversized_input" : "malformed_content"]),
    normalizationError: code,
  });
}

export function normalizeGmailMessage(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("MALFORMED_MESSAGE");
    const pilotFetchError = trustedPilotFetchError(raw);
    if (pilotFetchError) return rejectedMessage(raw, pilotFetchError);
    const id = assertIdentifier(raw.id, "message_id");
    const threadId = assertIdentifier(raw.threadId || raw.id, "thread_id");
    const labels = Array.isArray(raw.labelIds)
      ? raw.labelIds.filter((label) => typeof label === "string").slice(0, 64)
      : [];
    const headers = headersFrom(raw.payload);
    const state = { bytes: 0, flags: new Set(), html: [], parts: 0, plain: [] };
    collectTextParts(raw.payload || {}, state);
    const plain = normalizeWhitespace(state.plain.join("\n"));
    const sanitizedHtml = sanitizeHtml(state.html.join("\n"));
    let body;
    if (state.plain.length) {
      const missingLinks = sanitizedHtml.links.filter((link) => !plain.includes(link));
      const linkText = missingLinks.map((link) => `Link target: ${link}`).join("\n");
      body = normalizeWhitespace(`${plain.slice(0, Math.max(0, LIMITS.maxBodyChars - linkText.length - 1))}\n${linkText}`);
    } else {
      body = sanitizedHtml.text;
    }
    if (sanitizedHtml.hidden) state.flags.add("hidden_content");
    if (state.plain.length && state.html.length
      && alternativesMismatch(plain, sanitizedHtml.text)) state.flags.add("alternative_mismatch");
    const quoteState = stripQuotedReply(body.slice(0, LIMITS.maxBodyChars));
    return Object.freeze({
      id,
      threadId,
      direction: labels.includes("SENT") ? "outbound" : "inbound",
      timestamp: safeTimestamp(raw, headers),
      from: headers.get("from") || "Unknown sender",
      to: headers.get("to") || "",
      subject: headers.get("subject") || "(no subject)",
      body: quoteState.body,
      labels: Object.freeze([...labels]),
      flags: Object.freeze([...state.flags].sort()),
      normalizationError: null,
    });
  } catch (error) {
    return rejectedMessage(raw, String(error?.message || "MALFORMED_CONTENT"));
  }
}

export function normalizeMailbox(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length > LIMITS.maxMessages) {
    throw new Error("INVALID_MAILBOX_BATCH");
  }
  const deduplicated = new Map();
  for (const raw of rawMessages) {
    const normalized = normalizeGmailMessage(raw);
    const existing = deduplicated.get(normalized.id);
    if (!existing) {
      deduplicated.set(normalized.id, normalized);
      continue;
    }
    const latest = existing.timestamp >= normalized.timestamp ? existing : normalized;
    deduplicated.set(normalized.id, Object.freeze({
      ...latest,
      flags: Object.freeze([...new Set([...existing.flags, ...normalized.flags, "malformed_content"])].sort()),
      normalizationError: "DUPLICATE_MESSAGE_ID",
    }));
  }
  return Object.freeze([...deduplicated.values()]);
}
