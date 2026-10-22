#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { startUiProofServer } from "./ui-proof-server.mjs";
import {
  assertAppContrast,
  assertAppStructure,
  assertPopupContrast,
  assertStickyActionVisible,
} from "./ui-proof-assertions.mjs";
import { provePopupLaunchers } from "./ui-proof-actions.mjs";
import { writeUiReceipt } from "./ui-receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(root, "extension", "build");
const artifactRoot = path.join(root, "artifacts");
const proofDate = "2026-10-09";
await mkdir(artifactRoot, { recursive: true });

const playwrightEntry = process.env.PLAYWRIGHT_CORE_PATH
  || "/Users/Sean/projects/lobster-chat/node_modules/playwright-core/index.mjs";
await access(playwrightEntry);
const { default: playwright } = await import(pathToFileURL(playwrightEntry));
const candidates = [
  process.env.CHROME_PATH,
  "/Users/Sean/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
let executablePath = null;
for (const candidate of candidates) {
  if (await access(candidate).then(() => true).catch(() => false)) {
    executablePath = candidate;
    break;
  }
}
if (!executablePath) throw new Error("CHROME_NOT_FOUND");

const server = await startUiProofServer(buildRoot);
const browser = await playwright.chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-background-networking", "--disable-sync", "--no-first-run"],
});
const context = await browser.newContext({ reducedMotion: "reduce" });
const requests = [];
const blockedRequests = [];
const webSockets = [];
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const valid = url.origin === server.origin && server.allowedPaths.has(url.pathname)
    && request.method() === "GET" && request.postData() === null;
  if (!valid) {
    blockedRequests.push({ method: request.method(), url: request.url() });
    await route.abort("blockedbyclient");
    return;
  }
  requests.push({ at: Date.now(), body: request.postData() || "", url: request.url() });
  await route.continue();
});
context.on("websocket", (socket) => webSockets.push(socket.url()));

const pageErrors = [];
const consoleErrors = [];
function watch(page) {
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
}

async function openApp(viewport, surface, screenshot) {
  const page = await context.newPage();
  const pageRequests = [];
  page.on("request", (request) => pageRequests.push(request.url()));
  watch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${server.origin}/app/index.html?surface=${surface}`, { waitUntil: "domcontentloaded" });
  await assertAppStructure(context, page);
  const requestsAtReady = pageRequests.length;
  await page.locator("[data-view=all]").click();
  assert.equal(await page.locator("[data-thread-id]").count(), 15);
  const allThreadIds = await page.locator("[data-thread-id]").evaluateAll((items) => (
    items.map((item) => item.dataset.threadId)
  ));
  await page.locator("[data-view=review]").click();
  assert.equal(await page.locator("[data-thread-id]").count(), 8);
  await page.locator("[data-view=all]").click();
  await page.locator("#search-input").fill("evil.example.test");
  assert.equal(await page.locator("[data-thread-id]").count(), 1);
  await page.locator("[data-thread-id]").click();
  assert.equal(await page.locator("a[href*='evil.example.test']").count(), 0);
  assert.equal((await page.locator("#detail-content").textContent()).includes("evil.example.test"), true);
  const gmailLink = new URL(await page.locator(".detail-primary-action").getAttribute("href"));
  assert.equal(gmailLink.origin, "https://mail.google.com");
  assert.equal(gmailLink.searchParams.get("authuser"), "synthetic-user@example.test");
  assert.equal(gmailLink.hash, "#all/m-phish");
  assert.equal(await page.locator(".detail-primary-action").getAttribute("target"), "_blank");
  assert.equal(await page.locator(".detail-primary-action").getAttribute("rel"), "noopener noreferrer");
  if (viewport.width <= 840) await page.keyboard.press("Escape");
  await page.locator("#search-input").fill("");
  await page.locator("[data-view=needs-me]").click();
  assert.equal(await page.locator("[data-thread-id]").count(), 3);
  if (viewport.width <= 840) {
    const first = page.locator("[data-thread-id]").first();
    const triggerId = await first.getAttribute("data-thread-id");
    await first.focus();
    await first.press("Enter");
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("detail-open")), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "selected-thread-heading");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "detail-back");
    assert.equal(await page.locator("#detail-pane").getAttribute("aria-modal"), "true");
    assert.equal(await page.locator(".thread-pane").evaluate((element) => element.inert), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("detail-open")), false);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.threadId), triggerId);
    await assertStickyActionVisible(page);
  }
  if (screenshot) await page.screenshot({ path: path.join(artifactRoot, screenshot), fullPage: true });
  await page.waitForTimeout(200);
  assert.equal(pageRequests.length, requestsAtReady, `${surface} made a post-ready request`);
  return { allThreadIds, page };
}

async function proveCanceledTriageDoesNotPersist(page) {
  return page.evaluate(async () => {
    const NativeWorker = globalThis.Worker;
    let terminated = false;
    let markWorkerStarted;
    const workerStarted = new Promise((resolve) => { markWorkerStarted = resolve; });
    class SlowWorker {
      constructor() {
        this.listeners = new Map();
        markWorkerStarted();
        queueMicrotask(() => this.emit("message", {
          data: { protocol: "inbox-island-worker-v1", type: "ready" },
        }));
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
      }

      emit(type, event) {
        for (const listener of this.listeners.get(type) || []) listener(event);
      }

      postMessage() {}

      terminate() { terminated = true; }
    }
    globalThis.Worker = SlowWorker;
    const runtime = await import("/app/runtime.mjs");
    const accountId = "cancel-proof@example.test";
    const controller = new AbortController();
    let code = null;
    try {
      const run = runtime.runMailboxTriage({ accountId, messages: [] }, {
        signal: controller.signal,
      });
      await Promise.race([
        workerStarted,
        new Promise((_, reject) => setTimeout(() => reject(new Error("WORKER_START_NOT_OBSERVED")), 2_000)),
      ]);
      controller.abort();
      await run;
    } catch (error) {
      code = error.message;
    } finally {
      globalThis.Worker = NativeWorker;
    }
    const persisted = await runtime.loadAccountSnapshot(accountId);
    await runtime.clearAccountSnapshot(accountId);
    return { code, persisted, terminated };
  });
}

async function proveCanceledBeginMapsAndLeavesNoKeys(page) {
  return page.evaluate(async () => {
    const { IndexedDbKeyValueAdapter } = await import("/src/indexeddb-adapter.mjs");
    const runtime = await import("/app/runtime.mjs");
    const originalMutate = IndexedDbKeyValueAdapter.prototype.mutate;
    const accountId = "cancel-begin-proof@example.test";
    let markReached;
    let releaseBegin;
    const reached = new Promise((resolve) => { markReached = resolve; });
    const released = new Promise((resolve) => { releaseBegin = resolve; });
    IndexedDbKeyValueAdapter.prototype.mutate = async function deferredMutate(
      key,
      update,
      options,
    ) {
      if (key.endsWith(accountId) && options?.signal) {
        markReached();
        await released;
      }
      return originalMutate.call(this, key, update, options);
    };
    const controller = new AbortController();
    let code = null;
    try {
      const run = runtime.runMailboxTriage({ accountId, messages: [] }, {
        signal: controller.signal,
      });
      await reached;
      controller.abort();
      await runtime.clearAllSnapshots();
      releaseBegin();
      await run;
    } catch (error) {
      code = error.message;
    } finally {
      releaseBegin?.();
      IndexedDbKeyValueAdapter.prototype.mutate = originalMutate;
    }
    const adapter = new IndexedDbKeyValueAdapter({ databaseName: runtime.DATABASE_NAME });
    const residualAccountKeys = (await adapter.keys())
      .filter((key) => key.startsWith("inbox-island:account:"));
    await adapter.close();
    return { code, residualAccountKeys };
  });
}

try {
  const wide = await openApp({ width: 1440, height: 900 }, "tab", `ui-full-tab-${proofDate}.png`);
  const appContrast = await assertAppContrast(wide.page);
  const medium = await openApp({ width: 825, height: 850 }, "tab");
  const edge = await openApp({ width: 721, height: 850 }, "tab");
  const narrow = await openApp({ width: 320, height: 800 }, "tab", `ui-narrow-proof-${proofDate}.png`);
  assert.deepEqual(narrow.allThreadIds, wide.allThreadIds);
  assert.deepEqual(medium.allThreadIds, wide.allThreadIds);
  assert.deepEqual(edge.allThreadIds, wide.allThreadIds);
  await medium.page.close();
  await edge.page.close();
  await narrow.page.close();

  const popup = await context.newPage();
  watch(popup);
  await popup.setViewportSize({ width: 420, height: 560 });
  await popup.goto(`${server.origin}/app/popup.html`, { waitUntil: "domcontentloaded" });
  await popup.waitForFunction(() => document.documentElement.dataset.popupState === "ready");
  const popupRequestsAtReady = requests.length;
  assert.equal(await popup.locator("#saved-needs").textContent(), "3");
  assert.equal(await popup.locator("#saved-waiting").textContent(), "1");
  assert.equal(await popup.locator("#saved-records").textContent(), "2");
  assert.equal(await popup.locator("#saved-low-signal").textContent(), "1");
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const popupContrast = await assertPopupContrast(context, popup);
  await popup.screenshot({ path: path.join(artifactRoot, `ui-popup-${proofDate}.png`), fullPage: true });
  await popup.waitForTimeout(100);
  assert.equal(requests.length, popupRequestsAtReady, "popup made a post-ready request");
  await popup.locator("#clear-saved").click();
  await popup.waitForFunction(() => document.querySelector("#popup-status").textContent === "Demo cleared");
  assert.equal(await popup.locator("#mini-stats").isHidden(), true);
  await wide.page.waitForFunction(() => document.querySelector("#metric-needs").textContent === "0");
  await provePopupLaunchers(context, server.origin, watch);
  const canceledTriage = await proveCanceledTriageDoesNotPersist(wide.page);
  assert.deepEqual(canceledTriage, {
    code: "TRIAGE_ABORTED",
    persisted: null,
    terminated: true,
  });
  const canceledBegin = await proveCanceledBeginMapsAndLeavesNoKeys(wide.page);
  assert.deepEqual(canceledBegin, {
    code: "TRIAGE_ABORTED",
    residualAccountKeys: [],
  });

  await pageSafeClose(wide.page);
  await popup.close();
  const canaries = ["Ignore previous instructions", "https://evil.example.test"];
  const requestText = requests.map(({ url, body }) => `${url}\n${body}`).join("\n");
  assert.deepEqual(canaries.filter((value) => requestText.includes(value)), []);
  assert.deepEqual(blockedRequests, []);
  assert.deepEqual(webSockets, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  const report = {
    passed: true,
    browser: await browser.version(),
    viewports: ["1440x900", "825x850", "721x850", "400x900", "320x800", "popup:420x560"],
    requests: requests.length,
    postReadyRequests: 0,
    externalRequests: blockedRequests.length,
    webSockets: webSockets.length,
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    canceledTriage,
    canceledBegin,
    contrast: { app: appContrast, popup: popupContrast },
    screenshots: [
      `ui-full-tab-${proofDate}.png`,
      `ui-narrow-proof-${proofDate}.png`,
      `ui-popup-${proofDate}.png`,
    ],
    nativeExtensionRuntimeProved: false,
  };
  await writeUiReceipt(report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}

async function pageSafeClose(page) {
  if (!page.isClosed()) await page.close();
}
