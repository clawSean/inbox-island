export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const TOKEN_LEASE_MILLISECONDS = 45 * 60 * 1_000;

const ACCESS_TOKEN = /^[\u0021-\u007e]{1,4096}$/u;
const fail = (code) => { throw new Error(code); };
const validToken = (value) => typeof value === "string" && ACCESS_TOKEN.test(value);

function classifyIdentityFailure(error) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (/cancel|closed|denied|did not approve|user.*interact/u.test(message)) {
    return "GMAIL_AUTH_ACCESS_DENIED";
  }
  return "GMAIL_AUTH_FAILED";
}

function tokenFromResult(result) {
  if (!result || typeof result !== "object" || !validToken(result.token)
    || !Array.isArray(result.grantedScopes)
    || result.grantedScopes.length !== 1
    || result.grantedScopes[0] !== GMAIL_READONLY_SCOPE) {
    fail("GMAIL_AUTH_RESPONSE_INVALID");
  }
  return result.token;
}

export function createGmailAuth({ clock = Date.now, identityApi }) {
  if (typeof clock !== "function" || !identityApi
    || typeof identityApi.getAuthToken !== "function"
    || typeof identityApi.removeCachedAuthToken !== "function"
    || typeof identityApi.clearAllCachedAuthTokens !== "function") {
    throw new TypeError("GMAIL_AUTH_API_INVALID");
  }

  let memoryCredential = null;
  let expirationTimer = null;
  let authEpoch = 0;
  let nextLeaseId = 0;
  let cacheCleanupFailed = false;

  function cancelExpirationTimer() {
    if (expirationTimer !== null) globalThis.clearTimeout(expirationTimer);
    expirationTimer = null;
  }

  function discardCredential(expected, { bumpEpoch = true } = {}) {
    if (memoryCredential !== expected) return false;
    cancelExpirationTimer();
    memoryCredential = null;
    if (bumpEpoch) authEpoch += 1;
    return true;
  }

  async function clearBrowserToken(token) {
    try {
      await identityApi.removeCachedAuthToken({ token });
    } catch {
      cacheCleanupFailed = true;
      fail("GMAIL_AUTH_CACHE_CLEAR_FAILED");
    }
  }

  function scheduleExpiration(credential) {
    cancelExpirationTimer();
    expirationTimer = globalThis.setTimeout(() => {
      if (!discardCredential(credential)) return;
      void clearBrowserToken(credential.token).catch(() => {});
    }, Math.max(0, credential.expiresAt - clock()));
    expirationTimer?.unref?.();
  }

  async function connectFromUserGesture() {
    if (cacheCleanupFailed) fail("GMAIL_AUTH_CACHE_CLEAR_FAILED");
    const epoch = ++authEpoch;
    let completing;
    try {
      completing = identityApi.getAuthToken({
        enableGranularPermissions: true,
        interactive: true,
        scopes: [GMAIL_READONLY_SCOPE],
      });
    } catch (error) {
      fail(classifyIdentityFailure(error));
    }
    let result;
    try {
      result = await completing;
    } catch (error) {
      fail(classifyIdentityFailure(error));
    }
    const token = tokenFromResult(result);
    if (epoch !== authEpoch) {
      if (memoryCredential?.token !== token) await clearBrowserToken(token);
      fail("GMAIL_AUTH_CANCELED");
    }
    const issuedAt = clock();
    if (!Number.isFinite(issuedAt)) fail("GMAIL_AUTH_CONFIGURATION_INVALID");
    const credential = Object.freeze({
      expiresAt: issuedAt + TOKEN_LEASE_MILLISECONDS,
      leaseId: ++nextLeaseId,
      token,
    });
    if (memoryCredential !== null) await removeAccessToken(memoryCredential);
    memoryCredential = credential;
    scheduleExpiration(credential);
    return credential;
  }

  async function getCachedAccessToken() {
    if (cacheCleanupFailed) fail("GMAIL_AUTH_CACHE_CLEAR_FAILED");
    if (memoryCredential === null) fail("GMAIL_AUTH_NOT_CONNECTED");
    if (clock() >= memoryCredential.expiresAt) {
      const expired = memoryCredential;
      discardCredential(expired);
      await clearBrowserToken(expired.token);
      fail("GMAIL_AUTH_EXPIRED");
    }
    return memoryCredential;
  }

  async function removeAccessToken(credential, { clearMatchingMemory = true } = {}) {
    if (!credential || typeof credential !== "object" || !validToken(credential.token)
      || !Number.isSafeInteger(credential.leaseId) || !Number.isFinite(credential.expiresAt)) {
      fail("GMAIL_AUTH_RESPONSE_INVALID");
    }
    const matched = memoryCredential === credential;
    if (!matched && memoryCredential?.token === credential.token) return false;
    if (clearMatchingMemory && matched) discardCredential(credential);
    await clearBrowserToken(credential.token);
    return matched;
  }

  async function removeKnownToken() {
    if (memoryCredential === null) return false;
    return removeAccessToken(memoryCredential);
  }

  function invalidatePendingAuth() { authEpoch += 1; }

  function forgetMemoryToken() {
    if (memoryCredential === null) {
      authEpoch += 1;
      return false;
    }
    const forgotten = memoryCredential;
    discardCredential(forgotten, { bumpEpoch: false });
    authEpoch += 1;
    void clearBrowserToken(forgotten.token).catch(() => {});
    return true;
  }

  function hasMemoryToken() {
    if (cacheCleanupFailed || memoryCredential === null) return false;
    const now = clock();
    if (!Number.isFinite(now) || now >= memoryCredential.expiresAt) {
      forgetMemoryToken();
      return false;
    }
    return true;
  }

  function ownsCredential(credential) {
    return memoryCredential === credential && hasMemoryToken();
  }

  function credentialForLease(leaseId) {
    return Number.isSafeInteger(leaseId) && hasMemoryToken()
      && memoryCredential.leaseId === leaseId ? memoryCredential : null;
  }

  async function disconnect() {
    const forgotten = memoryCredential;
    if (forgotten === null) invalidatePendingAuth();
    else {
      discardCredential(forgotten);
      try { await clearBrowserToken(forgotten.token); } catch {}
    }
    try {
      await identityApi.clearAllCachedAuthTokens();
      cacheCleanupFailed = false;
    } catch {
      cacheCleanupFailed = true;
      fail("GMAIL_AUTH_CACHE_CLEAR_FAILED");
    }
    return Object.freeze({
      browserAuthorizationCleared: true,
      connectedInMemory: false,
      forgottenFromMemory: forgotten !== null,
      googleGrantRevoked: false,
    });
  }

  return Object.freeze({
    connectFromUserGesture, credentialForLease, disconnect, forgetMemoryToken,
    getCachedAccessToken, hasMemoryToken, invalidatePendingAuth, ownsCredential,
    removeAccessToken, removeCachedAccessToken: removeKnownToken,
  });
}
