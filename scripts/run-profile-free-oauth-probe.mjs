#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionId = "jeemdbgakejlmmmbngpihndfkjiddbhl";
const probeSource = path.join(root, "experiments", "profile-free-oauth-probe");
const configs = {
  arc: { name: "Arc", executable: "/Applications/Arc.app/Contents/MacOS/Arc" },
  dia: { name: "Dia", executable: "/Applications/Dia.app/Contents/MacOS/Dia" },
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromium() {
  const require = createRequire(import.meta.url);
  return require("/Users/Sean/.npm-global/lib/node_modules/openclaw/node_modules/playwright-core").chromium;
}

async function waitFor(fn, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw last || new Error("Timed out");
}

function assertNotRunning(name) {
  const result = spawnSync("/usr/bin/pgrep", ["-x", name], { encoding: "utf8" });
  if (result.status === 0) throw new Error(`${name} is already running; refusing to touch a personal session`);
  if (result.status !== 1) throw new Error(`Could not inspect ${name} process state`);
}

async function moveToTrash(directory) {
  const destination = path.join(os.homedir(), ".Trash", `${path.basename(directory)}-${Date.now()}`);
  await rename(directory, destination);
  return destination;
}

async function run(browserId, {
  exactBuild = false,
  panelProbe = false,
  holdMilliseconds = 0,
  visualMarker = false,
} = {}) {
  const config = configs[browserId];
  if (!config) throw new Error("Use --browser arc or --browser dia");
  assertNotRunning(config.name);

  const temp = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), `inbox-island-${browserId}-oauth-probe-`)));
  const profile = path.join(temp, "profile");
  const extension = path.join(temp, "extension");
  await mkdir(profile, { mode: 0o700 });
  const source = exactBuild ? path.join(root, "extension", "build") : probeSource;
  const launcherProbe = panelProbe;
  const pagePath = launcherProbe ? "app/popup.html" : exactBuild ? "app/index.html?surface=tab" : "probe.html";
  const clickSelector = panelProbe ? "#open-panel" : exactBuild ? "#run-button" : "#probe";
  await cp(source, extension, { recursive: true });
  const args = [
    `--user-data-dir=${profile}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--enable-automation",
    "--disable-features=Translate,MediaRouter,DisableDisableExtensionsExceptCommandLineSwitch",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--disable-component-update",
    "--disable-sync",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--use-mock-keychain",
    "--window-size=1100,800",
    "about:blank"
  ];
  const child = spawn(config.executable, args, { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(...chunk.split(/\r?\n/u).filter(Boolean)));
  let browser;
  try {
    const devtools = await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`${config.name} exited before DevTools was ready`);
      const activePortCandidates = [
        path.join(profile, "DevToolsActivePort"),
        path.join(profile, "User Data", "DevToolsActivePort"),
      ];
      let contents;
      for (const candidate of activePortCandidates) {
        try {
          contents = await readFile(candidate, "utf8");
          break;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      const stderrPort = stderr.join("\n").match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//u)?.[1];
      if (!contents && !stderrPort) return null;
      const [port] = contents ? contents.trim().split(/\r?\n/u) : [stderrPort];
      if (!/^\d+$/u.test(port)) return null;
      return `http://127.0.0.1:${port}`;
    }).catch((error) => {
      const detail = stderr.slice(-20).join(" | ");
      throw new Error(`${error.message}; ${config.name} stderr: ${detail || "none"}`);
    });
    browser = await chromium().connectOverCDP(devtools);
    const context = browser.contexts()[0];
    const page = await context.newPage();
    const observed = [];
    let gmailRequestCount = 0;
    context.on("page", (opened) => observed.push(opened.url()));
    context.on("request", (request) => {
      try {
        if (new URL(request.url()).hostname === "gmail.googleapis.com") gmailRequestCount += 1;
      } catch {}
    });
    await page.bringToFront();
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(`chrome-extension://${extensionId}/${pagePath}`);
    if (launcherProbe) await page.waitForFunction(() =>
      document.documentElement.dataset.popupState === "ready");
    else if (exactBuild) await page.waitForFunction(() =>
      document.documentElement.dataset.uiState === "ready");
    const browserIdentity = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      brands: navigator.userAgentData?.brands || [],
    }));
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: 1100, height: 800, windowState: "normal" },
    }).catch(() => {});
    const { root: documentRoot } = await session.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: documentRoot.nodeId,
      selector: clickSelector,
    });
    const { model } = await session.send("DOM.getBoxModel", { nodeId });
    const x = (model.content[0] + model.content[2] + model.content[4] + model.content[6]) / 4;
    const y = (model.content[1] + model.content[3] + model.content[5] + model.content[7]) / 4;
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    const outcome = await waitFor(async () => {
      if (panelProbe) {
        const urls = context.pages().map((candidate) => candidate.url());
        const contexts = await page.evaluate(async () => typeof chrome.runtime.getContexts === "function"
          ? chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] }) : []);
        if (contexts.length) return { kind: "panel", contextCount: contexts.length };
        const fallback = urls.find((url) => url.includes("app/index.html?surface=tab"));
        if (fallback) return { kind: "fallback-tab" };
        return null;
      }
      const status = exactBuild ? null : await page.locator("#status").textContent();
      const urls = context.pages().map((candidate) => candidate.url());
      const provider = urls.find((url) => /accounts\.google\.com|chrome:\/\/signin/u.test(url));
      if (provider) {
        const parsed = new URL(provider);
        if (/\/signin\/oauth\/error|\/o\/oauth2\/error/u.test(parsed.pathname)) {
          return { kind: "provider-error", providerOrigin: parsed.origin, providerPath: parsed.pathname };
        }
        return { kind: "chooser-opened", providerOrigin: parsed.origin, providerPath: parsed.pathname };
      }
      if (status && status !== "pending" && status !== "ready") return { kind: "api-result", status };
      return null;
    }, 20_000);
    const trusted = exactBuild ? { trusted: "browser-input", activation: "browser-input" }
      : await page.evaluate(() => ({
        trusted: document.documentElement.dataset.trusted,
        activation: document.documentElement.dataset.activation,
      }));
    if (visualMarker && panelProbe) {
      await page.setContent("<title>Panel visibility marker</title><main style=\"font:700 42px system-ui;color:white;background:#b00020;position:fixed;inset:0;padding:48px\">MAIN TAB — SIDE PANEL MUST APPEAR BESIDE THIS RED MARKER</main>");
      await page.bringToFront();
    }
    if (holdMilliseconds > 0) await sleep(holdMilliseconds);
    return {
      browser: browserId,
      exactBuild,
      panelProbe,
      gmailRequestCount,
      outcome,
      trusted,
      browserIdentity,
      observedPageCount: observed.length,
    };
  } finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill("SIGTERM");
    await waitFor(() => child.exitCode !== null, 5_000).catch(() => child.kill("SIGKILL"));
    await moveToTrash(temp);
  }
}

const index = process.argv.indexOf("--browser");
const browserId = index >= 0 ? process.argv[index + 1] : null;
const result = await run(browserId, {
  exactBuild: process.argv.includes("--exact-build"),
  panelProbe: process.argv.includes("--panel"),
  holdMilliseconds: Number(process.argv.find((argument) => argument.startsWith("--hold-ms="))?.split("=")[1] || 0),
  visualMarker: process.argv.includes("--visual-marker"),
});
console.log(JSON.stringify(result, null, 2));
