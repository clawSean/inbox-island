import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { DerivedStateStore } from "../src/derived-store.mjs";
import { IndexedDbKeyValueAdapter } from "../src/indexeddb-adapter.mjs";

const DATABASE_NAME = "inbox-island-derived-v1";
const CHANNEL_NAME = "inbox-island-derived-events-v1";
const PROTOCOL = "inbox-island-worker-v1";
const ACCOUNT_ID = syntheticMailbox.accountId;
const SURFACE_ID = crypto.randomUUID();

function timeout(code, milliseconds = 15_000) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(code)), milliseconds);
  });
}

function assertSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function") {
    throw new TypeError("INVALID_ABORT_SIGNAL");
  }
  if (signal.aborted) throw new Error("TRIAGE_ABORTED");
}

function withAbort(promise, signal) {
  if (signal === undefined) return promise;
  assertSignal(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error("TRIAGE_ABORTED"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

function ready(worker, signal) {
  return withAbort(Promise.race([new Promise((resolve, reject) => {
    worker.addEventListener("error", () => reject(new Error("WORKER_START_FAILED")), {
      once: true,
    });
    worker.addEventListener("message", function onMessage(event) {
      if (event.data?.type === "error" && event.data?.requestId === "startup") {
        worker.removeEventListener("message", onMessage);
        reject(new Error(event.data.code));
        return;
      }
      if (event.data?.type !== "ready") return;
      worker.removeEventListener("message", onMessage);
      if (event.data.protocol !== PROTOCOL) reject(new Error("WORKER_PROTOCOL_MISMATCH"));
      else resolve(event.data);
    });
  }), timeout("WORKER_READY_TIMEOUT")]), signal);
}

function request(worker, payload, signal) {
  const requestId = `ui-${crypto.randomUUID()}`;
  return withAbort(Promise.race([new Promise((resolve, reject) => {
    worker.addEventListener("message", function onMessage(event) {
      if (event.data?.requestId !== requestId) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.type === "result") resolve(event.data.result);
      else reject(new Error(event.data.code || "TRIAGE_FAILED"));
    });
    worker.postMessage({ type: "triage", requestId, payload });
  }), timeout("WORKER_TRIAGE_TIMEOUT")]), signal);
}

function storage() {
  const adapter = new IndexedDbKeyValueAdapter({ databaseName: DATABASE_NAME });
  return { adapter, store: new DerivedStateStore(adapter) };
}

function announceClear() {
  if (typeof BroadcastChannel !== "function") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(Object.freeze({ sourceId: SURFACE_ID, type: "demo-cleared" }));
  channel.close();
}

export function announceGmailDisconnect() {
  if (typeof BroadcastChannel !== "function") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(Object.freeze({ sourceId: SURFACE_ID, type: "gmail-disconnected" }));
  channel.close();
}

export function observeDemoClears(listener) {
  if (typeof listener !== "function") throw new TypeError("INVALID_CLEAR_LISTENER");
  if (typeof BroadcastChannel !== "function") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    if (event.data?.type === "demo-cleared" && event.data?.sourceId !== SURFACE_ID) listener();
  });
  return () => channel.close();
}

export function observeGmailDisconnects(listener) {
  if (typeof listener !== "function") throw new TypeError("INVALID_DISCONNECT_LISTENER");
  if (typeof BroadcastChannel !== "function") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    if (event.data?.type === "gmail-disconnected" && event.data?.sourceId !== SURFACE_ID) listener();
  });
  return () => channel.close();
}

export async function runMailboxTriage(mailbox, { signal } = {}) {
  if (!mailbox || typeof mailbox !== "object" || Array.isArray(mailbox)) {
    throw new TypeError("INVALID_MAILBOX");
  }
  assertSignal(signal);
  const accountId = mailbox.accountId;
  const payload = { accountId, messages: mailbox.messages };
  const { adapter, store } = storage();
  let generation = null;
  let worker = null;
  try {
    generation = await store.beginGeneration(accountId, { signal });
    assertSignal(signal);
    worker = new Worker(new URL("../src/triage-worker.mjs", import.meta.url), {
      type: "module",
    });
    await ready(worker, signal);
    const output = await request(worker, payload, signal);
    assertSignal(signal);
    let persisted = true;
    try {
      await store.saveAccount(accountId, output.results, { generation, signal });
    } catch (error) {
      if (error.message !== "STALE_GENERATION") throw error;
      persisted = false;
    }
    return Object.freeze({ output, persisted });
  } catch (error) {
    if (error?.message === "OPERATION_ABORTED") throw new Error("TRIAGE_ABORTED");
    throw error;
  } finally {
    worker?.terminate();
    if (generation) await store.cancelGeneration(accountId, { generation }).catch(() => false);
    await adapter.close();
  }
}

export function runDemoTriage(options) {
  return runMailboxTriage(syntheticMailbox, options);
}

export async function loadAccountSnapshot(accountId) {
  const { adapter, store } = storage();
  try {
    return await store.loadAccount(accountId);
  } finally {
    await adapter.close();
  }
}

export function loadDemoSnapshot() {
  return loadAccountSnapshot(ACCOUNT_ID);
}

export async function loadLatestGmailSnapshot() {
  const { adapter, store } = storage();
  try {
    return await store.loadLatestSnapshot({ excludeAccountIds: [ACCOUNT_ID] });
  } finally {
    await adapter.close();
  }
}

export async function clearAccountSnapshot(accountId) {
  const { adapter, store } = storage();
  try {
    await store.clearAccount(accountId);
    const cleared = await store.loadAccount(accountId);
    announceClear();
    return cleared;
  } finally {
    await adapter.close();
  }
}

export function clearDemoSnapshot() {
  return clearAccountSnapshot(ACCOUNT_ID);
}

export async function clearAllSnapshots() {
  const { adapter, store } = storage();
  try {
    await store.clearAll();
    announceClear();
  } finally {
    await adapter.close();
  }
}

export async function openFullTab() {
  const url = new URL("index.html?surface=tab", import.meta.url).href;
  if (globalThis.chrome?.runtime?.id && globalThis.chrome?.tabs?.create) {
    await chrome.tabs.create({ url });
    return;
  }
  globalThis.open(url, "_blank", "noopener");
}

export { ACCOUNT_ID, DATABASE_NAME };
