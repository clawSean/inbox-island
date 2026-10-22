import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startAssetServer } from "./asset-server.mjs";
import { MODEL_ID } from "./support.mjs";

const playwrightEntry = process.env.PLAYWRIGHT_CORE_PATH;
if (!playwrightEntry) throw new Error("PLAYWRIGHT_CORE_PATH_REQUIRED");
const { default: playwright } = await import(pathToFileURL(playwrightEntry));

async function chromeExecutable() {
  const candidates = [
    path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  throw new Error("CHROME_NOT_FOUND");
}

async function allowOnlyOrigin(context, origin, externalAttempts) {
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) {
      externalAttempts.push({ method: route.request().method(), url: route.request().url() });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

async function evaluateEmbedding({ inputTexts, localOrigin, selectedModel }) {
  const adapter = globalThis.navigator?.gpu
    ? await globalThis.navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
    : null;
  if (!adapter) throw new Error("WEBGPU_UNAVAILABLE");
  const { env, pipeline } = await import(`${localOrigin}/runtime/transformers.webgpu.min.js`);
  const nativeFetch = globalThis.fetch.bind(globalThis);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/models/";
  env.useBrowserCache = false;
  env.useWasmCache = false;
  env.experimental_useCrossOriginStorage = false;
  env.fetch = (input, init = {}) => nativeFetch(new URL(input, globalThis.location.origin), {
    ...init,
    credentials: "same-origin",
    referrerPolicy: "no-referrer",
  });
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${localOrigin}/runtime/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${localOrigin}/runtime/ort-wasm-simd-threaded.asyncify.wasm`,
  };
  const loadStarted = performance.now();
  const extractor = await pipeline("feature-extraction", selectedModel, {
    device: "webgpu",
    local_files_only: true,
  });
  const loadMs = performance.now() - loadStarted;
  const firstStarted = performance.now();
  const first = await extractor(inputTexts, { normalize: true, pooling: "mean" });
  const firstInferenceMs = performance.now() - firstStarted;
  const warmStarted = performance.now();
  const warm = await extractor(inputTexts, { normalize: true, pooling: "mean" });
  const warmInferenceMs = performance.now() - warmStarted;
  const firstValues = first.tolist();
  const warmValues = warm.tolist();
  let maximumRepeatDelta = 0;
  for (let row = 0; row < firstValues.length; row += 1) {
    for (let column = 0; column < firstValues[row].length; column += 1) {
      maximumRepeatDelta = Math.max(
        maximumRepeatDelta,
        Math.abs(firstValues[row][column] - warmValues[row][column]),
      );
    }
  }
  await extractor.dispose?.();
  return {
    adapterAvailable: true,
    embeddingDimensions: warm.dims,
    embeddings: warmValues,
    firstInferenceMs,
    loadMs,
    maximumRepeatDelta,
    requestedDevice: "webgpu",
    warmInferenceMs,
    webgpuExposed: Boolean(globalThis.navigator?.gpu),
  };
}

async function proveFallback(browser, origin, requestLog, externalAttempts) {
  const requestStart = requestLog.length;
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await allowOnlyOrigin(context, origin, externalAttempts);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const decision = await page.evaluate(async () => {
    const adapter = globalThis.navigator?.gpu
      ? await globalThis.navigator.gpu.requestAdapter().catch(() => null)
      : null;
    return adapter ? "unexpected-model-path" : "deterministic-only";
  });
  await context.close();
  const assetRequests = requestLog.slice(requestStart).filter(({ path: requestPath }) => (
    requestPath.startsWith("/models/") || requestPath.startsWith("/runtime/")
  ));
  assert.equal(decision, "deterministic-only");
  assert.deepEqual(assetRequests, []);
  return {
    decision,
    modelAssetRequestCount: assetRequests.length,
    simulatedWebgpuExposed: false,
  };
}

export async function runBrowserEmbedding(texts) {
  const { origin, requestLog, server } = await startAssetServer();
  const pageErrors = [];
  const consoleErrors = [];
  const externalAttempts = [];
  let browser;
  let context;
  try {
    browser = await playwright.chromium.launch({
      executablePath: await chromeExecutable(),
      headless: true,
    });
    const browserVersion = await browser.version();
    context = await browser.newContext({ serviceWorkers: "block" });
    await allowOnlyOrigin(context, origin, externalAttempts);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const proof = await page.evaluate(evaluateEmbedding, {
      inputTexts: texts,
      localOrigin: origin,
      selectedModel: MODEL_ID,
    });
    const fallbackProof = await proveFallback(browser, origin, requestLog, externalAttempts);
    assert.equal(externalAttempts.length, 0, "browser attempted external egress");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.equal(requestLog.some(({ status }) => status >= 400), false, "asset request failed");
    return {
      browserVersion,
      consoleErrors,
      externalAttempts,
      fallbackProof,
      pageErrors,
      proof,
      requestLog,
    };
  } finally {
    await context?.close();
    await browser?.close();
    server.close();
    await once(server, "close");
  }
}
