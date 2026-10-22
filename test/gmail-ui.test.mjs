import assert from "node:assert/strict";
import test from "node:test";
import { createGmailUi } from "../app/gmail-ui.mjs";

function uiHarness({ choose, connect } = {}) {
  const nodes = new Map();
  for (const selector of ["#run-button", "#gmail-expected-email", "#gmail-account-check",
    "#hero-title", "#hero-copy", "#connection-label", "#gmail-account-guidance",
    "#gmail-rechoose-button"]) {
    const listeners = new Map();
    nodes.set(selector, {
      addEventListener(type, listener) { listeners.set(type, listener); },
      click() { return listeners.get("click")?.(); },
      textContent: "",
      hidden: false,
      disabled: false,
      readOnly: false,
      value: "",
      focus() {},
      checkValidity() { return /^[^@]+@[^@]+\.[^@]+$/u.test(this.value); },
    });
  }
  const root = { querySelector: (selector) => nodes.get(selector) };
  const state = {
    running: false,
    pendingAccount: undefined,
    runVersion: 0,
    abortController: null,
    cancelReason: null,
    accountLabel: null,
    rows: [],
  };
  const connections = [];
  const errors = [];
  const live = [];
  let chooserCalls = 0;
  let memoryToken = false;
  const gmailPilot = {
    async chooseGoogleAccount(options) {
      chooserCalls += 1;
      const account = choose
        ? await choose(options, chooserCalls)
        : { email: "pilot@example.test" };
      if (options?.signal?.aborted) throw new Error("GMAIL_ABORTED");
      memoryToken = true;
      return account;
    },
    async connectAndLoad(options) {
      connections.push(options.confirmedAccount);
      try {
        if (connect) return await connect(options, connections.length);
        throw new Error("GMAIL_ACCOUNT_MISMATCH");
      } finally {
        memoryToken = false;
      }
    },
    async disconnect() { memoryToken = false; },
    forgetMemoryToken() {
      const forgotten = memoryToken;
      memoryToken = false;
      return forgotten;
    },
    hasMemoryToken: () => memoryToken,
  };
  const ui = createGmailUi({
    gmailPilot,
    root,
    state,
    paint() {},
    showCleared() {},
    showResults() { throw new Error("must not show unverified mail"); },
    setError: (message = "") => { errors.push(message); },
    setLive: (message) => { live.push(message); },
    setRunning: (running) => { state.running = running; },
  });
  return { chooserCalls: () => chooserCalls, connections, errors, live, nodes, state, ui };
}

test("explicit Google chooser needs a visible second-click confirmation before mailbox access", async () => {
  const harness = uiHarness();
  await harness.ui.run();
  assert.equal(harness.chooserCalls(), 1);
  assert.deepEqual(harness.connections, [], "selection may read profile but not list messages");
  assert.equal(harness.nodes.get("#gmail-expected-email").value, "pilot@example.test");
  assert.equal(harness.nodes.get("#gmail-expected-email").readOnly, true);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, false);
  assert.match(harness.nodes.get("#gmail-account-guidance").textContent, /Sync selected account/u);
  await harness.ui.run();
  assert.deepEqual(harness.connections, [{ email: "pilot@example.test" }]);
  assert.match(harness.errors.at(-1), /different account/u);
  assert.equal(harness.state.pendingAccount, undefined);
});

test("chooser denial stops before mailbox access with an actionable code", async () => {
  const harness = uiHarness({
    choose: async () => { throw new Error("GMAIL_AUTH_ACCESS_DENIED"); },
  });
  await harness.ui.run();
  assert.equal(harness.chooserCalls(), 1);
  assert.deepEqual(harness.connections, []);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, true);
  assert.match(harness.errors.at(-1), /pilot test-user list/u);
  assert.match(harness.errors.at(-1), /GMAIL_AUTH_ACCESS_DENIED/u);
});

test("clear or disconnect cancellation cannot resurrect a late chooser", async () => {
  let finish;
  let chooserSignal;
  const harness = uiHarness({
    choose: ({ signal }) => new Promise((resolve) => {
      chooserSignal = signal;
      finish = () => resolve({ email: "late@example.test" });
    }),
  });
  const preparing = harness.ui.run();
  await Promise.resolve();
  assert.equal(harness.ui.cancelPreparation(), true);
  assert.equal(chooserSignal.aborted, true);
  finish();
  await preparing;
  assert.deepEqual(harness.connections, []);
  assert.equal(harness.state.pendingAccount, undefined);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, true);
  assert.equal(harness.ui.cancelPreparation(), false);
});

test("Choose another account forgets the prior token and opens a fresh chooser", async () => {
  const harness = uiHarness({
    choose: async (_options, call) => ({ email: call === 1
      ? "first@example.test" : "second@example.test" }),
  });
  await harness.ui.run();
  assert.equal(harness.nodes.get("#gmail-expected-email").value, "first@example.test");
  harness.nodes.get("#gmail-rechoose-button").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.chooserCalls(), 2);
  assert.equal(harness.nodes.get("#gmail-expected-email").value, "second@example.test");
  assert.equal(harness.state.pendingAccount.email, "second@example.test");
});

test("access failure resets confirmation so retry reopens the chooser", async () => {
  const harness = uiHarness({
    connect: async () => { throw new Error("GMAIL_ACCESS_DENIED"); },
  });
  await harness.ui.run();
  await harness.ui.run();
  assert.equal(harness.state.pendingAccount, undefined);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, true);
  assert.match(harness.errors.at(-1), /pilot test-user access/u);
  assert.equal(harness.chooserCalls(), 1);
  await harness.ui.run();
  assert.equal(harness.chooserCalls(), 2);
  assert.equal(harness.connections.length, 1);
});

test("cancel during Gmail sync clears the selected checkpoint before retry", async () => {
  const harness = uiHarness({
    connect: ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("GMAIL_ABORTED")), { once: true });
    }),
  });
  await harness.ui.run();
  const syncing = harness.ui.run();
  assert.equal(harness.connections.length, 1);
  await harness.ui.run();
  await syncing;
  assert.equal(harness.state.pendingAccount, undefined);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, true);
  assert.match(harness.errors.at(-1), /sync canceled/u);
  await harness.ui.run();
  assert.equal(harness.chooserCalls(), 2);
  assert.equal(harness.connections.length, 1);
});

test("disconnect from another surface aborts an active sync before clearing UI state", async () => {
  let activeSignal;
  const harness = uiHarness({
    connect: ({ signal }) => new Promise((_, reject) => {
      activeSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("GMAIL_ABORTED")), { once: true });
    }),
  });
  await harness.ui.run();
  const syncing = harness.ui.run();
  assert.equal(activeSignal.aborted, false);
  await harness.ui.disconnectedElsewhere();
  assert.equal(activeSignal.aborted, true);
  await syncing;
  assert.equal(harness.state.running, false);
  assert.equal(harness.state.pendingAccount, undefined);
  assert.equal(harness.nodes.get("#gmail-account-check").hidden, true);
});
