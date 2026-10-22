import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import {
  assertCanceledAuthOutcome,
  assertChooserPromiseContract,
  assertExpectedClientHash,
  assertCompactSurfaceBoundary,
  assertPendingAuthOutcome,
  assertReceiptObjectKeysSafe,
  captureOwnedProcessSet,
  classifyProviderNavigation,
  createIdempotentCleanup,
  createSignalCleanupCoordinator,
  deriveExtensionId,
  inspectOAuthLaunchUrl,
  parseCli,
  parseProcessTable,
  receiptFailure,
  sanitizeError,
  updateProviderEvidence,
  verifiedRecordedProcesses,
  writeReceipt,
} from "../scripts/run-native-portable-proof.mjs";

const extensionId = "jeemdbgakejlmmmbngpihndfkjiddbhl";
const redirectUri = `https://${extensionId}.chromiumapp.org/oauth2`;
const clientId = "270655843779-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com";
const state = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789_-";

function authorizationUrl(overrides = {}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const values = {
    access_type: "online",
    client_id: clientId,
    include_granted_scopes: "false",
    prompt: "select_account",
    redirect_uri: redirectUri,
    response_type: "token",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url;
}

function processRecord(pid, ppid, command, started = "Fri Oct 9 12:34:56 2026") {
  return Object.freeze({
    pid,
    ppid,
    started,
    command,
    commandSha256: crypto.createHash("sha256").update(command).digest("hex"),
  });
}

test("portable proof CLI defaults to sequential Arc and Dia and supports one browser", () => {
  assert.deepEqual(parseCli([]).browsers, ["arc", "dia"]);
  assert.deepEqual(parseCli(["--browser", "arc", "--preflight-only"]), {
    browsers: ["arc"],
    preflightOnly: true,
    receiptDirectory: "/Users/Sean/projects/inbox-island/artifacts",
    help: false,
  });
  assert.throws(() => parseCli(["--browser", "chrome"]), /arc, dia, or all/u);
  assert.throws(() => parseCli(["--expected-client-sha256", "a".repeat(64)]), /Unknown argument/u);
});

test("manifest key derives the permanent extension ID", async () => {
  const manifest = JSON.parse(await readFile(
    new URL("../extension/manifest.json", import.meta.url),
    "utf8",
  ));
  assert.equal(deriveExtensionId(manifest.key), extensionId);
});

test("source-pinned client hash is required independently and must match", () => {
  const pinned = crypto.createHash("sha256").update(clientId).digest("hex");
  assert.equal(assertExpectedClientHash(clientId, pinned), pinned);
  assert.throws(() => assertExpectedClientHash(clientId, null), (error) =>
    error.code === "EXPECTED_CLIENT_HASH_NOT_FROZEN");
  assert.throws(() => assertExpectedClientHash(clientId, "PENDING_PUBLIC_WEB_CLIENT_ID_SHA256"),
    (error) => error.code === "EXPECTED_CLIENT_HASH_NOT_FROZEN");
  assert.throws(() => assertExpectedClientHash(clientId, "0".repeat(64)), (error) =>
    error.code === "EXPECTED_CLIENT_HASH_MISMATCH");
});

test("OAuth launch audit proves the exact contract without retaining client or state", () => {
  const proof = inspectOAuthLaunchUrl(authorizationUrl().href, { clientId, redirectUri });
  assert.equal(proof.endpoint, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(proof.redirectUri, redirectUri);
  assert.equal(proof.prompt, "select_account");
  assert.equal(proof.scope, "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(proof.state.length, state.length);
  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, new RegExp(clientId.replaceAll(".", "\\."), "u"));
  assert.doesNotMatch(serialized, new RegExp(state, "u"));
});

test("OAuth launch audit rejects drift, extra parameters, and duplicate state", () => {
  assert.throws(() => inspectOAuthLaunchUrl(
    authorizationUrl({ scope: "openid" }).href,
    { clientId, redirectUri },
  ), /OAuth launch boundary/u);
  const extra = authorizationUrl();
  extra.searchParams.set("login_hint", "person@example.test");
  assert.throws(() => inspectOAuthLaunchUrl(extra.href, { clientId, redirectUri }),
    /parameters are not exact/u);
  const duplicate = authorizationUrl();
  duplicate.searchParams.append("state", state);
  assert.throws(() => inspectOAuthLaunchUrl(duplicate.href, { clientId, redirectUri }),
    /parameters are not exact/u);
});

test("provider navigation accepts only exact Google sign-in paths and safe statuses", () => {
  assert.deepEqual(classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/identifier?continue=redacted",
    status: 200,
  }), {
    accepted: true,
    code: "OAUTH_PROVIDER_ACCEPTED",
    providerSurface: "google-signin",
    status: 200,
  });
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com.evil.test/v3/signin/identifier",
    status: 200,
  }).code, "OAUTH_PROVIDER_ORIGIN_INVALID");
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com:444/v3/signin/identifier",
    status: 200,
  }).code, "OAUTH_PROVIDER_ORIGIN_INVALID");
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    status: 200,
  }).code, "OAUTH_PROVIDER_PATH_INVALID");
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/identifier",
    status: 500,
  }).code, "OAUTH_PROVIDER_STATUS_INVALID");
});

test("provider redirects are transitional and only a final HTTP 200 Document is accepted", () => {
  assert.deepEqual(classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/identifier",
    status: 302,
  }), {
    accepted: false,
    code: "OAUTH_PROVIDER_TRANSITION",
    status: 302,
  });
  assert.deepEqual(classifyProviderNavigation({
    url: "https://accounts.google.com/AccountChooser",
    status: 200,
  }), {
    accepted: true,
    code: "OAUTH_PROVIDER_ACCEPTED",
    providerSurface: "google-account-chooser",
    status: 200,
  });
});

test("provider navigation rejects OAuth error pages even with a 200 response", () => {
  const transition = classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/identifier",
    status: 302,
  });
  const finalError = classifyProviderNavigation({
    url: "https://accounts.google.com/signin/oauth/error",
    status: 200,
  });
  assert.equal(transition.code, "OAUTH_PROVIDER_TRANSITION");
  assert.equal(transition.accepted, false);
  assert.equal(finalError.code, "OAUTH_PROVIDER_ERROR_PAGE");
  assert.equal(finalError.accepted, false);
  const afterTransition = updateProviderEvidence(null, transition);
  const afterError = updateProviderEvidence(afterTransition, finalError);
  assert.equal(afterTransition.accepted, null);
  assert.equal(afterTransition.errorCode, null);
  assert.equal(afterError.accepted, null);
  assert.equal(afterError.errorCode, "OAUTH_PROVIDER_ERROR_PAGE");
  assert.equal(afterError.responseCount, 2);
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/identifier?error=access_denied",
    status: 200,
  }).code, "OAUTH_PROVIDER_ERROR_PAGE");
  assert.equal(classifyProviderNavigation({
    url: "https://accounts.google.com/signin/oauth/error",
    status: 200,
  }).code, "OAUTH_PROVIDER_ERROR_PAGE");
});

test("provider evidence persists only a fixed surface enum, never encoded path segments", () => {
  const result = classifyProviderNavigation({
    url: "https://accounts.google.com/v3/signin/person%40example.test%2Fprivate",
    status: 200,
  });
  assert.equal(result.providerSurface, "google-signin");
  assert.doesNotMatch(JSON.stringify(result), /person|example|%40|private/iu);
});

test("chooser cancellation requires launchWebAuthFlow rejection and fails resolution or pending", () => {
  assert.deepEqual(assertChooserPromiseContract({
    argumentCount: 1,
    interactive: true,
    thenable: true,
  }), { argumentCount: 1, interactive: true, thenable: true });
  assert.throws(() => assertChooserPromiseContract({
    argumentCount: 2,
    interactive: true,
    thenable: false,
  }), (error) => error.code === "CHOOSER_PROMISE_CONTRACT_INVALID");
  assert.deepEqual(assertPendingAuthOutcome({ status: "pending" }), { status: "pending" });
  assert.throws(() => assertPendingAuthOutcome({ status: "rejected" }), (error) =>
    error.code === "CHOOSER_SETTLED_BEFORE_CANCEL");
  assert.deepEqual(assertCanceledAuthOutcome({ status: "rejected" }), { status: "rejected" });
  assert.throws(() => assertCanceledAuthOutcome({ status: "resolved" }), (error) =>
    error.code === "CHOOSER_CANCEL_RESOLVED");
  assert.throws(() => assertCanceledAuthOutcome({ status: "pending" }), (error) =>
    error.code === "CHOOSER_CANCEL_OUTCOME_MISSING");
});

test("receipt-safe errors redact paths, ports, process IDs, UUIDs, auth, tokens, and accounts", () => {
  const unsafe = new Error([
    `https://127.0.0.1:9222/callback#access_token=secret&state=${state}`,
    clientId,
    "person@example.test",
    "/Users/Sean/private/file.txt",
    "/var/folders/aa/private",
    "pid=12345",
    "123e4567-e89b-42d3-a456-426614174000",
    "Authorization: Bearer top-secret",
    "Cookie: SID=private",
    "ws://localhost:9333/devtools/browser/private",
  ].join(" "));
  const safe = sanitizeError(unsafe);
  for (const forbidden of [
    "secret", state, clientId, "person@example.test", "/Users/Sean", "/var/folders",
    "12345", "123e4567-e89b-42d3-a456-426614174000", "top-secret", "SID=private",
    "localhost:9333",
  ]) assert.doesNotMatch(safe, new RegExp(forbidden.replaceAll(".", "\\."), "u"));
  assert.match(safe, /<redacted/u);
});

test("native proof requires one honest full-page control", () => {
  assert.deepEqual(assertCompactSurfaceBoundary({
    compactAction: null,
    fullPageAction: "✦ Open full triage",
  }), { compactControlVisible: false, fullPageControlVisible: true });
  assert.throws(() => assertCompactSurfaceBoundary({
    compactAction: "Open side panel",
    fullPageAction: "✦ Open full triage",
  }), /Portable launcher controls are incorrect/u);
});

test("process table parsing and ownership require exact root profile and owner tokens", () => {
  const profile = "/tmp/inbox-island-proof/disposable-profile";
  const runId = "123e4567-e89b-42d3-a456-426614174000";
  const executable = "/Applications/Arc.app/Contents/MacOS/Arc";
  const root = processRecord(100, 10,
    `${executable} --user-data-dir=${profile} --inbox-island-native-proof-owner=${runId}`);
  const child = processRecord(101, 100,
    "/Applications/Arc.app/Contents/Frameworks/Arc Helper.app/Contents/MacOS/Arc Helper --type=renderer");
  const substringOnly = processRecord(102, 10,
    `/usr/bin/python note=--user-data-dir=${profile}-other`);
  const exactForeign = processRecord(103, 10, `/Applications/Other --user-data-dir=${profile}`);
  const result = captureOwnedProcessSet([root, child, substringOnly, exactForeign], {
    config: { executable, applicationContents: "/Applications/Arc.app/Contents/" },
    profile,
    rootRecord: root,
    runId,
  });
  assert.equal(result.rootValid, true);
  assert.deepEqual(result.owned.map(({ pid }) => pid), [100, 101]);
  assert.deepEqual(result.unknownProfile.map(({ pid }) => pid), [103]);

  const parsed = parseProcessTable(
    `  100   10 Fri Oct  9 12:34:56 2026 ${root.command}\n`,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pid, 100);
});

test("PID reuse and mutated identities are never treated as verified owned processes", () => {
  const original = processRecord(100, 10, "/Applications/Dia.app/Contents/MacOS/Dia --flag", "first");
  const records = new Map([[100, original]]);
  assert.equal(verifiedRecordedProcesses([
    processRecord(100, 10, original.command, "second"),
  ], records).length, 0);
  assert.equal(verifiedRecordedProcesses([
    processRecord(100, 10, `${original.command} --changed`, "first"),
  ], records).length, 0);
});

test("idempotent cleanup reuses one promise across interruption and finally", async () => {
  let calls = 0;
  let release;
  const cleanup = createIdempotentCleanup(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });
  const first = cleanup();
  const second = cleanup();
  assert.strictEqual(first, second);
  await Promise.resolve();
  release("done");
  assert.equal(await first, "done");
  assert.equal(calls, 1);
});

test("signal coordinator reuses cleanup and exits once for repeated signals", async () => {
  let cleanupCalls = 0;
  const exitCodes = [];
  const coordinator = createSignalCleanupCoordinator({
    exit: (code) => { exitCodes.push(code); },
  });
  coordinator.register(createIdempotentCleanup(async () => { cleanupCalls += 1; }));
  const first = coordinator.handle("SIGTERM");
  const second = coordinator.handle("SIGINT");
  assert.strictEqual(first, second);
  await first;
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(exitCodes, [143]);
});

test("persisted failures contain only allowlisted phase and code", () => {
  assert.deepEqual(receiptFailure(Object.assign(new Error("/Users/Sean/private"), {
    code: "CHOOSER_CANCEL_RESOLVED",
  }), "oauth-cancel"), {
    phase: "oauth-cancel",
    code: "CHOOSER_CANCEL_RESOLVED",
  });
  assert.deepEqual(receiptFailure(new Error("Bearer secret"), "unknown-phase"), {
    phase: "complete",
    code: "NATIVE_PROOF_FAILED",
  });
});

test("receipt object-key guard recursively rejects secret and header key variants", () => {
  const forbidden = [
    "access_token",
    "Access-Token",
    "client.secret",
    "Refresh Token",
    "IDToken",
    "AUTHORIZATION",
    "Set_Cookie",
    "coo-kie",
  ];
  for (const key of forbidden) {
    assert.throws(() => assertReceiptObjectKeysSafe({ nested: [{ [key]: "redacted" }] }),
      (error) => error.code === "RECEIPT_SANITIZATION_FAILED");
  }
  assert.equal(assertReceiptObjectKeysSafe({ authorizationEndpoint: "fixed-enum", status: 200 }), true);
});

test("receipt writes are no-clobber and reject sensitive path content", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inbox-island-receipt-test-"));
  try {
    const receiptPath = path.join(directory, "proof.json");
    await writeReceipt(receiptPath, { verdict: "PASS", phase: "complete" });
    assert.match(await readFile(receiptPath, "utf8"), /"PASS"/u);
    await assert.rejects(() => writeReceipt(receiptPath, { verdict: "PASS" }), (error) =>
      error.code === "RECEIPT_ALREADY_EXISTS");
    await assert.rejects(() => writeReceipt(path.join(directory, "unsafe.json"), {
      verdict: "FAIL",
      failure: "/Users/Sean/private",
    }), (error) => error.code === "RECEIPT_SANITIZATION_FAILED");
    await assert.rejects(() => writeReceipt(path.join(directory, "secret-key.json"), {
      verdict: "FAIL",
      nested: { "Set-Cookie": "private" },
    }), (error) => error.code === "RECEIPT_SANITIZATION_FAILED");
    await assert.rejects(() => writeReceipt(path.join(directory, "serialized-key.json"), {
      verdict: "FAIL",
      evidence: {
        toJSON() {
          return { "Access.Token": "private" };
        },
      },
    }), (error) => error.code === "RECEIPT_SANITIZATION_FAILED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
