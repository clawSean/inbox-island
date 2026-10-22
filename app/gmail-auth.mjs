export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const PILOT_OAUTH_CLIENT_ID = "270655843779-er0c77n90u9up4oru4mm3ditkfmkphd0.apps.googleusercontent.com";
export const TOKEN_LEASE_MILLISECONDS = 45 * 60 * 1_000;

const ACCESS_TOKEN = /^[\u0021-\u007e]{1,4096}$/u;
const CLIENT_ID = /^\d{6,32}-[a-z0-9]{16,128}\.apps\.googleusercontent\.com$/u;
const EXTENSION_ID = /^[a-p]{32}$/u;
const fail = (code) => { throw new Error(code); };
const validToken = (value) => typeof value === "string" && ACCESS_TOKEN.test(value);

function randomState(cryptoApi) {
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function classifyIdentityFailure(error) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (/cancel|closed|denied|did not approve|user.*interact/u.test(message)) return "GMAIL_AUTH_ACCESS_DENIED";
  return "GMAIL_AUTH_FAILED";
}

function authUrl({ clientId, redirectUri, state }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    include_granted_scopes: "false",
    prompt: "select_account",
    redirect_uri: redirectUri,
    response_type: "token",
    scope: GMAIL_READONLY_SCOPE,
    state,
  }).toString();
  return url.href;
}

function parseRedirect(value, { redirectUri, state }) {
  let result;
  try { result = new URL(value); } catch { fail("GMAIL_AUTH_RESPONSE_INVALID"); }
  const expected = new URL(redirectUri);
  if (result.origin !== expected.origin || result.pathname !== expected.pathname
    || result.search !== "" || result.username !== "" || result.password !== "") {
    fail("GMAIL_AUTH_RESPONSE_INVALID");
  }
  const values = new URLSearchParams(result.hash.slice(1));
  if (values.get("error")) fail("GMAIL_AUTH_ACCESS_DENIED");
  const expiresIn = Number(values.get("expires_in"));
  const scopes = (values.get("scope") || "").split(/\s+/u).filter(Boolean);
  if (values.get("state") !== state || values.get("token_type")?.toLowerCase() !== "bearer"
    || !validToken(values.get("access_token")) || !Number.isFinite(expiresIn) || expiresIn <= 0
    || scopes.length !== 1 || scopes[0] !== GMAIL_READONLY_SCOPE) {
    fail("GMAIL_AUTH_RESPONSE_INVALID");
  }
  return { expiresIn, token: values.get("access_token") };
}

export function createGmailAuth({ clientId, clock = Date.now, cryptoApi, identityApi, runtimeApi }) {
  if (!CLIENT_ID.test(clientId || "") || !cryptoApi || typeof cryptoApi.getRandomValues !== "function"
    || !identityApi || typeof identityApi.launchWebAuthFlow !== "function"
    || typeof identityApi.getRedirectURL !== "function"
    || !runtimeApi || !EXTENSION_ID.test(runtimeApi.id || "")) {
    throw new TypeError("GMAIL_AUTH_API_INVALID");
  }
  if (typeof clock !== "function") throw new TypeError("GMAIL_AUTH_API_INVALID");

  const redirectUri = identityApi.getRedirectURL("oauth2");
  if (redirectUri !== `https://${runtimeApi.id}.chromiumapp.org/oauth2`) {
    throw new TypeError("GMAIL_AUTH_API_INVALID");
  }
  let memoryCredential = null;
  let expirationTimer = null;
  let authEpoch = 0;
  let nextLeaseId = 0;

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
  function scheduleExpiration(credential) {
    cancelExpirationTimer();
    expirationTimer = globalThis.setTimeout(() => discardCredential(credential),
      Math.max(0, credential.expiresAt - clock()));
    expirationTimer?.unref?.();
  }

  async function connectFromUserGesture() {
    const epoch = ++authEpoch;
    const state = randomState(cryptoApi);
    let completing;
    try {
      completing = identityApi.launchWebAuthFlow({
        interactive: true,
        url: authUrl({ clientId, redirectUri, state }),
      });
    } catch (error) { fail(classifyIdentityFailure(error)); }
    let redirect;
    try { redirect = await completing; }
    catch (error) { fail(classifyIdentityFailure(error)); }
    const parsed = parseRedirect(redirect, { redirectUri, state });
    if (epoch !== authEpoch) fail("GMAIL_AUTH_CANCELED");
    const issuedAt = clock();
    if (!Number.isFinite(issuedAt)) fail("GMAIL_AUTH_CONFIGURATION_INVALID");
    const credential = Object.freeze({
      expiresAt: issuedAt + Math.min(TOKEN_LEASE_MILLISECONDS, parsed.expiresIn * 1_000),
      leaseId: ++nextLeaseId,
      token: parsed.token,
    });
    if (memoryCredential !== null) discardCredential(memoryCredential, { bumpEpoch: false });
    memoryCredential = credential;
    scheduleExpiration(credential);
    return credential;
  }

  async function getCachedAccessToken() {
    if (memoryCredential === null) fail("GMAIL_AUTH_NOT_CONNECTED");
    if (clock() >= memoryCredential.expiresAt) {
      const expired = memoryCredential;
      discardCredential(expired);
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
    if (clearMatchingMemory && matched) discardCredential(credential);
    return matched;
  }
  async function removeKnownToken() {
    if (memoryCredential === null) return false;
    return removeAccessToken(memoryCredential);
  }
  function invalidatePendingAuth() { authEpoch += 1; }
  function forgetMemoryToken() {
    const forgotten = memoryCredential !== null;
    if (memoryCredential !== null) discardCredential(memoryCredential, { bumpEpoch: false });
    authEpoch += 1;
    return forgotten;
  }
  function hasMemoryToken() {
    if (memoryCredential === null) return false;
    const now = clock();
    if (!Number.isFinite(now) || now >= memoryCredential.expiresAt) {
      const expired = memoryCredential;
      discardCredential(expired);
      return false;
    }
    return true;
  }
  function ownsCredential(credential) { return memoryCredential === credential && hasMemoryToken(); }
  function credentialForLease(leaseId) {
    return Number.isSafeInteger(leaseId) && hasMemoryToken() && memoryCredential.leaseId === leaseId
      ? memoryCredential : null;
  }
  async function disconnect() {
    const forgottenFromMemory = await removeKnownToken();
    invalidatePendingAuth();
    return Object.freeze({ connectedInMemory: false, forgottenFromMemory, googleGrantRevoked: false });
  }

  return Object.freeze({
    connectFromUserGesture, credentialForLease, disconnect, forgetMemoryToken,
    getCachedAccessToken, hasMemoryToken, invalidatePendingAuth, ownsCredential,
    removeAccessToken, removeCachedAccessToken: removeKnownToken,
  });
}
