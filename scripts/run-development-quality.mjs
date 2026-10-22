#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  HOLDOUT_CASES,
  HOLDOUT_MAILBOX,
  HOLDOUT_VERSION,
} from "../experiments/model-bakeoff/holdout.mjs";
import { calculateMetrics, sha256Text, stableJson } from "../experiments/model-bakeoff/support.mjs";
import { normalizeMailbox } from "../src/gmail-normalize.mjs";
import { runSyntheticTriage } from "../src/pipeline.mjs";

export const CORPUS_ROLE = "INSPECTED DEVELOPMENT CORPUS";
export const DEVELOPMENT_CAVEAT =
  "Metrics are in-sample fit on labels inspected during deterministic-rule calibration, not proof of generalization.";
export const DEVELOPMENT_FIXED_TIME = "2026-11-04T00:00:00.000Z";
export const EXPECTED_CURRENT_HEADLINE = Object.freeze({
  exactCorrect: 26,
  replyAttentionCaught: 12,
  replyAttentionSupport: 14,
  falseImportantCount: 0,
  uncertainCount: 23,
  unsafeToNoiseCount: 0,
});

const receipt = JSON.parse(readFileSync(
  new URL("../experiments/model-bakeoff/receipt.json", import.meta.url),
  "utf8",
));
const importantBuckets = new Set(["reply", "attention"]);
const hardDemotionBuckets = new Set(["waiting", "record", "noise"]);
const supportingEvidenceKinds = Object.freeze({
  attention: new Set(["attention", "classification", "credential-risk", "deadline", "suspicious-link"]),
  noise: new Set(["classification"]),
  record: new Set(["classification"]),
  reply: new Set(["classification", "request"]),
  waiting: new Set(["classification"]),
});

function invariant(ids, extra = {}) {
  return { passed: ids.length === 0, count: ids.length, ids, ...extra };
}

function exactEvidence(item, sourceById) {
  const source = sourceById.get(item.messageId);
  return Boolean(
    source
    && ["subject", "body"].includes(item.field)
    && Number.isSafeInteger(item.start)
    && Number.isSafeInteger(item.end)
    && item.start >= 0
    && item.end > item.start
    && source[item.field].slice(item.start, item.end) === item.quote,
  );
}

function latestMessages(messages) {
  const latestByThread = new Map();
  for (const message of messages) {
    const latest = latestByThread.get(message.threadId);
    if (!latest || latest.timestamp < message.timestamp) latestByThread.set(message.threadId, message);
  }
  return latestByThread;
}

export async function buildDevelopmentQualityReport() {
  if (receipt.holdout?.version !== HOLDOUT_VERSION || !receipt.comparison?.baseline) {
    throw new Error("HISTORICAL_RECEIPT_MISMATCH");
  }
  const corpusSha256 = sha256Text(stableJson(HOLDOUT_CASES));
  if (corpusSha256 !== receipt.holdout.fixtureSha256
    || receipt.predictions.length !== HOLDOUT_CASES.length
    || HOLDOUT_CASES.some(({ id, expected }) => {
      const matches = receipt.predictions.filter((item) => item.id === id);
      return matches.length !== 1 || matches[0].expected !== expected;
    })) throw new Error("DEVELOPMENT_CORPUS_MISMATCH");
  const historicalById = new Map(receipt.predictions.map((item) => [item.id, item.baseline]));
  const normalized = normalizeMailbox(HOLDOUT_MAILBOX.messages);
  const sourceById = new Map(normalized.map((message) => [message.id, message]));
  const latestByThread = latestMessages(normalized);
  const current = await runSyntheticTriage(HOLDOUT_MAILBOX, {
    now: () => new Date(DEVELOPMENT_FIXED_TIME),
  });
  const currentById = new Map(current.results.map((result) => [result.threadId, result]));

  const cases = HOLDOUT_CASES.map(({ id, expected }) => {
    const result = currentById.get(id);
    const historicalPredicted = historicalById.get(id);
    if (!result || !historicalPredicted) throw new Error(`MISSING_CASE:${id}`);
    return {
      id,
      expected,
      historicalPredicted,
      predicted: result.bucket,
      reason: result.reasons[0],
      evidenceKinds: [...new Set(result.evidence.map(({ kind }) => kind))].sort(),
      riskFlags: [...result.riskFlags],
    };
  });
  if (currentById.size !== HOLDOUT_CASES.length) throw new Error("UNEXPECTED_CURRENT_CASES");

  const predictions = new Map(cases.map(({ id, predicted }) => [id, predicted]));
  const historicalRiskIds = new Set(receipt.holdout.riskBearingIds);
  const riskBearingIds = new Set([
    ...historicalRiskIds,
    ...cases.filter(({ riskFlags }) => riskFlags.length > 0).map(({ id }) => id),
  ]);
  const riskById = new Map(cases.map(({ id }) => [
    id,
    riskBearingIds.has(id) ? ["risk-bearing"] : [],
  ]));
  const importantDemotions = cases.filter(({ expected, predicted }) => (
    importantBuckets.has(expected) && hardDemotionBuckets.has(predicted)
  )).map(({ id }) => id);
  const riskToNoise = cases.filter(({ id, predicted, riskFlags }) => (
    predicted === "noise" && (riskFlags.length > 0 || historicalRiskIds.has(id))
  )).map(({ id }) => id);
  const historicalCorrectRegressions = cases.filter(({ expected, historicalPredicted, predicted }) => (
    historicalPredicted === expected && predicted !== expected
  )).map(({ id }) => id);

  const newNonUncertain = cases.filter(({ historicalPredicted, predicted }) => (
    historicalPredicted === "uncertain" && predicted !== "uncertain"
  ));
  const waitingDirectionExceptionIds = [];
  const evidenceFailureIds = [];
  for (const { id, predicted } of newNonUncertain) {
    const result = currentById.get(id);
    const latest = latestByThread.get(id);
    if (predicted === "waiting" && latest?.direction === "outbound") {
      waitingDirectionExceptionIds.push(id);
      continue;
    }
    const allowed = supportingEvidenceKinds[predicted] || new Set();
    const hasExactSupport = result.evidence.some((item) => (
      allowed.has(item.kind) && exactEvidence(item, sourceById)
    ));
    if (!hasExactSupport || result.evidence.some((item) => !exactEvidence(item, sourceById))) {
      evidenceFailureIds.push(id);
    }
  }

  const currentAggregate = calculateMetrics(HOLDOUT_CASES, predictions, riskById);
  const headlineMismatches = Object.entries(EXPECTED_CURRENT_HEADLINE)
    .filter(([key, expected]) => currentAggregate[key] !== expected)
    .map(([key]) => key);
  return {
    schemaVersion: "inbox-island-development-quality-v1",
    corpusRole: CORPUS_ROLE,
    caveat: DEVELOPMENT_CAVEAT,
    corpusVersion: HOLDOUT_VERSION,
    corpusSha256,
    fixedTime: DEVELOPMENT_FIXED_TIME,
    caseCount: HOLDOUT_CASES.length,
    historicalAggregate: structuredClone(receipt.comparison.baseline),
    currentAggregate,
    invariants: {
      currentHeadlineMatchesExpected: invariant(headlineMismatches, {
        expected: EXPECTED_CURRENT_HEADLINE,
      }),
      historicallyCorrectCasesRemainCorrect: invariant(historicalCorrectRegressions),
      importantDemotedToWaitingRecordNoise: invariant(importantDemotions),
      noFalseImportant: invariant(currentAggregate.falseImportantIds),
      riskBearingToNoise: invariant(riskToNoise),
      everyNewNonUncertainResultHasExactEvidence: invariant(evidenceFailureIds, {
        checkedIds: newNonUncertain.map(({ id }) => id),
        waitingDirectionExceptionIds,
      }),
    },
    cases,
  };
}

export function assertDevelopmentQualityReport(report) {
  for (const [name, result] of Object.entries(report.invariants)) {
    if (!result.passed) throw new Error(`DEVELOPMENT_QUALITY_GATE_FAILED:${name}:${result.ids.join(",")}`);
  }
  return report;
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (import.meta.url === invokedUrl) {
  process.stdout.write(`${stableJson(assertDevelopmentQualityReport(
    await buildDevelopmentQualityReport(),
  ))}\n`);
}
