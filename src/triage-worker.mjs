const blocked = () => {
  throw new Error("NETWORK_FORBIDDEN");
};

const lockedCapabilities = Object.freeze([
  "BroadcastChannel",
  "EventSource",
  "RTCPeerConnection",
  "SharedWorker",
  "WebSocket",
  "WebTransport",
  "Worker",
  "XMLHttpRequest",
  "fetch",
  "importScripts",
  "webkitRTCPeerConnection",
]);

function defineBlocked(target, name) {
  try {
    Object.defineProperty(target, name, {
      configurable: false,
      enumerable: false,
      value: blocked,
      writable: false,
    });
  } catch {
    throw new Error("WORKER_HARDENING_FAILED");
  }
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  if (!descriptor || descriptor.value !== blocked || descriptor.configurable
    || descriptor.writable || Reflect.deleteProperty(target, name)) {
    throw new Error("WORKER_HARDENING_FAILED");
  }
}

function lockCapability(target, name) {
  let owner = target;
  while (owner && !Object.hasOwn(owner, name)) owner = Object.getPrototypeOf(owner);
  if (owner && owner !== target) defineBlocked(owner, name);
  defineBlocked(target, name);
}

for (const name of lockedCapabilities) lockCapability(globalThis, name);
if (globalThis.navigator) lockCapability(globalThis.navigator, "sendBeacon");

function exactRequest(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === ["payload", "requestId", "type"].sort().join("\n")
    && value.type === "triage"
    && typeof value.requestId === "string"
    && /^[A-Za-z0-9._-]{1,100}$/u.test(value.requestId)
    && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload)
    && Object.keys(value.payload).sort().join("\n") === ["accountId", "messages"].sort().join("\n");
}

const pipelinePromise = import("./pipeline.mjs");
globalThis.addEventListener("message", async (event) => {
  const requestId = typeof event.data?.requestId === "string"
    && /^[A-Za-z0-9._-]{1,100}$/u.test(event.data.requestId)
    ? event.data.requestId
    : "invalid";
  if (!exactRequest(event.data)) {
    globalThis.postMessage({ type: "error", requestId, code: "INVALID_WORKER_REQUEST" });
    return;
  }
  try {
    const { runSyntheticTriage } = await pipelinePromise;
    const result = await runSyntheticTriage(event.data.payload);
    globalThis.postMessage({ type: "result", requestId, result });
  } catch {
    globalThis.postMessage({ type: "error", requestId, code: "TRIAGE_FAILED" });
  }
});

pipelinePromise.then(
  () => globalThis.postMessage({
    type: "ready",
    protocol: "inbox-island-worker-v1",
    lockedCapabilities: [...lockedCapabilities, "navigator.sendBeacon"],
  }),
  () => globalThis.postMessage({ type: "error", requestId: "startup", code: "WORKER_START_FAILED" }),
);
