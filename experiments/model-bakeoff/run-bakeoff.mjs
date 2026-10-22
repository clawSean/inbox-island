import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { syntheticMailbox } from "../../fixtures/synthetic-mailbox.mjs";
import { normalizeMailbox } from "../../src/gmail-normalize.mjs";
import { runSyntheticTriage } from "../../src/pipeline.mjs";
import { runBrowserEmbedding } from "./browser-runtime.mjs";
import {
  HOLDOUT_CASES,
  HOLDOUT_MAILBOX,
  LABELS,
  PROTOTYPES,
} from "./holdout.mjs";
import { buildReceipt } from "./receipt-builder.mjs";
import {
  calculateMetrics,
  countLabels,
  FIXED_NOW,
  messageText,
  scoreEmbeddings,
  stableJson,
  threadTexts,
} from "./support.mjs";

const expectedCounts = countLabels(HOLDOUT_CASES.map(({ expected }) => expected));
assert.equal(HOLDOUT_CASES.length, 42);
assert.deepEqual(expectedCounts, Object.fromEntries(LABELS.map((label) => [label, 7])));
assert.equal(new Set(HOLDOUT_CASES.map(({ id }) => id)).size, HOLDOUT_CASES.length);

const productFixtureRaw = new Set(syntheticMailbox.messages.map((message) => stableJson(message)));
assert.equal(
  HOLDOUT_MAILBOX.messages.some((message) => productFixtureRaw.has(stableJson(message))),
  false,
  "holdout reused an exact raw product-fixture message",
);
const productFixtureTexts = new Set(normalizeMailbox(syntheticMailbox.messages)
  .filter(({ normalizationError }) => !normalizationError)
  .map(messageText));
const holdoutNormalized = normalizeMailbox(HOLDOUT_MAILBOX.messages);
assert.equal(
  holdoutNormalized.filter(({ normalizationError }) => !normalizationError)
    .some((message) => productFixtureTexts.has(messageText(message))),
  false,
  "holdout reused exact normalized content from a valid product-fixture message",
);

const baselineOutput = await runSyntheticTriage(HOLDOUT_MAILBOX, { now: FIXED_NOW });
assert.equal(baselineOutput.threadCount, HOLDOUT_CASES.length);
const baselineById = new Map(baselineOutput.results.map((result) => [result.threadId, result]));
const expectedById = new Map(HOLDOUT_CASES.map((fixture) => [fixture.id, fixture.expected]));
assert.deepEqual([...baselineById.keys()].sort(), [...expectedById.keys()].sort());
const riskById = new Map([...baselineById].map(([id, result]) => [id, result.riskFlags]));
assert.equal([...riskById.values()].filter((flags) => flags.length > 0).length >= 6, true);

const baselinePredictions = new Map([...baselineById].map(([id, result]) => [id, result.bucket]));
const allThreadTexts = threadTexts(HOLDOUT_MAILBOX.messages);
const eligibleIds = HOLDOUT_CASES.filter(({ id }) => (
  baselineById.get(id).bucket === "uncertain" && baselineById.get(id).riskFlags.length === 0
)).map(({ id }) => id);
const embeddingInputs = [
  ...LABELS.map((label) => PROTOTYPES[label]),
  ...eligibleIds.map((id) => allThreadTexts.get(id)),
];
const browserRun = await runBrowserEmbedding(embeddingInputs);
assert.equal(browserRun.proof.embeddings.length, embeddingInputs.length);
const { modelPredictions, prototypeVectors } = scoreEmbeddings(
  browserRun.proof.embeddings,
  eligibleIds,
);

const hybridPredictions = new Map(HOLDOUT_CASES.map(({ id }) => [
  id,
  modelPredictions.get(id)?.bucket || baselinePredictions.get(id),
]));
const fallbackPredictions = new Map(baselinePredictions);
assert.deepEqual([...fallbackPredictions], [...baselinePredictions]);
const baselineMetrics = calculateMetrics(HOLDOUT_CASES, baselinePredictions, riskById);
const hybridMetrics = calculateMetrics(HOLDOUT_CASES, hybridPredictions, riskById);
assert.equal(baselineMetrics.unsafeToNoiseCount, 0);
assert.equal(hybridMetrics.unsafeToNoiseCount, 0);

const receipt = await buildReceipt({
  baselineMetrics,
  baselinePredictions,
  browserRun,
  eligibleIds,
  embeddingInputs,
  expectedById,
  expectedCounts,
  fallbackPredictions,
  hybridMetrics,
  hybridPredictions,
  modelPredictions,
  prototypeVectors,
  riskById,
});
const serializedReceipt = `${JSON.stringify(receipt, null, 2)}\n`;
await writeFile(new URL("./receipt.json", import.meta.url), serializedReceipt, "utf8");
process.stdout.write(serializedReceipt);
