import { normalizeMailbox } from "./gmail-normalize.mjs";
import { triageThread } from "./deterministic-triage.mjs";
import { assertIdentifier } from "./contracts.mjs";
import { refineWithInference } from "./inference.mjs";

function groupByThread(messages) {
  const threads = new Map();
  for (const message of messages) {
    const current = threads.get(message.threadId) || [];
    current.push(message);
    threads.set(message.threadId, current);
  }
  return threads;
}

export async function runSyntheticTriage({ accountId, messages }, options = {}) {
  assertIdentifier(accountId, "account_id");
  const normalized = normalizeMailbox(messages);
  const results = [];
  for (const threadMessages of groupByThread(normalized).values()) {
    const ordered = [...threadMessages].sort((left, right) => (
      left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
    ));
    const baseline = triageThread(accountId, ordered, options);
    results.push(await refineWithInference(baseline, ordered, options.infer, options));
  }
  return Object.freeze({
    accountId,
    messageCount: normalized.length,
    threadCount: results.length,
    results: Object.freeze(results.sort((left, right) => left.threadId.localeCompare(right.threadId))),
  });
}
