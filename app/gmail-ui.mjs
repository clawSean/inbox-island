import {
  announceGmailDisconnect,
  clearAllSnapshots,
  loadLatestGmailSnapshot,
  runMailboxTriage,
} from "./runtime.mjs";
import { deriveViewCounts } from "./view-model.mjs";

const GMAIL_SYNC_TIMEOUT_MS = 120_000;

function gmailErrorMessage(code) {
  const messages = {
    GMAIL_ACCOUNT_CONFIRMATION_REQUIRED: "Choose a Google account before syncing Gmail.",
    GMAIL_ACCOUNT_MISMATCH: "Gmail returned a different account than the one you selected. No messages were fetched or saved. Choose the account again.",
    GMAIL_AUTH_ACCESS_DENIED: "Google did not grant read-only access. Check that this address is on the pilot test-user list, then retry.",
    GMAIL_AUTH_CANCELED: "The Google account chooser was canceled safely. No Gmail messages were read.",
    GMAIL_AUTH_CLIENT_REJECTED: "Google rejected this pilot's OAuth client. Report this build to the developer; retrying will not fix its configuration.",
    GMAIL_AUTH_FAILED: "This browser could not finish Google sign-in. Check the account on Google's consent screen and that it is a pilot test user, then retry.",
    GMAIL_AUTH_REQUIRED: "This Google selection expired or was cleared. Choose the account again before syncing.",
    GMAIL_AUTH_CONFIGURATION_INVALID: "This pilot build's Google sign-in setup is invalid. Report the build to the developer.",
    GMAIL_AUTH_RESPONSE_INVALID: "Google did not confirm exactly the requested read-only Gmail scope. No messages were fetched; report this sign-in failure to the developer.",
    GMAIL_AUTH_STATE_MISMATCH: "Google sign-in returned to the wrong browser request. Nothing was saved; close the chooser and retry.",
    GMAIL_ACCESS_DENIED: "Gmail refused this account's read-only request. Check pilot test-user access and try again.",
    GMAIL_NETWORK_FAILED: "Gmail could not be reached. Check your connection and try again.",
  };
  const safeCode = typeof code === "string" && /^[A-Z0-9_]{1,80}$/u.test(code)
    ? code : "GMAIL_UNKNOWN_ERROR";
  return `${messages[safeCode] ?? "Gmail stopped safely."} Code: ${safeCode}.`;
}

export function createGmailUi({
  gmailPilot,
  paint,
  root,
  setError,
  setLive,
  setRunning,
  showCleared,
  showResults,
  state,
}) {
  if (!gmailPilot) throw new TypeError("GMAIL_UI_PILOT_REQUIRED");
  let preparingAccount = false;
  let preparationEpoch = 0;
  let preparationController = null;

  function clearAccountCheck() {
    state.pendingAccount = undefined;
    root.querySelector("#gmail-account-check").hidden = true;
    root.querySelector("#gmail-expected-email").value = "";
  }

  async function prepareAccount() {
    if (preparingAccount) return;
    preparingAccount = true;
    const epoch = ++preparationEpoch;
    const controller = new AbortController();
    preparationController = controller;
    const button = root.querySelector("#run-button");
    button.disabled = true;
    setError();
    setLive("Opening Google's account chooser.");
    try {
      const account = await gmailPilot.chooseGoogleAccount({ signal: controller.signal });
      if (epoch !== preparationEpoch) return;
      state.pendingAccount = account;
      const input = root.querySelector("#gmail-expected-email");
      input.value = account.email;
      input.readOnly = true;
      root.querySelector("#gmail-account-check").hidden = false;
      root.querySelector("#hero-title").textContent = "Confirm this Google account.";
      root.querySelector("#hero-copy").textContent =
        `${account.email} granted Gmail read-only access. No messages have been listed yet.`;
      root.querySelector("#gmail-account-guidance").textContent =
        "Choose Sync selected account to read the bounded recent slice, or choose another account.";
      setLive(`Confirm ${account.email} before reading recent messages.`);
      input.focus();
    } catch (error) {
      if (epoch !== preparationEpoch) return;
      clearAccountCheck();
      setError(gmailErrorMessage(error?.message));
      setLive("Google account selection stopped safely.");
    } finally {
      if (epoch === preparationEpoch) {
        preparationController = null;
        preparingAccount = false;
        setRunning(false);
      }
    }
  }

  function cancelPreparation() {
    const canceled = preparingAccount || state.pendingAccount !== undefined
      || gmailPilot.hasMemoryToken();
    if (preparationController && !preparationController.signal.aborted) {
      preparationController.abort();
    }
    preparationController = null;
    preparationEpoch += 1;
    preparingAccount = false;
    gmailPilot.forgetMemoryToken();
    clearAccountCheck();
    setRunning(false);
    return canceled;
  }

  async function run() {
    if (preparingAccount) return;
    if (state.running) {
      if (state.abortController && !state.abortController.signal.aborted) {
        state.cancelReason = "manual";
        state.abortController.abort();
        setLive("Canceling Gmail sync.");
      }
      return;
    }
    if (state.pendingAccount === undefined) return prepareAccount();
    const input = root.querySelector("#gmail-expected-email");
    const expectedEmail = input.value.trim();
    if (!input.checkValidity() || expectedEmail === "") {
      setError(gmailErrorMessage("GMAIL_ACCOUNT_CONFIRMATION_REQUIRED"));
      input.focus();
      return;
    }
    const confirmedAccount = Object.freeze({
      email: expectedEmail,
    });
    const runVersion = ++state.runVersion;
    const controller = new AbortController();
    state.abortController = controller;
    state.cancelReason = null;
    const timeout = setTimeout(() => {
      if (!controller.signal.aborted) {
        state.cancelReason = "timeout";
        controller.abort();
      }
    }, GMAIL_SYNC_TIMEOUT_MS);
    setError();
    setRunning(true);
    setLive(`Syncing ${expectedEmail} with read-only access.`);
    try {
      const mailbox = await gmailPilot.connectAndLoad({
        confirmedAccount,
        signal: controller.signal,
      });
      if (runVersion !== state.runVersion) return;
      if (controller.signal.aborted) throw new Error("GMAIL_ABORTED");
      const result = await runMailboxTriage(mailbox, { signal: controller.signal });
      if (controller.signal.aborted) throw new Error("GMAIL_ABORTED");
      if (runVersion !== state.runVersion) return;
      showResults(mailbox, result.output, result.persisted, "gmail");
      clearAccountCheck();
      setLive(`Sync complete. ${state.rows.length} recent Gmail threads sorted locally.`);
    } catch (error) {
      if (runVersion !== state.runVersion) return;
      clearAccountCheck();
      root.querySelector("#hero-title").textContent = state.accountLabel
        ? "Gmail sync paused." : "Gmail not connected.";
      root.querySelector("#hero-copy").textContent =
        "Choose the Google account again before retrying. No new triage was saved.";
      if (["GMAIL_ABORTED", "TRIAGE_ABORTED"].includes(error?.message)) {
        const timedOut = state.cancelReason === "timeout";
        setError(timedOut
          ? "Gmail sync timed out safely. Try again on a steadier connection."
          : "Gmail sync canceled. Your prior saved triage is unchanged.");
        setLive(timedOut ? "Gmail sync timed out safely." : "Gmail sync canceled.");
        return;
      }
      setError(gmailErrorMessage(error?.message));
      setLive("Gmail sync stopped safely.");
    } finally {
      clearTimeout(timeout);
      if (state.abortController === controller) {
        state.abortController = null;
        state.cancelReason = null;
      }
      setRunning(false);
    }
  }

  function paintDisconnected(message) {
    // Storage cleanup can yield long enough for a chooser to return. Invalidate
    // that result again at the destructive operation's commit point.
    cancelPreparation();
    gmailPilot.forgetMemoryToken();
    state.accountLabel = null;
    clearAccountCheck();
    root.querySelector("#connection-label").textContent = "Gmail not connected";
    showCleared(message);
    root.querySelector("#hero-title").textContent = "Gmail disconnected.";
    root.querySelector("#hero-copy").textContent =
      "Inbox Island forgot its in-memory access. Google Account permission may remain until you revoke it in Google settings.";
    setRunning(false);
  }

  async function disconnect() {
    if (state.running) return;
    cancelPreparation();
    setError();
    try {
      await gmailPilot.disconnect();
      await clearAllSnapshots();
      announceGmailDisconnect();
      paintDisconnected("Gmail disconnected and saved local triage cleared.");
    } catch (error) {
      setError(`Disconnect stopped safely: ${error.message}`);
    }
  }

  async function disconnectedElsewhere() {
    state.runVersion += 1;
    if (state.abortController && !state.abortController.signal.aborted) {
      state.cancelReason = "manual";
      state.abortController.abort();
    }
    cancelPreparation();
    paintDisconnected("Gmail was disconnected in another Inbox Island surface.");
    try {
      await gmailPilot.disconnect();
    } catch (error) {
      setError(`Cross-view disconnect cleanup stopped safely: ${error.message}`);
    }
  }

  root.querySelector("#gmail-rechoose-button").addEventListener("click", () => {
    cancelPreparation();
    void prepareAccount();
  });

  async function restore() {
    const version = state.runVersion;
    try {
      const snapshot = await loadLatestGmailSnapshot();
      if (!snapshot || state.running || state.pendingAccount !== undefined
        || version !== state.runVersion) return;
      state.savedCounts = deriveViewCounts(snapshot.results);
      state.accountLabel = snapshot.accountId;
      root.querySelector("#connection-label").textContent = `${snapshot.accountId} · saved locally`;
      root.querySelector("#hero-title").textContent =
        `${state.savedCounts["needs-me"]} saved threads likely need you.`;
      root.querySelector("#hero-copy").textContent =
        "Saved categories survived the restart. Sync Gmail to rebuild message cards; raw Gmail content was never stored.";
      root.querySelector("#empty-state h3").textContent = "Saved summary only";
      root.querySelector("#empty-state p").textContent =
        "Sync Gmail to rebuild message cards. Inbox Island does not retain raw mail.";
      paint();
      setRunning(false);
    } catch (error) {
      setError(`Saved local triage needs a reset: ${error.message}`);
    }
  }

  return Object.freeze({
    cancelPreparation,
    disconnect,
    disconnectedElsewhere,
    restore,
    run,
  });
}
