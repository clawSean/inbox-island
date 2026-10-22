const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze(value)));

export const BUCKET_META = freezeList([
  { id: "reply", label: "Reply", description: "A response is requested.", priority: 0 },
  { id: "attention", label: "Attention", description: "A real deadline or material change needs review.", priority: 1 },
  { id: "uncertain", label: "Review", description: "The category is genuinely unclear.", priority: 2 },
  { id: "waiting", label: "Waiting", description: "The latest message was sent by you.", priority: 3 },
  { id: "record", label: "Record", description: "A receipt or confirmation to keep.", priority: 4 },
  { id: "noise", label: "Noise", description: "Bulk or promotional mail.", priority: 5 },
]);

export const VIEW_META = freezeList([
  { id: "all", label: "All", heading: "Every sorted thread", description: "Every triaged thread." },
  { id: "needs-me", label: "Needs me", heading: "What likely needs your attention", description: "Likely replies, real deadlines, and material changes." },
  { id: "review", label: "Review", heading: "What needs a human look", description: "Only threads Inbox Island could not classify confidently." },
  { id: "waiting", label: "Waiting", heading: "Waiting on someone else", description: "Threads awaiting a response." },
  { id: "record", label: "Records", heading: "Records worth keeping", description: "Receipts and confirmations." },
  { id: "noise", label: "Low signal", heading: "Low-signal mail", description: "Bulk and promotional mail." },
]);

export const BUCKET_PRIORITY = Object.freeze(BUCKET_META.map(({ id }) => id));

const priorityByBucket = new Map(BUCKET_META.map(({ id, priority }) => [id, priority]));
const views = new Set(VIEW_META.map(({ id }) => id));

function text(value, label) {
  if (typeof value !== "string") throw new TypeError(`INVALID_${label.toUpperCase()}`);
  return value;
}

function latestMessage(messages) {
  return [...messages].sort((left, right) => (
    right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id)
  ))[0];
}

function copyEvidence(items) {
  if (!Array.isArray(items)) throw new TypeError("INVALID_EVIDENCE");
  return freezeList(items.map((item) => ({
    kind: text(item.kind, "evidence_kind"),
    messageId: text(item.messageId, "evidence_message_id"),
    field: text(item.field, "evidence_field"),
    quote: text(item.quote, "evidence_quote"),
  })));
}

function copyDeadline(deadline) {
  if (deadline === null) return null;
  return Object.freeze({
    text: text(deadline.text, "deadline_text"),
    messageId: text(deadline.messageId, "deadline_message_id"),
    field: text(deadline.field, "deadline_field"),
    quote: text(deadline.quote, "deadline_quote"),
  });
}

function createRow(result, messages) {
  const latest = latestMessage(messages);
  if (!latest) throw new Error(`MISSING_THREAD_MESSAGES:${result.threadId}`);
  if (!priorityByBucket.has(result.bucket)) throw new Error(`UNKNOWN_BUCKET:${result.bucket}`);
  return Object.freeze({
    accountId: text(result.accountId, "account_id"),
    threadId: text(result.threadId, "thread_id"),
    subject: text(latest.subject, "subject"),
    from: text(latest.from, "from"),
    latestTimestamp: text(latest.timestamp, "latest_timestamp"),
    bucket: text(result.bucket, "bucket"),
    confidence: result.confidence,
    summary: text(result.summary, "summary"),
    requestedAction: result.requestedAction === null
      ? null : text(result.requestedAction, "requested_action"),
    deadline: copyDeadline(result.deadline),
    riskFlags: Object.freeze(result.riskFlags.map((flag) => text(flag, "risk_flag"))),
    evidence: copyEvidence(result.evidence),
  });
}

export function buildUiRows(triageOutput, normalizedMessages) {
  if (!Array.isArray(triageOutput?.results) || !Array.isArray(normalizedMessages)) {
    throw new TypeError("INVALID_VIEW_MODEL_INPUT");
  }
  const byThread = new Map();
  for (const message of normalizedMessages) {
    const current = byThread.get(message.threadId) || [];
    current.push(message);
    byThread.set(message.threadId, current);
  }
  const rows = triageOutput.results.map((result) => (
    createRow(result, byThread.get(result.threadId) || [])
  ));
  rows.sort((left, right) => (
    priorityByBucket.get(left.bucket) - priorityByBucket.get(right.bucket)
      || right.latestTimestamp.localeCompare(left.latestTimestamp)
      || left.threadId.localeCompare(right.threadId)
  ));
  return Object.freeze(rows);
}

function inView(row, view) {
  if (view === "all") return true;
  if (view === "needs-me") return row.bucket === "reply" || row.bucket === "attention";
  if (view === "review") return row.bucket === "uncertain";
  return row.bucket === view;
}

function searchableText(row) {
  return [
    row.subject,
    row.from,
    row.bucket,
    row.summary,
    row.requestedAction,
    row.deadline?.text,
    row.deadline?.quote,
    ...row.riskFlags,
    ...row.evidence.flatMap(({ kind, quote }) => [kind, quote]),
  ].filter(Boolean).join("\n").toLowerCase();
}

export function filterUiRows(rows, { view = "all", search = "" } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("INVALID_ROWS");
  if (!views.has(view)) throw new Error(`UNKNOWN_VIEW:${view}`);
  if (typeof search !== "string") throw new TypeError("INVALID_SEARCH");
  const query = search.trim().toLowerCase();
  return Object.freeze(rows.filter((row) => (
    inView(row, view) && (!query || searchableText(row).includes(query))
  )));
}

export function deriveViewCounts(rows) {
  if (!Array.isArray(rows)) throw new TypeError("INVALID_ROWS");
  return Object.freeze(Object.fromEntries(VIEW_META.map(({ id }) => [
    id,
    rows.reduce((total, row) => total + Number(inView(row, id)), 0),
  ])));
}
