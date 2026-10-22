#!/usr/bin/env node

import { expectedByThread, syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { runSyntheticTriage } from "../src/pipeline.mjs";

const output = await runSyntheticTriage(syntheticMailbox, {
  now: () => new Date("2026-10-08T00:00:00.000Z"),
});
const failures = [];
let riskExpectations = 0;
let riskMatches = 0;
let bucketMatches = 0;
const seenThreads = new Set();

for (const result of output.results) {
  seenThreads.add(result.threadId);
  const expected = expectedByThread[result.threadId];
  if (!expected) {
    failures.push(`${result.threadId}: no expected result`);
    continue;
  }
  if (result.bucket !== expected.bucket) {
    failures.push(`${result.threadId}: expected ${expected.bucket}, got ${result.bucket}`);
  } else bucketMatches += 1;
  riskExpectations += expected.risks.length;
  riskMatches += expected.risks.filter((risk) => result.riskFlags.includes(risk)).length;
  if (JSON.stringify(result.riskFlags) !== JSON.stringify(expected.risks)) {
    failures.push(`${result.threadId}: risk flags mismatch`);
  }
  if (Boolean(result.deadline) !== Boolean(expected.deadline)) {
    failures.push(`${result.threadId}: deadline expectation mismatch`);
  }
}
for (const threadId of Object.keys(expectedByThread)) {
  if (!seenThreads.has(threadId)) failures.push(`${threadId}: expected thread missing`);
}

const report = {
  fixture: "synthetic-mailbox-v1",
  messages: output.messageCount,
  threads: output.threadCount,
  exactBucketMatches: bucketMatches,
  expectedThreads: Object.keys(expectedByThread).length,
  expectedRiskFlagsFound: riskMatches,
  expectedRiskFlags: riskExpectations,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
