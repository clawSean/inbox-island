import {
  INFERENCE_ENGINE_VERSION,
  validateTriageResult,
} from "./contracts.mjs";

export const INFERENCE_INPUT_VERSION = "inbox-island-inference-input-v1";
export const INFERENCE_CANDIDATE_VERSION = "inbox-island-inference-candidate-v1";

const candidateKeys = Object.freeze([
  "schemaVersion",
  "threadId",
  "bucket",
  "confidence",
  "summary",
  "requestedAction",
  "deadline",
  "evidence",
]);
const allowedFailureCodes = new Set([
  "INFERENCE_FAILED",
  "INFERENCE_TIMEOUT",
  "INVALID_CANDIDATE_KEYS",
  "INVALID_CANDIDATE_VERSION",
  "INCONSISTENT_CANDIDATE_EVIDENCE",
  "MISSING_CANDIDATE_EVIDENCE",
  "STALE_CANDIDATE",
  "UNSAFE_CANDIDATE_BUCKET",
]);

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function inferenceInput(messages) {
  return Object.freeze({
    schemaVersion: INFERENCE_INPUT_VERSION,
    threadId: messages.at(-1).threadId,
    messages: Object.freeze(messages.map((message) => Object.freeze({
      id: message.id,
      direction: message.direction,
      timestamp: message.timestamp,
      from: message.from,
      to: message.to,
      subject: message.subject,
      body: message.body,
      riskFlags: message.flags,
    }))),
  });
}

function failedResult(base, sourceMessages, code) {
  const result = {
    ...structuredClone(base),
    engineVersion: INFERENCE_ENGINE_VERSION,
    bucket: "uncertain",
    confidence: 0,
    summary: "Local inference did not produce a valid result; the thread requires manual review.",
    requestedAction: "Review the source thread manually; Inbox Island will not act on it.",
    deadline: null,
    reasons: [...new Set([...base.reasons, `Inference failure: ${code}`])].slice(0, 12),
  };
  return validateTriageResult(result, sourceMessages);
}

function applyCandidate(base, candidate, sourceMessages) {
  if (!exactKeys(candidate, candidateKeys)) throw new Error("INVALID_CANDIDATE_KEYS");
  if (candidate.schemaVersion !== INFERENCE_CANDIDATE_VERSION) throw new Error("INVALID_CANDIDATE_VERSION");
  if (candidate.threadId !== base.threadId) throw new Error("STALE_CANDIDATE");
  if (candidate.bucket === "waiting") throw new Error("UNSAFE_CANDIDATE_BUCKET");
  if (candidate.deadline !== null && !["attention", "reply"].includes(candidate.bucket)) {
    throw new Error("UNSAFE_CANDIDATE_BUCKET");
  }
  if (candidate.bucket !== "uncertain"
    && (!Array.isArray(candidate.evidence) || candidate.evidence.length < 1)) {
    throw new Error("MISSING_CANDIDATE_EVIDENCE");
  }
  const kinds = new Set(candidate.evidence.map(({ kind }) => kind));
  if ((candidate.bucket === "reply" && !kinds.has("request"))
    || (candidate.bucket === "attention"
      && !["attention", "credential-risk", "deadline", "suspicious-link"]
        .some((kind) => kinds.has(kind)))
    || (["record", "noise"].includes(candidate.bucket) && !kinds.has("classification"))) {
    throw new Error("INCONSISTENT_CANDIDATE_EVIDENCE");
  }
  const result = {
    ...structuredClone(base),
    engineVersion: INFERENCE_ENGINE_VERSION,
    bucket: candidate.bucket,
    confidence: candidate.confidence,
    summary: candidate.summary,
    requestedAction: candidate.requestedAction,
    deadline: candidate.deadline ?? base.deadline,
    evidence: [...new Set([...base.evidence, ...candidate.evidence].map((item) => JSON.stringify(item)))]
      .map((item) => JSON.parse(item))
      .slice(0, 12),
    reasons: [...new Set([...base.reasons, "Validated local inference candidate"])].slice(0, 12),
  };
  return validateTriageResult(result, sourceMessages);
}

export async function refineWithInference(base, sourceMessages, infer, { timeoutMs = 2_000 } = {}) {
  if (typeof infer !== "function") return base;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("INVALID_INFERENCE_TIMEOUT");
  }
  if (base.bucket !== "uncertain" || base.confidence <= 0
    || base.riskFlags.length || base.deadline !== null) return base;

  let timer;
  const controller = new AbortController();
  try {
    const candidate = await Promise.race([
      Promise.resolve().then(() => infer(inferenceInput(sourceMessages), { signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort("INFERENCE_TIMEOUT");
          reject(new Error("INFERENCE_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
    return applyCandidate(base, candidate, sourceMessages);
  } catch (error) {
    const code = String(error?.message || "INFERENCE_FAILED");
    const allowedCode = allowedFailureCodes.has(code) ? code : "INFERENCE_FAILED";
    return failedResult(base, sourceMessages, allowedCode);
  } finally {
    clearTimeout(timer);
  }
}
