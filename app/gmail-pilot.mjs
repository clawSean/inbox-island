import { createGmailApiClient, GMAIL_PILOT_LIMITS } from "./gmail-api.mjs";
import { createGmailAuth, PILOT_OAUTH_CLIENT_ID } from "./gmail-auth.mjs";

const DEFAULT_MESSAGE_LIMIT = 100;

function assertSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function") {
    throw new TypeError("GMAIL_ABORT_SIGNAL_INVALID");
  }
  if (signal.aborted) throw new Error("GMAIL_ABORTED");
}

async function connectWithSignal(auth, signal) {
  assertSignal(signal);
  if (signal === undefined) return auth.connectFromUserGesture();
  let rejectAbort;
  const abort = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error("GMAIL_ABORTED"));
  signal.addEventListener("abort", onAbort, { once: true });
  let connecting;
  try {
    connecting = auth.connectFromUserGesture();
    return await Promise.race([connecting, abort]);
  } catch (error) {
    if (error?.message === "GMAIL_ABORTED") {
      auth.invalidatePendingAuth();
      connecting?.then(
        (credential) => auth.removeAccessToken(credential),
        () => {},
      ).catch(() => {});
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function isGmailPilotRuntime(scope = globalThis) {
  return scope.location?.protocol === "chrome-extension:"
    && typeof scope.chrome?.identity?.launchWebAuthFlow === "function"
    && typeof scope.chrome?.identity?.getRedirectURL === "function"
    && typeof scope.chrome?.runtime?.id === "string";
}

export function createGmailPilot(scope = globalThis, options = {}) {
  if (!isGmailPilotRuntime(scope) || typeof scope.fetch !== "function") {
    throw new Error("GMAIL_PILOT_RUNTIME_UNAVAILABLE");
  }
  const auth = createGmailAuth({
    clientId: options.clientId ?? PILOT_OAUTH_CLIENT_ID,
    clock: options.clock,
    cryptoApi: scope.crypto,
    identityApi: scope.chrome.identity,
    runtimeApi: scope.chrome.runtime,
  });
  let pendingSelection = null;

  function apiFor(credential) {
    return createGmailApiClient({
      fetchImpl: (url, init) => {
        if (!auth.ownsCredential(credential)) throw new Error("GMAIL_AUTH_REQUIRED");
        return scope.fetch.call(scope, url, init);
      },
      getAccessToken: async () => {
        if (!auth.ownsCredential(credential)) throw new Error("GMAIL_AUTH_REQUIRED");
        return credential;
      },
      onTokenRejected: auth.removeAccessToken,
    });
  }

  async function chooseGoogleAccount({ signal } = {}) {
    assertSignal(signal);
    if (hasMemoryToken()) throw new Error("GMAIL_SYNC_IN_PROGRESS");
    let selectedToken;
    try {
      selectedToken = await connectWithSignal(auth, signal);
      const profile = await apiFor(selectedToken).getProfile({ signal });
      if (!auth.ownsCredential(selectedToken)) throw new Error("GMAIL_AUTH_CANCELED");
      const account = Object.freeze({ email: profile.emailAddress });
      pendingSelection = Object.freeze({ account, leaseId: selectedToken.leaseId });
      return account;
    } catch (error) {
      if (selectedToken !== undefined) {
        await auth.removeAccessToken(selectedToken);
      }
      throw error;
    }
  }

  async function connectAndLoad({ confirmedAccount, limit = DEFAULT_MESSAGE_LIMIT, signal } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > GMAIL_PILOT_LIMITS.maxMessages) {
      throw new RangeError("GMAIL_PILOT_LIMIT_INVALID");
    }
    assertSignal(signal);
    if (!confirmedAccount || typeof confirmedAccount.email !== "string"
      || confirmedAccount.email.trim() === "" || confirmedAccount.email.length > 320) {
      throw new Error("GMAIL_ACCOUNT_CONFIRMATION_REQUIRED");
    }
    const selection = pendingSelection;
    const credential = selection ? auth.credentialForLease(selection.leaseId) : null;
    if (!selection || !credential) {
      pendingSelection = null;
      throw new Error("GMAIL_ACCOUNT_CONFIRMATION_REQUIRED");
    }
    if (selection.account.email.toLowerCase() !== confirmedAccount.email.toLowerCase()) {
      pendingSelection = null;
      await auth.removeAccessToken(credential);
      throw new Error("GMAIL_ACCOUNT_CONFIRMATION_REQUIRED");
    }
    pendingSelection = null;
    try {
      return await apiFor(credential).loadRecentMailbox({
        expectedEmail: confirmedAccount.email,
        limit,
        signal,
      });
    } catch (error) {
      throw error;
    } finally {
      await auth.removeAccessToken(credential);
    }
  }

  async function disconnect() {
    pendingSelection = null;
    return auth.disconnect();
  }

  function forgetMemoryToken() {
    pendingSelection = null;
    return auth.forgetMemoryToken();
  }

  function hasMemoryToken() {
    const available = auth.hasMemoryToken();
    if (!available) pendingSelection = null;
    return available;
  }

  return Object.freeze({
    chooseGoogleAccount,
    connectAndLoad,
    disconnect,
    forgetMemoryToken,
    hasMemoryToken,
  });
}

export { DEFAULT_MESSAGE_LIMIT };
