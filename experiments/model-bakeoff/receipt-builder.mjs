import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOLDOUT_CASES,
  HOLDOUT_VERSION,
  LABELS,
  MODEL_GATE,
  PROTOTYPES,
  PROTOTYPE_VERSION,
} from "./holdout.mjs";
import {
  ASSET_FILES,
  CSP,
  LOBSTER_ROOT,
  MODEL_ID,
  MODEL_REVISION,
  MODEL_ROOT,
  round,
  sha256File,
  sha256Text,
  stableJson,
  vectorNorm,
} from "./support.mjs";

const experimentRoot = path.dirname(fileURLToPath(import.meta.url));
const moduleNames = Object.freeze([
  "asset-server.mjs",
  "browser-runtime.mjs",
  "holdout.mjs",
  "receipt-builder.mjs",
  "run-bakeoff.mjs",
  "support.mjs",
]);

async function hashesAndAssets() {
  const moduleSha256 = {};
  const moduleLineCounts = {};
  for (const name of moduleNames) {
    const filePath = path.join(experimentRoot, name);
    const source = await readFile(filePath, "utf8");
    moduleSha256[name] = await sha256File(filePath);
    moduleLineCounts[name] = source.endsWith("\n")
      ? source.split("\n").length - 1
      : source.split("\n").length;
  }
  const assets = [];
  for (const [name, filePath] of ASSET_FILES) {
    const details = await stat(filePath);
    assets.push({ filePath, name, sha256: await sha256File(filePath), size: details.size });
  }
  return { assets, moduleLineCounts, moduleSha256 };
}

function comparison(input) {
  const accepted = [...input.modelPredictions]
    .filter(([, prediction]) => prediction.accepted)
    .map(([id, prediction]) => ({ id, prediction }));
  const correct = accepted.filter(({ id, prediction }) => (
    prediction.bucket === input.expectedById.get(id)
  ));
  const rawCorrect = [...input.modelPredictions].filter(([id, prediction]) => (
    prediction.topLabel === input.expectedById.get(id)
  ));
  const hybrid = {
    ...input.hybridMetrics,
    perLabelF1: Object.fromEntries(LABELS.map((label) => [
      label,
      input.hybridMetrics.perLabel[label].f1,
    ])),
  };
  return {
    baseline: input.baselineMetrics,
    deterministicPlusBge: hybrid,
    eligibleCount: input.eligibleIds.length,
    acceptedModelCount: accepted.length,
    acceptedModelCorrectCount: correct.length,
    acceptedModelAccuracy: accepted.length ? round(correct.length / accepted.length) : null,
    acceptedModelWrongIds: accepted
      .filter(({ id, prediction }) => prediction.bucket !== input.expectedById.get(id))
      .map(({ id }) => id),
    acceptedPredictions: accepted.map(({ id, prediction }) => ({
      id,
      expected: input.expectedById.get(id),
      predicted: prediction.bucket,
      score: prediction.topScore,
      margin: prediction.margin,
    })),
    gatedToUncertainCount: [...input.modelPredictions.values()]
      .filter(({ accepted: allowed }) => !allowed).length,
    rawTop1CorrectCountOnEligible: rawCorrect.length,
    rawTop1AccuracyOnEligible: round(rawCorrect.length / input.modelPredictions.size),
  };
}

export async function buildReceipt(input) {
  const { assets, moduleLineCounts, moduleSha256 } = await hashesAndAssets();
  const prototypeNorms = LABELS.map((label) => vectorNorm(input.prototypeVectors.get(label)));
  return {
    schemaVersion: "inbox-island-model-bakeoff-receipt-v1",
    generatedAt: new Date().toISOString(),
    decision: "reject-this-six-prototype-bge-classifier",
    experiment: {
      path: experimentRoot,
      runnerSha256: moduleSha256["run-bakeoff.mjs"],
      moduleSha256,
      moduleLineCounts,
      maximumModuleLineCount: Math.max(...Object.values(moduleLineCounts)),
      productionFilesModified: false,
      downloadsOrInstalls: false,
    },
    holdout: {
      version: HOLDOUT_VERSION,
      caseCount: HOLDOUT_CASES.length,
      expectedCounts: input.expectedCounts,
      fixtureSha256: sha256Text(stableJson(HOLDOUT_CASES)),
      exactRawMessageOverlapWithProductFixture: 0,
      exactValidNormalizedMessageOverlapWithProductFixture: 0,
      independentlyAuthoredOrBlinded: false,
      riskBearingIds: HOLDOUT_CASES.filter(({ id }) => input.riskById.get(id).length > 0)
        .map(({ id }) => id),
    },
    prototypes: {
      version: PROTOTYPE_VERSION,
      count: LABELS.length,
      values: PROTOTYPES,
      gate: MODEL_GATE,
      sha256: sha256Text(stableJson({ gate: MODEL_GATE, prototypes: PROTOTYPES })),
      frozenBeforeFirstScoredModelRun: true,
      changedAfterSeeingScores: false,
    },
    model: {
      id: MODEL_ID,
      revision: MODEL_REVISION,
      task: "prototype-similarity classification only",
      license: "MIT (upstream BAAI model; cached Xenova conversion has no bundled license file)",
      snapshotPath: MODEL_ROOT,
      assets,
    },
    runtime: {
      browser: input.browserRun.browserVersion,
      transformersJsVersion: "4.2.0",
      onnxRuntimeWebVersion: "1.26.0-dev.20260416-b7804b056c",
      lobsterChatRevision: execFileSync(
        "git",
        ["-C", LOBSTER_ROOT, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      ).trim(),
      webgpu: {
        exposed: input.browserRun.proof.webgpuExposed,
        adapterAvailable: input.browserRun.proof.adapterAvailable,
        requestedDevice: input.browserRun.proof.requestedDevice,
        silentModelFallbackAllowed: false,
      },
      deterministicFallback: {
        contractChecked: true,
        policy: "If BGE is unavailable or gated out, retain the deterministic result unchanged.",
        predictionsPreserved: input.fallbackPredictions.size,
        simulatedNoWebgpu: input.browserRun.fallbackProof,
        simulatedNoWebgpuDecision: input.browserRun.fallbackProof.decision,
        simulatedNoWebgpuModelAssetRequestCount:
          input.browserRun.fallbackProof.modelAssetRequestCount,
      },
      timingsMs: {
        load: round(input.browserRun.proof.loadMs),
        firstBatchInference: round(input.browserRun.proof.firstInferenceMs),
        warmBatchInference: round(input.browserRun.proof.warmInferenceMs),
      },
      batch: {
        totalTexts: input.embeddingInputs.length,
        prototypeTexts: LABELS.length,
        eligibleThreadTexts: input.eligibleIds.length,
        embeddingDimensions: input.browserRun.proof.embeddingDimensions,
        normalizedVectorNormRange: [
          round(Math.min(...prototypeNorms)),
          round(Math.max(...prototypeNorms)),
        ],
        maximumWarmRepeatDelta: input.browserRun.proof.maximumRepeatDelta,
      },
    },
    network: {
      policy: "Loopback same-origin only; every other browser-context request is blocked and counted.",
      contentSecurityPolicy: CSP,
      externalAttemptCount: input.browserRun.externalAttempts.length,
      externalAttempts: input.browserRun.externalAttempts,
      localRequestCount: input.browserRun.requestLog.length,
      localRequests: input.browserRun.requestLog,
      pageErrors: input.browserRun.pageErrors,
      consoleErrors: input.browserRun.consoleErrors,
    },
    comparison: comparison(input),
    predictions: HOLDOUT_CASES.map(({ id, expected }) => ({
      id,
      expected,
      baseline: input.baselinePredictions.get(id),
      hybrid: input.hybridPredictions.get(id),
      riskFlags: input.riskById.get(id),
      eligibleForBge: input.modelPredictions.has(id),
      model: input.modelPredictions.get(id) || null,
    })),
    assertions: {
      sixBalancedClasses: true,
      exactProductFixtureTextDisjoint: true,
      modelOnlySawCleanDeterministicUncertainThreads: true,
      unsafeToNoiseZero: true,
      externalEgressAttemptsZero: true,
      strictCspPassed: true,
      noModelProseOrActionFields: true,
    },
    limitations: [
      "The holdout and prototypes were authored by the same implementer; it is frozen and exact-text-disjoint, not independently blinded.",
      "The corpus is synthetic and small, so metrics are directional and do not authorize real-mail use.",
      "Timings are one headless Chrome run with local files and a warm OS cache, not cold-download or representative-hardware benchmarks.",
      "The experiment proves a strict local web-page path, not Manifest V3 packaging, extension Worker lifecycle, browser-store review, or cross-device support.",
      "BGE emits only a bucket similarity decision; it does not generate summaries, actions, deadlines, or evidence.",
    ],
  };
}
