import { ENGINE_VERSION, RESULT_SCHEMA_VERSION, validateTriageResult } from "./contracts.mjs";
import { injectionPattern, credentialPattern, attentionPattern, implicitReplyPattern,
  stateChangeAttentionPattern, recordPattern, noisePattern, promotionPattern,
  marketingCtaPattern, marketingAskPattern, feedbackCampaignPattern,
  optionalEngagementPattern, automatedCalendarPattern, liveAttentionPattern,
  sourceText, matchEvidence, matchUnnegatedEvidence, requestEvidence,
  decodedInjectionEvidence, deadlineCandidates, safeSummary } from "./triage-evidence.mjs";
function unique(values) { return [...new Set(values)]; }
function classify({ latest, risks, ask, attention, deadlines }) {
  const text = sourceText(latest);
  const incomplete = risks.some((risk) => ["malformed_content", "oversized_input"].includes(risk));
  if (incomplete) return { bucket: "uncertain", confidence: 0, reason: "Message content was incomplete" };
  if (risks.some((risk) => ["encoded_injection", "prompt_injection"].includes(risk))) {
    return { bucket: "uncertain", confidence: 0, reason: "Instruction-like email text was not used for classification" };
  }
  if (risks.includes("conflicting_deadlines")) return { bucket: "uncertain", confidence: 0, reason: "Multiple deadline candidates conflict" };
  if (latest.direction === "outbound") {
    return { bucket: "waiting", confidence: 0.94, reason: "Latest message was sent by the user" };
  }
  if (risks.includes("credential_request") || risks.includes("suspicious_link")) {
    return { bucket: "attention", confidence: 0.98, reason: "The message requests credentials or account action" };
  }
  const optionalEngagement = matchEvidence(latest,
    new RegExp(`${feedbackCampaignPattern.source}|${optionalEngagementPattern.source}`, "iu"),
    "classification");
  if (optionalEngagement) return { bucket: "noise", confidence: 0.94,
    reason: "Optional engagement campaign detected", evidence: optionalEngagement };
  const promotion = matchEvidence(latest, promotionPattern, "classification");
  if (promotion) return ask || attention || deadlines.length
    ? { bucket: "uncertain", confidence: 0.35,
      reason: "Promotional context conflicts with a work-like cue", evidence: promotion }
    : { bucket: "noise", confidence: 0.9,
      reason: "Strong promotional or bulk context detected", evidence: promotion };
  const calendarChange = matchEvidence(latest, automatedCalendarPattern, "classification");
  if (calendarChange) return { bucket: "attention", confidence: 0.88,
    reason: "Calendar event changed", evidence: calendarChange };
  const liveAttention = matchEvidence(latest, liveAttentionPattern, "classification");
  if (liveAttention) return { bucket: "attention", confidence: 0.86,
    reason: "A live transaction or calendar item needs review", evidence: liveAttention };
  if (ask) return { bucket: "reply", confidence: 0.9, reason: "Latest inbound message contains a direct request" };
  if (attention || deadlines.length) {
    return { bucket: "attention", confidence: 0.88, reason: "Latest inbound message contains urgency or a deadline" };
  }
  const implicitReply = requestEvidence(latest, implicitReplyPattern);
  if (implicitReply) return { bucket: "reply", confidence: 0.86,
    reason: "Latest inbound message implies a reply obligation", evidence: implicitReply };
  const stateChangeAttention = matchEvidence(latest, stateChangeAttentionPattern, "attention");
  if (stateChangeAttention) return { bucket: "attention", confidence: 0.84,
    reason: "Latest inbound message describes a near-term state change", evidence: stateChangeAttention };
  const record = matchEvidence(latest, recordPattern, "classification");
  if (record) return { bucket: "record", confidence: 0.88,
    reason: "Transactional record detected", evidence: record };
  const bulk = matchEvidence(latest, noisePattern, "classification");
  if (bulk) return { bucket: "noise", confidence: 0.9,
    reason: "Bulk or promotional message detected", evidence: bulk };
  return { bucket: "uncertain", confidence: 0.35, reason: "No safe high-confidence category matched" };
}
export function triageThread(accountId, messages, { now = () => new Date() } = {}) {
  const ordered = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  if (!ordered.length) throw new Error("EMPTY_THREAD");
  const latest = ordered.at(-1);
  const evidence = [];
  const risks = new Set(ordered.flatMap((message) => message.flags));
  for (const message of ordered) {
    const injection = matchEvidence(message, injectionPattern, "prompt-injection");
    if (injection) {
      risks.add("prompt_injection");
      evidence.push(injection);
    }
    const encoded = decodedInjectionEvidence(message);
    if (encoded) {
      risks.add("encoded_injection");
      evidence.push(encoded);
    }
  }
  const latestText = `${latest.subject}\n${latest.body}`; const request = requestEvidence(latest); const suppressPromoCues = feedbackCampaignPattern.test(latestText) || optionalEngagementPattern.test(latestText) || (promotionPattern.test(latestText) && marketingCtaPattern.test(latestText) && (!request || marketingAskPattern.test(request.quote)));
  const ask = suppressPromoCues ? null : request; const attention = suppressPromoCues ? null : matchEvidence(latest, attentionPattern, "attention");
  const credential = matchUnnegatedEvidence(latest, credentialPattern, "credential-risk");
  if (credential) {
    risks.add("credential_request");
    evidence.push(credential);
  }
  if (/\b(?:https?|wss?):\/\/\S+/iu.test(latestText)
    && (credential || /\b(?:verify|login|account|payment)\b/iu.test(latestText))) {
    risks.add("suspicious_link");
    const link = matchEvidence(latest, /\b(?:https?|wss?):\/\/\S+/iu, "suspicious-link");
    if (link) evidence.push(link);
  }
  const deadlines = suppressPromoCues ? [] : deadlineCandidates(latest);
  if (new Set(deadlines.map(({ text }) => text.toLowerCase())).size > 1) {
    risks.add("conflicting_deadlines");
  }
  if (ask) evidence.push(ask);
  if (attention) evidence.push(attention);
  if (deadlines[0]) evidence.push({
    kind: "deadline",
    messageId: deadlines[0].messageId,
    field: deadlines[0].field,
    start: deadlines[0].start,
    end: deadlines[0].end,
    quote: deadlines[0].quote,
  });
  const classification = classify({ latest, risks: [...risks], ask, attention, deadlines });
  if (classification.evidence) evidence.push(classification.evidence);
  const incomplete = classification.reason === "Message content was incomplete";
  const requestedAction = ({
    attention: "Review the cited risk or deadline; Inbox Island will not act on the message.", reply: "Review the cited request and decide whether to reply.",
    uncertain: "Review the source message manually; Inbox Island could not classify it confidently.", waiting: "Wait for a response or revisit the thread manually.",
  })[classification.bucket] || null;
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION, engineVersion: ENGINE_VERSION,
    accountId, threadId: latest.threadId,
    bucket: classification.bucket, confidence: classification.confidence,
    summary: safeSummary(latest, incomplete),
    requestedAction,
    deadline: deadlines.length === 1 ? deadlines[0] : null,
    reasons: unique([classification.reason, ...[...risks].map((risk) => `Risk flag: ${risk}`)]),
    riskFlags: [...risks].sort(),
    evidence: unique(evidence.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)).slice(0, 12),
    sourceMessageIds: ordered.map(({ id }) => id),
    processedAt: now().toISOString(), untrustedEmailDerived: true, canAuthorizeActions: false,
  };
  return validateTriageResult(result, ordered);
}
