export const RESULT_SCHEMA_VERSION = "inbox-island-triage-v1";
const ENGINE_GENERATION = 3;
export const ENGINE_VERSION = `deterministic-cues-v${ENGINE_GENERATION}`;
export const INFERENCE_ENGINE_VERSION = `local-inference-gate-v${ENGINE_GENERATION}`;
export const ENGINE_VERSIONS = Object.freeze([ENGINE_VERSION, INFERENCE_ENGINE_VERSION]);
export const PERSISTED_ENGINE_VERSIONS = Object.freeze([
  ...ENGINE_VERSIONS,
  "deterministic-baseline-v1",
  "local-inference-gate-v1",
  "deterministic-cues-v2",
  "local-inference-gate-v2",
]);

export const BUCKETS = Object.freeze([
  "reply",
  "attention",
  "waiting",
  "record",
  "noise",
  "uncertain",
]);

export const RISK_FLAGS = Object.freeze([
  "attachment_unsupported",
  "alternative_mismatch",
  "conflicting_deadlines",
  "credential_request",
  "encoded_injection",
  "hidden_content",
  "malformed_content",
  "oversized_input",
  "prompt_injection",
  "suspicious_link",
]);

export const EVIDENCE_KINDS = Object.freeze([
  "attention",
  "classification",
  "credential-risk",
  "deadline",
  "encoded-injection",
  "prompt-injection",
  "request",
  "suspicious-link",
]);

export const LIMITS = Object.freeze({
  maxMessages: 500,
  maxParts: 64,
  maxMimeDepth: 8,
  maxDecodedBytes: 128 * 1024,
  maxBodyChars: 48_000,
  maxHeaderChars: 2_000,
  maxEvidenceChars: 240,
  maxSummaryChars: 280,
});

const resultKeys = Object.freeze([
  "schemaVersion",
  "engineVersion",
  "accountId",
  "threadId",
  "bucket",
  "confidence",
  "summary",
  "requestedAction",
  "deadline",
  "reasons",
  "riskFlags",
  "evidence",
  "sourceMessageIds",
  "processedAt",
  "untrustedEmailDerived",
  "canAuthorizeActions",
]);

const evidenceKeys = Object.freeze(["kind", "messageId", "field", "start", "end", "quote"]);
const deadlineKeys = Object.freeze(["messageId", "field", "start", "end", "quote", "text"]);

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function boundedString(value, max, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function assertIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:@+-]{1,160}$/u.test(value)) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
  return value;
}

export function validateTriageResult(result, sourceMessages) {
  if (!exactKeys(result, resultKeys)) throw new Error("INVALID_RESULT_KEYS");
  if (result.schemaVersion !== RESULT_SCHEMA_VERSION) throw new Error("INVALID_SCHEMA_VERSION");
  if (!ENGINE_VERSIONS.includes(result.engineVersion)) throw new Error("INVALID_ENGINE_VERSION");
  assertIdentifier(result.accountId, "account_id");
  assertIdentifier(result.threadId, "thread_id");
  if (!BUCKETS.includes(result.bucket)) throw new Error("INVALID_BUCKET");
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    throw new Error("INVALID_CONFIDENCE");
  }
  if (!boundedString(result.summary, LIMITS.maxSummaryChars)) throw new Error("INVALID_SUMMARY");
  if (result.requestedAction !== null
    && !boundedString(result.requestedAction, LIMITS.maxSummaryChars)) {
    throw new Error("INVALID_REQUESTED_ACTION");
  }
  if (/\b(?:https?|wss?):\/\//iu.test(`${result.summary}\n${result.requestedAction || ""}`)) {
    throw new Error("ACTIVE_URL_OUTSIDE_EVIDENCE");
  }
  if (!Array.isArray(result.reasons) || result.reasons.length < 1 || result.reasons.length > 12
    || result.reasons.some((reason) => !boundedString(reason, 120))) {
    throw new Error("INVALID_REASONS");
  }
  if (!Array.isArray(result.riskFlags) || result.riskFlags.length > RISK_FLAGS.length
    || result.riskFlags.some((flag) => !RISK_FLAGS.includes(flag))
    || new Set(result.riskFlags).size !== result.riskFlags.length) {
    throw new Error("INVALID_RISK_FLAGS");
  }
  if (!Array.isArray(result.sourceMessageIds) || result.sourceMessageIds.length < 1
    || new Set(result.sourceMessageIds).size !== result.sourceMessageIds.length) {
    throw new Error("INVALID_SOURCE_IDS");
  }

  const sourceById = new Map(sourceMessages.map((message) => [message.id, message]));
  if (result.sourceMessageIds.some((id) => !sourceById.has(id))) throw new Error("UNKNOWN_SOURCE_ID");
  if (!Array.isArray(result.evidence) || result.evidence.length > 12) {
    throw new Error("INVALID_EVIDENCE");
  }
  for (const item of result.evidence) {
    if (!exactKeys(item, evidenceKeys) || !EVIDENCE_KINDS.includes(item.kind)
      || !["subject", "body"].includes(item.field)
      || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end)
      || item.start < 0 || item.end <= item.start
      || !boundedString(item.quote, LIMITS.maxEvidenceChars)) {
      throw new Error("INVALID_EVIDENCE_ITEM");
    }
    const source = sourceById.get(item.messageId);
    if (!source || !result.sourceMessageIds.includes(item.messageId)
      || source[item.field].slice(item.start, item.end) !== item.quote) {
      throw new Error("UNBOUND_EVIDENCE");
    }
  }
  if (result.deadline !== null) {
    if (!exactKeys(result.deadline, deadlineKeys)
      || !boundedString(result.deadline.text, 120)
      || !["subject", "body"].includes(result.deadline.field)
      || !Number.isSafeInteger(result.deadline.start) || !Number.isSafeInteger(result.deadline.end)
      || result.deadline.start < 0 || result.deadline.end <= result.deadline.start
      || !boundedString(result.deadline.quote, LIMITS.maxEvidenceChars)) {
      throw new Error("INVALID_DEADLINE");
    }
    const source = sourceById.get(result.deadline.messageId);
    if (!source || source[result.deadline.field].slice(result.deadline.start, result.deadline.end)
      !== result.deadline.quote) {
      throw new Error("UNBOUND_DEADLINE");
    }
    if (!result.deadline.quote.toLocaleLowerCase().includes(
      result.deadline.text.toLocaleLowerCase(),
    )) throw new Error("UNBOUND_DEADLINE_TEXT");
    if (!result.evidence.some((item) => item.kind === "deadline"
      && item.messageId === result.deadline.messageId && item.field === result.deadline.field
      && item.start === result.deadline.start && item.end === result.deadline.end
      && item.quote === result.deadline.quote)) {
      throw new Error("MISSING_DEADLINE_EVIDENCE");
    }
  }
  if (!validIsoTimestamp(result.processedAt)) throw new Error("INVALID_PROCESSED_AT");
  if (result.untrustedEmailDerived !== true || result.canAuthorizeActions !== false) {
    throw new Error("INVALID_AUTHORITY_FLAGS");
  }
  return deepFreeze(structuredClone(result));
}
