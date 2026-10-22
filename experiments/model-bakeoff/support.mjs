import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { normalizeMailbox } from "../../src/gmail-normalize.mjs";
import { LABELS, MODEL_GATE } from "./holdout.mjs";

export const LOBSTER_ROOT = "/Users/Sean/projects/lobster-chat";
export const MODEL_ID = "Xenova/bge-small-en-v1.5";
export const MODEL_REVISION = "ea104dacec62c0de699686887e3f920caeb4f3e3";
export const MODEL_ROOT = path.join(
  "/Users/Sean/Library/Caches/octolib/fastembed/models--Xenova--bge-small-en-v1.5/snapshots",
  MODEL_REVISION,
);
export const RUNTIME_ROOT = path.join(LOBSTER_ROOT, ".privacy-runtime/4.2.0");
export const ORT_ROOT = path.join(LOBSTER_ROOT, "node_modules/onnxruntime-web/dist");
export const FIXED_NOW = () => new Date("2026-11-04T00:00:00.000Z");
export const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
export const ASSET_FILES = Object.freeze([
  ["runtime/transformers.webgpu.min.js", path.join(RUNTIME_ROOT, "transformers.webgpu.min.js")],
  ["runtime/ort-wasm-simd-threaded.asyncify.mjs", path.join(ORT_ROOT, "ort-wasm-simd-threaded.asyncify.mjs")],
  ["runtime/ort-wasm-simd-threaded.asyncify.wasm", path.join(ORT_ROOT, "ort-wasm-simd-threaded.asyncify.wasm")],
  ["model/config.json", path.join(MODEL_ROOT, "config.json")],
  ["model/tokenizer_config.json", path.join(MODEL_ROOT, "tokenizer_config.json")],
  ["model/tokenizer.json", path.join(MODEL_ROOT, "tokenizer.json")],
  ["model/special_tokens_map.json", path.join(MODEL_ROOT, "special_tokens_map.json")],
  ["model/onnx/model.onnx", path.join(MODEL_ROOT, "onnx/model.onnx")],
]);

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function round(value) {
  return Number(value.toFixed(6));
}

export function countLabels(values) {
  return Object.fromEntries(LABELS.map((label) => [
    label,
    values.filter((value) => value === label).length,
  ]));
}

export function messageText(message) {
  return [
    `Direction: ${message.direction}`,
    `From: ${message.from}`,
    `Subject: ${message.subject}`,
    `Body: ${message.body}`,
  ].join("\n");
}

export function threadTexts(messages) {
  const groups = new Map();
  for (const message of normalizeMailbox(messages)) {
    const values = groups.get(message.threadId) || [];
    values.push(message);
    groups.set(message.threadId, values);
  }
  return new Map([...groups].map(([threadId, values]) => [
    threadId,
    values.sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .map(messageText).join("\n\n"),
  ]));
}

export function calculateMetrics(cases, predictions, riskById) {
  const confusion = Object.fromEntries(LABELS.map((expected) => [
    expected,
    Object.fromEntries(LABELS.map((predicted) => [predicted, 0])),
  ]));
  for (const fixture of cases) confusion[fixture.expected][predictions.get(fixture.id)] += 1;
  const perLabel = {};
  for (const label of LABELS) {
    const truePositive = confusion[label][label];
    const falsePositive = LABELS.reduce((sum, expected) => (
      expected === label ? sum : sum + confusion[expected][label]
    ), 0);
    const falseNegative = LABELS.reduce((sum, predicted) => (
      predicted === label ? sum : sum + confusion[label][predicted]
    ), 0);
    const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
    const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    perLabel[label] = {
      support: truePositive + falseNegative,
      truePositive,
      falsePositive,
      falseNegative,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
    };
  }
  const important = new Set(["reply", "attention"]);
  const importantCases = cases.filter(({ expected }) => important.has(expected));
  const importantCaught = importantCases.filter(({ id }) => important.has(predictions.get(id)));
  const falseImportant = cases.filter(({ expected, id }) => (
    !important.has(expected) && important.has(predictions.get(id))
  ));
  const uncertain = cases.filter(({ id }) => predictions.get(id) === "uncertain");
  const riskBearing = cases.filter(({ id }) => riskById.get(id).length > 0);
  const unsafeToNoise = riskBearing.filter(({ id }) => predictions.get(id) === "noise");
  const exact = cases.filter(({ expected, id }) => predictions.get(id) === expected);
  return {
    confusion,
    exactAccuracy: round(exact.length / cases.length),
    exactCorrect: exact.length,
    macroF1: round(LABELS.reduce((sum, label) => sum + perLabel[label].f1, 0) / LABELS.length),
    perLabel,
    replyAttentionRecall: round(importantCaught.length / importantCases.length),
    replyAttentionCaught: importantCaught.length,
    replyAttentionSupport: importantCases.length,
    falseImportantCount: falseImportant.length,
    falseImportantRate: round(falseImportant.length / (cases.length - importantCases.length)),
    falseImportantIds: falseImportant.map(({ id }) => id),
    uncertainCount: uncertain.length,
    uncertainRate: round(uncertain.length / cases.length),
    riskBearingCount: riskBearing.length,
    unsafeToNoiseCount: unsafeToNoise.length,
    unsafeToNoiseIds: unsafeToNoise.map(({ id }) => id),
  };
}

export function scoreEmbeddings(embeddings, eligibleIds) {
  const prototypeVectors = new Map(LABELS.map((label, index) => [label, embeddings[index]]));
  const modelPredictions = new Map();
  for (const [eligibleIndex, id] of eligibleIds.entries()) {
    const vector = embeddings[LABELS.length + eligibleIndex];
    const scores = LABELS.map((label) => {
      const prototype = prototypeVectors.get(label);
      assert.equal(vector.length, prototype.length);
      return {
        label,
        score: vector.reduce((sum, value, index) => sum + value * prototype[index], 0),
      };
    }).sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    const top = scores[0];
    const margin = top.score - scores[1].score;
    const similarityGate = top.label === "noise"
      ? MODEL_GATE.noiseMinimumSimilarity : MODEL_GATE.minimumSimilarity;
    const marginGate = top.label === "noise"
      ? MODEL_GATE.noiseMinimumMargin : MODEL_GATE.minimumMargin;
    const accepted = top.score >= similarityGate && margin >= marginGate;
    modelPredictions.set(id, {
      accepted,
      bucket: accepted ? top.label : "uncertain",
      margin: round(margin),
      scores: Object.fromEntries(scores.map(({ label, score }) => [label, round(score)])),
      topLabel: top.label,
      topScore: round(top.score),
    });
  }
  return { modelPredictions, prototypeVectors };
}

export function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}
