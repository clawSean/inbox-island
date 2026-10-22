import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "extension/manifest.json"), "utf8"));
const worker = await readFile(path.join(root, "extension/background.mjs"), "utf8");
const popup = await readFile(path.join(root, "app/popup.mjs"), "utf8");
const appHtml = await readFile(path.join(root, "app/index.html"), "utf8");
const appSource = await readFile(path.join(root, "app/app.mjs"), "utf8");

async function withChrome(stub, run) {
  const hadChrome = Object.hasOwn(globalThis, "chrome");
  const previous = globalThis.chrome;
  globalThis.chrome = stub;
  try {
    return await run();
  } finally {
    if (hadChrome) globalThis.chrome = previous;
    else delete globalThis.chrome;
  }
}

async function settleWorker() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("toolbar click always exposes the browser-owned popup launcher", () => {
  assert.equal(manifest.action.default_popup, "app/popup.html");
  assert.equal(manifest.action.default_title, "Open Inbox Island");
  assert.deepEqual(manifest.background, {
    service_worker: "background.mjs",
    type: "module",
  });
});

test("toolbar popup exposes one honest persistent-workspace action", () => {
  const handler = popup.slice(popup.indexOf('document.querySelector("#open-tab")'));
  assert.doesNotMatch(popup, /openCompactWindow|open-compact|compact window/iu);
  assert.match(handler, /await openFullTab\(\)/u);
  assert.match(handler, /globalThis\.close\(\)/u);
});

test("packaged Gmail surface exposes a disconnected synthetic demo", () => {
  assert.match(appHtml, /id="demo-button"[^>]*hidden[^>]*>Try demo</u);
  assert.match(appSource, /gmailUi\?\.cancelPreparation\(\);\s+root\.querySelector\("#gmail-disclosure"\)\.hidden = true;\s+await runDemo\(\)/u);
  assert.match(appSource, /#demo-button"\)\.hidden = false/u);
  assert.match(appSource, /Demo · Gmail not connected/u);
});

test("worker evaluation verifies the browser-owned popup without side-panel access", async () => {
  const calls = [];
  const listeners = {};
  runInNewContext(worker, {
    chrome: {
      runtime: {
        getURL: (relative) => `chrome-extension://pilot/${relative}`,
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
        onStartup: { addListener: (listener) => { listeners.startup = listener; } },
      },
      action: {
        setPopup: (options) => {
          calls.push(["popup", options.popup]);
          return Promise.resolve();
        },
        getPopup: () => {
          calls.push(["get-popup"]);
          return Promise.resolve("chrome-extension://pilot/app/popup.html");
        },
      },
      tabs: { create: () => Promise.resolve() },
    },
    console,
  });

  await settleWorker();
  assert.deepEqual(calls, [
    ["popup", "app/popup.html"],
    ["get-popup"],
  ]);

  assert.equal(await listeners.installed(), true);
  assert.deepEqual(calls.slice(2), calls.slice(0, 2));
  assert.equal(await listeners.startup(), true);
  assert.deepEqual(calls.slice(4), calls.slice(0, 2));
});

test("worker-evaluation popup failure opens a full-page fallback", async () => {
  const calls = [];
  const listeners = {};
  runInNewContext(worker, {
    chrome: {
      runtime: {
        getURL: (relative) => `chrome-extension://pilot/${relative}`,
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
        onStartup: { addListener: () => {} },
      },
      action: { setPopup: () => { calls.push("popup"); return Promise.reject(new Error("POPUP_FAIL")); } },
      tabs: {
        create: (options) => { calls.push(options.url); return Promise.resolve(); },
      },
    },
    console: { error: () => {} },
  });

  await settleWorker();
  assert.deepEqual(calls, [
    "popup",
    "chrome-extension://pilot/app/index.html?surface=tab&launcher=repair",
  ]);
});

test("worker-evaluation popup mismatch opens a full-page launcher", async () => {
  const calls = [];
  const listeners = {};
  runInNewContext(worker, {
    chrome: {
      runtime: {
        getURL: (relative) => `chrome-extension://pilot/${relative}`,
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
        onStartup: { addListener: () => {} },
      },
      action: {
        setPopup: () => { calls.push("popup"); return Promise.resolve(); },
        getPopup: () => Promise.resolve(""),
      },
      tabs: {
        create: (options) => { calls.push(options.url); return Promise.resolve(); },
      },
    },
    console: { error: () => {} },
  });

  await settleWorker();
  assert.deepEqual(calls, [
    "popup",
    "chrome-extension://pilot/app/index.html?surface=tab&launcher=repair",
  ]);
});

test("worker keeps the popup launcher when a browser has no side-panel API", async () => {
  const calls = [];
  runInNewContext(worker, {
    chrome: {
      runtime: {
        getURL: (relative) => `chrome-extension://pilot/${relative}`,
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
      },
      action: {
        setPopup: ({ popup: path }) => { calls.push(["popup", path]); return Promise.resolve(); },
        getPopup: () => { calls.push(["get-popup"]); return Promise.resolve("chrome-extension://pilot/app/popup.html"); },
      },
      tabs: { create: ({ url }) => { calls.push(["tab", url]); return Promise.resolve(); } },
    },
    console: { error() {} },
  });
  await settleWorker();
  assert.deepEqual(calls, [["popup", "app/popup.html"], ["get-popup"]]);
});
