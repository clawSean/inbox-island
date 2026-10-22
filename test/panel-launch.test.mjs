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

test("worker evaluation clears 0.3.1 direct-panel ownership without relying on lifecycle events", async () => {
  const calls = [];
  const listeners = {};
  runInNewContext(worker, {
    chrome: {
      runtime: {
        getURL: (relative) => `chrome-extension://pilot/${relative}`,
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
        onStartup: { addListener: (listener) => { listeners.startup = listener; } },
      },
      sidePanel: {
        setPanelBehavior: (options) => {
          calls.push(["panel", options.openPanelOnActionClick]);
          return Promise.resolve();
        },
        getPanelBehavior: () => {
          calls.push(["get-panel"]);
          return Promise.resolve({ openPanelOnActionClick: false });
        },
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
    ["panel", false],
    ["get-panel"],
  ]);

  assert.equal(await listeners.installed(), true);
  assert.deepEqual(calls.slice(4), calls.slice(0, 4));
  assert.equal(await listeners.startup(), true);
  assert.deepEqual(calls.slice(8), calls.slice(0, 4));
});

test("worker-evaluation popup failure leaves panel ownership untouched and opens a tab", async () => {
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
      sidePanel: { setPanelBehavior: () => { calls.push("panel"); return Promise.resolve(); } },
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

test("worker-evaluation panel-reset failure opens a full-page launcher instead of leaving a silent action", async () => {
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
        getPopup: () => Promise.resolve("chrome-extension://pilot/app/popup.html"),
      },
      sidePanel: {
        setPanelBehavior: () => { calls.push("panel"); return Promise.reject(new Error("PANEL_FAIL")); },
        getPanelBehavior: () => Promise.resolve({ openPanelOnActionClick: false }),
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
    "panel",
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
