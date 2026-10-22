import { ENGINE_VERSION, LIMITS, RESULT_SCHEMA_VERSION, validateTriageResult } from "./contracts.mjs";
const injectionPattern = /\b(?:ignore|disregard|override)\b[\s\S]{0,48}\b(?:instructions?|prompt|policy|rules?)\b|\b(?:system|developer|assistant)\s+(?:message|prompt)\b|\btool\s*call\b|\breveal\b[\s\S]{0,32}\b(?:token|prompt|secret)\b/iu;
const credentialPattern = /\b(?:password|passcode|verification code|one[- ]time code|2fa|seed phrase|private key|login credentials?|social security|bank account)\b/iu;
const attentionPattern = /\b(?:urgent|action required|past due|overdue|security alert|immediately|time[- ]sensitive|final notice)\b/iu;
const askPattern = /\bplease\s+(?:reply|respond|confirm|approve|review|send|share|sign|choose|select|provide)\b|^\s*(?:(?:reply|respond)\s+(?:to|with|by)\b|(?:confirm|approve|review|send|share|sign|choose|select|provide)\s+(?:the|this|that|your|a|an|whether|which|by)\b)|\b(?:can|could|would|will)\s+you\s+(?:reply|respond|confirm|approve|review|send|share|sign|choose|select|provide|check|take|complete|update|verify|forward|return|upload|submit|call|schedule|tell|answer)\b|\bneed\s+you\s+to\b|\blet me know\b|\b(?:do|does|would|will|can|could)\b[^?;\n]{0,120}\b(?:work|fit|suit)\s+for\s+you\b[^?;\n]{0,40}\?|\b(?:are|will|would)\s+you\s+(?:available|able)\b[^?;\n]{0,80}\?|\b(?:do|would)\s+you\s+(?:approve|confirm|prefer|choose|want|need|agree)\b[^?;\n]{0,80}\?/iu;
const noReplyPattern = /\b(?:(?:do not|don't)\s+(?:reply|respond)|no\s+(?:reply|response)\s+(?:is\s+)?(?:needed|required|requested)|(?:reply|response)\s+(?:is\s+)?not\s+(?:needed|required|requested)|(?:no longer|do not|don't|does not|doesn't|did not|didn't|never)\s+(?:need|needs|require|requires|await|awaits)\s+(?:your\s+)?(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?)|(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?)\s+(?:is|are|was|were)\s+(?:not|no longer)\s+(?:needed|required|requested|outstanding)|no (?:need|action) to (?:reply|respond)|no response (?:is )?requested)\b/iu;
const implicitReplyPattern = /\b(?:(?:need|needs|require|requires|await|awaits)\s+your\s+(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)|(?:waiting|holding|blocked|paused|pending)\b[^.!?;\n]{0,80}\b(?:until|for)\s+your\s+(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)|(?:a|your)\s+(?:(?:brief|quick|short|final|written)\s+)?(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)\b[^.!?;\n]{0,96}\b(?:would\s+(?:help|allow|enable|unblock)|(?:is|are)\s+(?:the\s+)?(?:last|remaining|outstanding)\s+(?:item|step|requirement|condition|blocker|piece|input|document|signature)|remains?\s+outstanding|determines?|controls?|sets?|will\s+(?:determine|allow|enable|unblock)))\b/iu;
const stateChangeAttentionPattern = /\b(?:(?:signing\s+)?certificate|authorization|coverage|enrollment(?:\s+(?:period|window))?|(?:appeal|response|filing|renewal|application|submission|claim|payment|maintenance|service)\s+(?:window|period|deadline)?|(?:company\s+)?domain|account|license|permit|policy|warranty|subscription|registration|reservation|access|session)\b\s+(?:will\s+)?(?:expires?|closes?|ends?|enters?\s+(?:[\p{L}\d-]+\s+){1,3}(?:status|state|phase))\b[^.!?;\n]{0,96}\b(?:in\s+(?:\d{1,2}|[\p{L}]+(?:-[\p{L}]+)?)\s+(?:minutes?|hours?|days?)|this\s+(?:morning|afternoon|evening|week|weekend)|at\s+(?:midnight|noon)|next\s+(?:business\s+)?day|tomorrow(?:\s+(?:morning|afternoon|evening))?)\b/iu;
const recordPattern = /\b(?:receipt|payment received|paid invoice|order confirmation|reservation confirmed|statement available|tax document|shipping confirmation)\b/iu;
const noisePattern = /\b(?:unsubscribe|newsletter|weekly digest|daily digest|sale ends|limited[- ]time offer|promotion|sponsored)\b/iu;
const promotionPattern = /\b(?:newsletter|weekly digest|daily digest|sale|discount|coupon|promotion|sponsored(?:\s+promotion)?|member offer|limited[- ]time(?: offer)?|pre[- ]selected (?:loan |credit )?offer|top suggestions? for you|recommended for you|fundrais(?:er|ing)|donate|oral history project|anniversary history project|shop now|buy now|save\s+\d{1,2}%|customer survey|feedback survey|rate your (?:transaction|order|purchase|experience)|tell us how we did)\b/iu;
const marketingCtaPattern = /\b(?:check out|browse|shop now|order by|buy now|save\s+\d{1,2}%|claim (?:your|the)|redeem|learn more|member offer|limited[- ]time offer|take (?:our|the|a) survey|leave (?:us )?a review|rate your (?:transaction|order|purchase|experience)|tell us how we did)\b/iu;
const marketingAskPattern = /\b(?:can|could|would|will)\s+you\s+(?:check out|browse|shop|buy|order|claim|redeem)\b|^\s*(?:check out|browse|shop|buy|order|claim|redeem)\b/iu;
const feedbackCampaignPattern = /\b(?:customer survey|feedback survey|rate your (?:transaction|order|purchase|experience)|tell us how we did|take (?:our|the|a) survey)\b/iu;
const optionalEngagementPattern = /\b(?:share your thoughts|how was your (?:visit|stay|experience)|recent visit|costume contest|enter (?:our|the) contest|see what(?:'s| is) (?:hot|new)|stream(?:ing)? now|watch now|explore and book)\b/iu;
const automatedCalendarPattern = /\b(?:updated invitation|canceled event|cancelled event|this event has been (?:updated|canceled|cancelled)|removed from your calendar)\b/iu;
const month = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const deadlinePattern = new RegExp(
  `\\b(?:due|deadline(?:\\s+is)?|by|before|no later than)\\s+(?:on\\s+)?((?:mon|tues?|wednes?|thurs?|fri|satur?|sun)(?:day)?(?:\\s+at\\s+[^,.!?\\n]{1,24})?|tomorrow(?:\\s+at\\s+[^,.!?\\n]{1,24})?|${month}\\s+\\d{1,2}(?:,\\s+\\d{4})?(?:\\s+at\\s+[^,.!?\\n]{1,24})?|\\d{4}-\\d{2}-\\d{2}(?:\\s+at\\s+[^,.!?\\n]{1,24})?)`,
  "giu",
);
function sourceText(message) { return `${message.subject}\n${message.body}`; }
function negatedBefore(text, index) { return /\b(?:no longer|never|cannot|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|wouldn't|can't|couldn't|shouldn't|not(?!\s+only\b))(?:\s+[\p{L}'’-]+){0,3}\s+$/iu.test(text.slice(Math.max(0, index - 96), index)); }
function boundedSpan(text, index, length) {
  const lineStart = Math.max(0, text.lastIndexOf("\n", index) + 1);
  const boundary = text.indexOf("\n", index + length);
  const lineEnd = boundary < 0 ? text.length : boundary;
  const max = LIMITS.maxEvidenceChars;
  let start = Math.max(lineStart, index - Math.floor((max - length) / 2));
  let end = Math.min(lineEnd, start + max);
  if (end < index + length) { end = Math.min(lineEnd, index + length); start = Math.max(lineStart, end - max); }
  const raw = text.slice(start, end); const leading = raw.length - raw.trimStart().length;
  const quote = raw.trim();
  if (quote) {
    const adjustedStart = start + leading;
    return { start: adjustedStart, end: adjustedStart + quote.length, quote };
  }
  return { start: index, end: index + length, quote: text.slice(index, index + length) };
}
function matchEvidence(message, pattern, kind) {
  for (const field of ["subject", "body"]) {
    pattern.lastIndex = 0;
    const match = pattern.exec(message[field]);
    if (!match) continue;
    return Object.freeze({ kind, messageId: message.id, field, ...boundedSpan(
      message[field],
      match.index,
      match[0].length,
    ) });
  }
  return null;
}
function requestEvidence(message, pattern = askPattern) {
  for (const field of ["subject", "body"]) {
    const text = message[field];
    for (const segment of text.matchAll(/[^.!?;,—–\n]+[.!?;,—–]?/gu)) {
      if (noReplyPattern.test(segment[0])) continue;
      pattern.lastIndex = 0;
      const match = pattern.exec(segment[0]);
      if (!match) continue;
      if (negatedBefore(segment[0], match.index)) continue;
      return Object.freeze({
        kind: "request",
        messageId: message.id,
        field,
        ...boundedSpan(text, segment.index + match.index, match[0].length),
      });
    }
  }
  return null;
}
function decodedInjectionEvidence(message) {
  for (const field of ["subject", "body"]) {
    for (const match of message[field].matchAll(/\b[A-Za-z0-9+/_-]{20,512}={0,2}\b/gu)) {
      try {
        const encoded = match[0].replace(/-/gu, "+").replace(/_/gu, "/");
        const decoded = atob(encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), "="));
        if (injectionPattern.test(decoded)) {
          const end = Math.min(match.index + match[0].length, match.index + LIMITS.maxEvidenceChars);
          return Object.freeze({
            kind: "encoded-injection",
            messageId: message.id,
            field,
            start: match.index,
            end,
            quote: message[field].slice(match.index, end),
          });
        }
      } catch {
        // Non-base64 text is ordinary untrusted content.
      }
    }
  }
  return null;
}
function deadlineCandidates(message) {
  const candidates = [];
  for (const field of ["subject", "body"]) {
    deadlinePattern.lastIndex = 0;
    for (const match of message[field].matchAll(deadlinePattern)) {
      if (negatedBefore(message[field], match.index)) continue;
      candidates.push(Object.freeze({
        messageId: message.id,
        field,
        ...boundedSpan(message[field], match.index, match[0].length),
        text: match[1].trim(),
      }));
    }
  }
  return candidates;
}
function safeSummary(message, incomplete) {
  if (incomplete) return "Inbox Island could not read enough of this message to classify it reliably.";
  const bodyLead = message.body.split(/(?<=[.!?])\s+|\n/u).find(Boolean) || "No readable body text.";
  const combined = `${message.subject}: ${bodyLead}`
    .replace(/\b(?:https?|wss?):\/\/\S+/giu, "[link]")
    .replace(/\s+/gu, " ")
    .trim();
  return combined.slice(0, LIMITS.maxSummaryChars);
}
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
  if (feedbackCampaignPattern.test(text) || optionalEngagementPattern.test(text)) return { bucket: "noise", confidence: 0.94, reason: "Optional engagement campaign detected" };
  if (promotionPattern.test(text)) return ask || attention || deadlines.length ? { bucket: "uncertain", confidence: 0.35, reason: "Promotional context conflicts with a work-like cue" } : { bucket: "noise", confidence: 0.9, reason: "Strong promotional or bulk context detected" };
  if (automatedCalendarPattern.test(text)) return { bucket: "attention", confidence: 0.88, reason: "Calendar event changed" };
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
  if (recordPattern.test(text)) return { bucket: "record", confidence: 0.88, reason: "Transactional record detected" };
  if (noisePattern.test(text)) return { bucket: "noise", confidence: 0.9, reason: "Bulk or promotional message detected" };
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
  const credential = matchEvidence(latest, credentialPattern, "credential-risk");
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
