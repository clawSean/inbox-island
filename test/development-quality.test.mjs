import assert from "node:assert/strict";
import test from "node:test";
import { HOLDOUT_CASES } from "../experiments/model-bakeoff/holdout.mjs";
import {
  CORPUS_ROLE,
  DEVELOPMENT_CAVEAT,
  EXPECTED_CURRENT_HEADLINE,
  assertDevelopmentQualityReport,
  buildDevelopmentQualityReport,
} from "../scripts/run-development-quality.mjs";

test("development evaluator labels the inspected corpus and reports every case", async () => {
  const report = await buildDevelopmentQualityReport();
  assert.equal(report.corpusRole, CORPUS_ROLE);
  assert.equal(report.corpusRole, "INSPECTED DEVELOPMENT CORPUS");
  assert.equal(report.caveat, DEVELOPMENT_CAVEAT);
  assert.match(report.caveat, /in-sample fit/iu);
  assert.match(report.caveat, /not proof of generalization/iu);
  assert.equal(report.caseCount, HOLDOUT_CASES.length);
  assert.equal(report.corpusSha256, "e24be646ed5da768aa272187665de55697a4f5202a44a92bb400e4bbb4417d4f");
  assert.deepEqual(
    report.cases.map(({ id }) => id),
    HOLDOUT_CASES.map(({ id }) => id),
  );
  for (const result of report.cases) {
    assert.equal(typeof result.expected, "string", result.id);
    assert.equal(typeof result.predicted, "string", result.id);
    assert.equal(typeof result.reason, "string", result.id);
    assert.ok(Array.isArray(result.evidenceKinds), result.id);
  }
});

test("current fit does not regress the historical deterministic aggregate", async () => {
  const report = await buildDevelopmentQualityReport();
  const { currentAggregate: current, historicalAggregate: historical } = report;
  assert.equal(assertDevelopmentQualityReport(report), report);
  assert.ok(current.exactAccuracy >= historical.exactAccuracy);
  assert.ok(current.replyAttentionRecall >= historical.replyAttentionRecall);
  assert.ok(current.uncertainRate <= historical.uncertainRate);
  for (const [key, expected] of Object.entries(EXPECTED_CURRENT_HEADLINE)) {
    assert.equal(current[key], expected, key);
  }
});

test("development quality preserves hard safety and evidence invariants", async () => {
  const { invariants } = await buildDevelopmentQualityReport();
  const hardDemotions = invariants.importantDemotedToWaitingRecordNoise;
  const riskToNoise = invariants.riskBearingToNoise;
  const evidence = invariants.everyNewNonUncertainResultHasExactEvidence;
  assert.equal(invariants.currentHeadlineMatchesExpected.passed, true);
  assert.equal(invariants.historicallyCorrectCasesRemainCorrect.passed, true);
  assert.deepEqual(invariants.historicallyCorrectCasesRemainCorrect.ids, []);
  assert.equal(invariants.noFalseImportant.passed, true);
  assert.deepEqual(invariants.noFalseImportant.ids, []);
  assert.equal(hardDemotions.passed, true, hardDemotions.ids.join(","));
  assert.deepEqual(hardDemotions.ids, []);
  assert.equal(riskToNoise.passed, true, riskToNoise.ids.join(","));
  assert.deepEqual(riskToNoise.ids, []);
  assert.equal(evidence.passed, true, evidence.ids.join(","));
  assert.deepEqual(evidence.ids, []);
  assert.ok(evidence.waitingDirectionExceptionIds.every((id) => (
    evidence.checkedIds.includes(id)
  )));
});

test("fixed-time development reports are byte-stable", async () => {
  const first = JSON.stringify(await buildDevelopmentQualityReport());
  const second = JSON.stringify(await buildDevelopmentQualityReport());
  assert.equal(second, first);
});
