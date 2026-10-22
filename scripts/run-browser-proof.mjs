#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightEntry = process.env.PLAYWRIGHT_CORE_PATH
  || "/Users/Sean/projects/lobster-chat/node_modules/playwright-core/index.mjs";
await access(playwrightEntry);
const { default: playwright } = await import(pathToFileURL(playwrightEntry));

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Users/Sean/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
let executablePath = null;
for (const candidate of chromeCandidates) {
  if (await access(candidate).then(() => true).catch(() => false)) {
    executablePath = candidate;
    break;
  }
}
if (!executablePath) throw new Error("CHROME_NOT_FOUND");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname === "/" ? "/harness/browser-proof.html" : url.pathname);
    const file = path.resolve(root, `.${requested}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("PATH_BLOCKED");
    const body = await readFile(file);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; img-src data:; style-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "content-type": contentTypes.get(path.extname(file)) || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
  ],
});
const context = await browser.newContext();
const page = await context.newPage();
const allowedPaths = new Set([
  "/fixtures/synthetic-mailbox.mjs",
  "/harness/browser-proof.html",
  "/harness/browser-proof.mjs",
  "/src/content-safety.mjs",
  "/src/contracts.mjs",
  "/src/derived-schema.mjs",
  "/src/derived-store.mjs",
  "/src/deterministic-triage.mjs",
  "/src/gmail-normalize.mjs",
  "/src/indexeddb-adapter.mjs",
  "/src/inference.mjs",
  "/src/pipeline.mjs",
  "/src/triage-worker.mjs",
]);
const requests = [];
const blockedRequests = [];
const webSockets = [];
const consoleErrors = [];
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const valid = url.origin === origin && allowedPaths.has(url.pathname)
    && url.search === "" && request.method() === "GET" && request.postData() === null;
  if (!valid) {
    blockedRequests.push({ method: request.method(), path: `${url.pathname}${url.search}` });
    await route.abort("blockedbyclient");
    return;
  }
  await route.continue();
});
context.on("request", (request) => requests.push({
  at: Date.now(),
  method: request.method(),
  path: new URL(request.url()).pathname,
  body: request.postData() || "",
}));
page.on("websocket", (socket) => webSockets.push(socket.url()));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(`${origin}/harness/browser-proof.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.status !== "running", null, {
    timeout: 30_000,
  });
  const status = await page.getAttribute("html", "data-status");
  const report = JSON.parse(await page.locator("#result").textContent());
  const canaries = [
    "Can you confirm the Q4 budget",
    "Ignore previous instructions",
    "https://evil.example.test",
  ];
  const variants = canaries.flatMap((canary) => [
    canary,
    encodeURIComponent(canary),
    btoa(canary),
    [...canary].reverse().join(""),
  ]);
  const requestText = requests.map(({ path, body }) => `${path}\n${body}`).join("\n");
  const requestCanaryLeaks = variants.filter((canary) => requestText.includes(canary));
  const postReadyRequests = requests.filter(({ at }) => at > report.workerReadyAt);
  const capturedPaths = new Set(requests.map(({ path }) => path));
  const bootManifestComplete = capturedPaths.size === allowedPaths.size
    && [...allowedPaths].every((pathName) => capturedPaths.has(pathName));

  assert.equal(status, "pass", JSON.stringify(report));
  assert.equal(report.passed, true);
  assert.deepEqual(blockedRequests, []);
  assert.deepEqual(requestCanaryLeaks, []);
  assert.deepEqual(postReadyRequests, []);
  assert.equal(bootManifestComplete, true);
  assert.deepEqual(webSockets, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ...report,
    browser: await browser.version(),
    capturedRequests: requests.length,
    uniqueBootAssets: capturedPaths.size,
    bootManifestComplete,
    blockedRequests: blockedRequests.length,
    postReadyRequests: postReadyRequests.length,
    requestCanaryLeaks: requestCanaryLeaks.length,
    webSockets: webSockets.length,
    consoleErrors: consoleErrors.length,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
