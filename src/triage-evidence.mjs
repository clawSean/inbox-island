import { LIMITS } from "./contracts.mjs";
const injectionPattern = /\b(?:ignore|disregard|override)\b[\s\S]{0,48}\b(?:instructions?|prompt|policy|rules?)\b|\b(?:system|developer|assistant)\s+(?:message|prompt)\b|\btool\s*call\b|\breveal\b[\s\S]{0,32}\b(?:token|prompt|secret)\b/iu;
const credentialPattern = /\b(?:(?:send|share|provide|enter|submit|upload|confirm|verify|reply with)\b[^.!?;\n]{0,64}\b(?:password|passcode|verification code|one[- ]time code|2fa|seed phrase|private key|login credentials?|social security(?: number)?|bank account(?: number| details| information)?)|(?:password|passcode|verification code|one[- ]time code|seed phrase|private key|login credentials?|social security(?: number)?|bank account(?: number| details| information)?)\b[^.!?;\n]{0,48}\b(?:is|are)?\s*(?:required|needed|requested|send|share|provide|enter|submit|upload|confirm|verify))\b/iu;
const attentionPattern = /\b(?:urgent|action required|past due|overdue|security alert|immediately|time[- ]sensitive|final notice)\b/iu;
const askPattern = /\bplease\s+(?:reply|respond|confirm|approve|review|send|share|sign|choose|select|provide)\b|^\s*(?:(?:reply|respond)\s+(?:to|with|by)\b|(?:confirm|approve|review|send|share|sign|choose|select|provide)\s+(?:the|this|that|your|a|an|whether|which|by)\b)|\b(?:can|could|would|will)\s+you\s+(?:reply|respond|confirm|approve|review|send|share|sign|choose|select|provide|check|take|complete|update|verify|forward|return|upload|submit|call|schedule|tell|answer)\b|\bneed\s+you\s+to\b|\blet me know\b|\b(?:do|does|would|will|can|could)\b[^?;\n]{0,120}\b(?:work|fit|suit)\s+for\s+you\b[^?;\n]{0,40}\?|\b(?:are|will|would)\s+you\s+(?:available|able)\b[^?;\n]{0,80}\?|\b(?:do|would)\s+you\s+(?:approve|confirm|prefer|choose|want|need|agree)\b[^?;\n]{0,80}\?/iu;
const noReplyPattern = /\b(?:(?:do not|don't)\s+(?:reply|respond)|no\s+(?:reply|response)\s+(?:is\s+)?(?:needed|required|requested)|(?:reply|response)\s+(?:is\s+)?not\s+(?:needed|required|requested)|(?:no longer|do not|don't|does not|doesn't|did not|didn't|never)\s+(?:need|needs|require|requires|await|awaits)\s+(?:your\s+)?(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?)|(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?)\s+(?:is|are|was|were)\s+(?:not|no longer)\s+(?:needed|required|requested|outstanding)|no (?:need|action) to (?:reply|respond)|no response (?:is )?requested)\b/iu;
const implicitReplyPattern = /\b(?:(?:need|needs|require|requires|await|awaits)\s+your\s+(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)|(?:waiting|holding|blocked|paused|pending)\b[^.!?;\n]{0,80}\b(?:until|for)\s+your\s+(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)|(?:a|your)\s+(?:(?:brief|quick|short|final|written)\s+)?(?:response|reply|answer|confirmation|approval|decision|choice|selection|feedback|reaction|signature|initials?|green light|yes or no)\b[^.!?;\n]{0,96}\b(?:would\s+(?:help|allow|enable|unblock)|(?:is|are)\s+(?:the\s+)?(?:last|remaining|outstanding)\s+(?:item|step|requirement|condition|blocker|piece|input|document|signature)|remains?\s+outstanding|determines?|controls?|sets?|will\s+(?:determine|allow|enable|unblock)))\b/iu;
const stateChangeAttentionPattern = /\b(?:(?:signing\s+)?certificate|authorization|coverage|enrollment(?:\s+(?:period|window))?|(?:appeal|response|filing|renewal|application|submission|claim|payment|maintenance|service)\s+(?:window|period|deadline)?|(?:company\s+)?domain|account|license|permit|policy|warranty|subscription|registration|reservation|access|session)\b\s+(?:will\s+)?(?:expires?|closes?|ends?|enters?\s+(?:[\p{L}\d-]+\s+){1,3}(?:status|state|phase))\b[^.!?;\n]{0,96}\b(?:in\s+(?:\d{1,2}|[\p{L}]+(?:-[\p{L}]+)?)\s+(?:minutes?|hours?|days?)|this\s+(?:morning|afternoon|evening|week|weekend)|at\s+(?:midnight|noon)|next\s+(?:business\s+)?day|tomorrow(?:\s+(?:morning|afternoon|evening))?)\b/iu;
const recordPattern = /\b(?:receipt|payment received|payment\b[^.!?;\n]{0,48}\bfrom|paid invoice|order (?:confirmation|confirmed|approved)|reservation (?:confirmed|confirmation)|statement (?:is |has been )?(?:available|posted)|tax document|shipping confirmation|(?:has )?shipped|delivered|(?:membership|subscription|license|warranty|coverage) (?:renewed|registered|activated|active)|(?:service|technician visit) (?:completed|closed successfully)|(?:digital )?(?:tickets?|passes?)\b[^.!?;\n]{0,80}\b(?:issued|available|in your account)|(?:acknowledg(?:es|ed|ment)|receipt)\b[^.!?;\n]{0,80}\b(?:donation|contribution))\b/iu;
const noisePattern = /\b(?:unsubscribe|newsletter|weekly digest|daily digest|job alert(?: digest)?|career trends|network updates|roundup|lookbook|editor picks|tips series|productivity tips|people you may know|profiles? (?:you may know|appeared)|creator highlights|watch ideas|trending with similar (?:members|viewers)|sale ends|limited[- ]time offer|promotion|sponsored)\b/iu;
const promotionPattern = /\b(?:newsletter|weekly digest|daily digest|sale|discount|coupon|promotion|sponsored(?:\s+promotion)?|member offer|limited[- ]time(?: offer)?|pre[- ]selected (?:loan |credit )?offer|top suggestions? for you|recommended for you|fundrais(?:er|ing)|donate|oral history project|anniversary history project|shop now|buy now|save\s+\d{1,2}%|customer survey|feedback survey|rate your (?:transaction|order|purchase|experience)|tell us how we did)\b/iu;
const marketingCtaPattern = /\b(?:check out|browse|shop now|order by|buy now|save\s+\d{1,2}%|claim (?:your|the)|redeem|learn more|member offer|limited[- ]time offer|take (?:our|the|a) survey|leave (?:us )?a review|rate your (?:transaction|order|purchase|experience)|tell us how we did)\b/iu;
const marketingAskPattern = /\b(?:can|could|would|will)\s+you\s+(?:check out|browse|shop|buy|order|claim|redeem)\b|^\s*(?:check out|browse|shop|buy|order|claim|redeem)\b/iu;
const feedbackCampaignPattern = /\b(?:customer survey|feedback survey|satisfaction survey|rate your (?:transaction|order|purchase|experience)|tell us how we did|take (?:our|the|a) survey)\b/iu;
const optionalEngagementPattern = /\b(?:share your thoughts|how was your (?:visit|stay|experience)|recent visit|costume contest|enter (?:our|the) contest|see what(?:'s| is) (?:hot|new)|stream(?:ing)? now|watch now|explore and book)\b/iu;
const automatedCalendarPattern = /\b(?:updated invitation|canceled event|cancelled event|this event has been (?:updated|canceled|cancelled)|removed from your calendar)\b/iu;
const liveAttentionPattern = /\b(?:order\b[^.!?;\n]{0,48}\bready for (?:pickup|collection)|ready for (?:pickup|collection)|(?:winning |current )?bid(?: status)?|outbid|calendar event|calendar invitation)\b/iu;
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
function matchUnnegatedEvidence(message, pattern, kind) {
  const all = new RegExp(pattern.source, `${pattern.flags}g`);
  for (const field of ["subject", "body"]) {
    for (const match of message[field].matchAll(all)) {
      if (negatedBefore(message[field], match.index)) continue;
      return Object.freeze({ kind, messageId: message.id, field,
        ...boundedSpan(message[field], match.index, match[0].length) });
    }
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

export { injectionPattern, credentialPattern, attentionPattern, implicitReplyPattern,
  stateChangeAttentionPattern, recordPattern, noisePattern, promotionPattern,
  marketingCtaPattern, marketingAskPattern, feedbackCampaignPattern,
  optionalEngagementPattern, automatedCalendarPattern, liveAttentionPattern,
  sourceText, matchEvidence, matchUnnegatedEvidence, requestEvidence,
  decodedInjectionEvidence, deadlineCandidates, safeSummary };
