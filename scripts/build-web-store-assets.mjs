#!/usr/bin/env node

import crypto from "node:crypto";
import { access, chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { startUiProofServer } from "./ui-proof-server.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "extension", "build");
const assetRoot = path.join(projectRoot, "webstore", "assets");
const playwrightEntry = process.env.PLAYWRIGHT_CORE_PATH;
if (!playwrightEntry) throw new Error("PLAYWRIGHT_CORE_PATH_REQUIRED");
const chromeCandidates = [
  process.env.CHROME_PATH,
  path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function sha256(body) {
  return crypto.createHash("sha256").update(body).digest("hex");
}

await access(playwrightEntry);
const { default: playwright } = await import(pathToFileURL(playwrightEntry));
let executablePath;
for (const candidate of chromeCandidates) {
  if (await access(candidate).then(() => true).catch(() => false)) {
    executablePath = candidate;
    break;
  }
}
if (!executablePath) throw new Error("CHROME_NOT_FOUND");

await mkdir(assetRoot, { recursive: true });
await cp(
  path.join(projectRoot, "extension", "icons", "icon128.png"),
  path.join(assetRoot, "store-icon-128.png"),
);

const server = await startUiProofServer(buildRoot);
const browser = await playwright.chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-background-networking", "--disable-sync", "--no-first-run"],
});
const context = await browser.newContext({
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 800 },
});
const blocked = [];
const errors = [];
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const allowed = request.method() === "GET"
    && request.postData() === null
    && url.origin === server.origin
    && server.allowedPaths.has(url.pathname);
  if (!allowed) {
    blocked.push(request.url());
    await route.abort("blockedbyclient");
    return;
  }
  await route.continue();
});

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${server.origin}/app/index.html?surface=tab`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.uiState === "ready"
    && document.querySelectorAll("[data-thread-id]").length > 0);

  await page.screenshot({
    path: path.join(assetRoot, "screenshot-01-needs-you.png"),
  });
  await page.locator("[data-view=noise]").click();
  await page.waitForFunction(() => document.querySelector("[data-view=noise]")?.getAttribute("aria-pressed") === "true");
  await page.screenshot({
    path: path.join(assetRoot, "screenshot-02-low-signal.png"),
  });
  await page.close();
} finally {
  await context.close();
  await browser.close();
  await server.close();
}

if (blocked.length || errors.length) {
  throw new Error(`STORE_ASSET_PROOF_FAILED:${blocked.length}:${errors.length}`);
}

const files = [
  "store-icon-128.png",
  "screenshot-01-needs-you.png",
  "screenshot-02-low-signal.png",
];
const receipt = {
  schema: "inbox-island.web-store-assets.v1",
  syntheticDataOnly: true,
  externalRequests: 0,
  viewport: { width: 1280, height: 800 },
  files: [],
};
for (const file of files) {
  const body = await readFile(path.join(assetRoot, file));
  receipt.files.push({ file, sha256: sha256(body) });
}
await writeFile(
  path.join(assetRoot, "ASSET-HASHES.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
for (const file of [...files, "ASSET-HASHES.json"]) {
  await chmod(path.join(assetRoot, file), 0o644);
}
console.log(`Built ${files.length} synthetic-only Web Store assets in ${assetRoot}`);
