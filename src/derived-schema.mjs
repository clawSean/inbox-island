import {
  BUCKETS,
  PERSISTED_ENGINE_VERSIONS,
  EVIDENCE_KINDS,
  LIMITS,
  RESULT_SCHEMA_VERSION,
  RISK_FLAGS,
  assertIdentifier,
} from "./contracts.mjs";

export const ACCOUNT_PREFIX = "inbox-island:account:";
export const RECORD_VERSION = "inbox-island-account-record-v1";
const STORE_VERSION = "inbox-island-derived-state-v1";
const forbiddenKeys = /(?:body|html|raw|mime|oauth|token|authorization|cookie|prompt|attachment)/iu;
const snapshotKeys = Object.freeze(["storeVersion", "accountId", "savedAt", "results"]);
const recordKeys = Object.freeze(["recordVersion", "accountId", "activeGeneration", "snapshot"]);
const resultKeys = Object.freeze([
  "schemaVersion", "engineVersion", "accountId", "threadId", "bucket", "confidence",
  "riskFlags", "evidence", "deadline", "sourceMessageIds", "processedAt",
  "untrustedEmailDerived", "canAuthorizeActions",
]);
const evidenceKeys = Object.freeze(["kind", "messageId", "field", "start", "end"]);
const deadlineKeys = Object.freeze(["messageId", "field", "start", "end"]);

function hasExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function validIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function assertNoRawFields(value, path = "state") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) throw new Error(`RAW_FIELD_REJECTED:${path}.${key}`);
    assertNoRawFields(child, `${path}.${key}`);
  }
}

function safeIdentifier(value, label) {
  try {
    assertIdentifier(value, label);
    return true;
  } catch {
    return false;
  }
}

export function isGeneration(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function validSpan(item, sourceIds) {
  return hasExactKeys(item, evidenceKeys) && EVIDENCE_KINDS.includes(item.kind)
    && safeIdentifier(item.messageId, "message_id") && sourceIds.has(item.messageId)
    && ["subject", "body"].includes(item.field)
    && Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end)
    && item.start >= 0 && item.end > item.start && item.end <= LIMITS.maxBodyChars;
}

function validDeadline(item, sourceIds) {
  return hasExactKeys(item, deadlineKeys) && safeIdentifier(item.messageId, "message_id")
    && sourceIds.has(item.messageId) && ["subject", "body"].includes(item.field)
    && Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end)
    && item.start >= 0 && item.end > item.start && item.end <= LIMITS.maxBodyChars;
}

function persistedResult(result, accountId) {
  if (!result || result.schemaVersion !== RESULT_SCHEMA_VERSION || result.accountId !== accountId
    || !BUCKETS.includes(result.bucket) || !Array.isArray(result.riskFlags)
    || result.riskFlags.some((flag) => !RISK_FLAGS.includes(flag))
    || !Array.isArray(result.evidence) || !Array.isArray(result.sourceMessageIds)) {
    throw new Error("INVALID_DERIVED_RESULT");
  }
  return {
    schemaVersion: result.schemaVersion,
    engineVersion: result.engineVersion,
    accountId: result.accountId,
    threadId: result.threadId,
    bucket: result.bucket,
    confidence: result.confidence,
    riskFlags: [...result.riskFlags],
    evidence: result.evidence.map(({ kind, messageId, field, start, end }) => ({
      kind, messageId, field, start, end,
    })),
    deadline: result.deadline ? {
      messageId: result.deadline.messageId,
      field: result.deadline.field,
      start: result.deadline.start,
      end: result.deadline.end,
    } : null,
    sourceMessageIds: [...result.sourceMessageIds],
    processedAt: result.processedAt,
    untrustedEmailDerived: true,
    canAuthorizeActions: false,
  };
}

export function validateSnapshot(snapshot, accountId) {
  if (!hasExactKeys(snapshot, snapshotKeys) || snapshot.storeVersion !== STORE_VERSION
    || snapshot.accountId !== accountId || !validIsoTimestamp(snapshot.savedAt)
    || !Array.isArray(snapshot.results) || snapshot.results.length > LIMITS.maxMessages) {
    throw new Error("CORRUPT_DERIVED_STATE");
  }
  assertNoRawFields(snapshot);
  for (const result of snapshot.results) {
    const sourceIds = new Set(Array.isArray(result?.sourceMessageIds) ? result.sourceMessageIds : []);
    if (!hasExactKeys(result, resultKeys) || result.schemaVersion !== RESULT_SCHEMA_VERSION
      || !PERSISTED_ENGINE_VERSIONS.includes(result.engineVersion) || result.accountId !== accountId
      || !safeIdentifier(result.threadId, "thread_id") || !BUCKETS.includes(result.bucket)
      || result.untrustedEmailDerived !== true || result.canAuthorizeActions !== false
      || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1
      || !Array.isArray(result.riskFlags) || result.riskFlags.length > RISK_FLAGS.length
      || new Set(result.riskFlags).size !== result.riskFlags.length
      || result.riskFlags.some((flag) => !RISK_FLAGS.includes(flag))
      || !Array.isArray(result.evidence) || result.evidence.length > 12
      || result.evidence.some((item) => !validSpan(item, sourceIds))
      || (result.deadline !== null && !validDeadline(result.deadline, sourceIds))
      || !Array.isArray(result.sourceMessageIds) || result.sourceMessageIds.length < 1
      || result.sourceMessageIds.length > LIMITS.maxMessages
      || sourceIds.size !== result.sourceMessageIds.length
      || result.sourceMessageIds.some((id) => !safeIdentifier(id, "message_id"))
      || !validIsoTimestamp(result.processedAt)) throw new Error("CORRUPT_DERIVED_STATE");
  }
  return structuredClone(snapshot);
}

export function createSnapshot(accountId, savedAt, results) {
  assertNoRawFields(results);
  const snapshot = {
    storeVersion: STORE_VERSION,
    accountId,
    savedAt,
    results: results.map((result) => persistedResult(result, accountId)),
  };
  return validateSnapshot(snapshot, accountId);
}

export function validateRecord(record, accountId) {
  if (!hasExactKeys(record, recordKeys) || record.recordVersion !== RECORD_VERSION
    || record.accountId !== accountId
    || (record.activeGeneration !== null && !isGeneration(record.activeGeneration))
    || (record.snapshot !== null && typeof record.snapshot !== "object")) {
    throw new Error("CORRUPT_DERIVED_STATE");
  }
  assertNoRawFields(record);
  if (record.snapshot !== null) validateSnapshot(record.snapshot, accountId);
  return structuredClone(record);
}
