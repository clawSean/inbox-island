#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import {
  access,
  chmod,
  cp,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "extension", "build");
const identityPath = path.join(projectRoot, "extension", "identity.json");
const validatorPath = path.join(projectRoot, "extension", "scripts", "validate.mjs");
const expected = Object.freeze({
  extensionId: "jeemdbgakejlmmmbngpihndfkjiddbhl",
  version: "0.4.9",
  popupPath: "app/popup.html",
  fullPagePath: "app/index.html?surface=tab",
  redirectUri: "https://jeemdbgakejlmmmbngpihndfkjiddbhl.chromiumapp.org/oauth2",
  gmailScope: "https://www.googleapis.com/auth/gmail.readonly",
  oauthEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  // Release expectation: fill this independently alongside the public Web client ID.
  // Never derive it from extension/identity.json inside this harness.
  clientIdSha256: "946f3550c42c4b0e25266a95a3228b036bffa92e62d6a431187ecc53df4e4d1a",
});
const browserConfigs = Object.freeze({
  arc: Object.freeze({
    id: "arc",
    label: "Arc",
    processName: "Arc",
    executable: "/Applications/Arc.app/Contents/MacOS/Arc",
    applicationContents: "/Applications/Arc.app/Contents/",
    infoPlist: "/Applications/Arc.app/Contents/Info.plist",
    expectedBundleId: "company.thebrowser.Browser",
  }),
  dia: Object.freeze({
    id: "dia",
    label: "Dia",
    processName: "Dia",
    executable: "/Applications/Dia.app/Contents/MacOS/Dia",
    applicationContents: "/Applications/Dia.app/Contents/",
    infoPlist: "/Applications/Dia.app/Contents/Info.plist",
    expectedBundleId: "company.thebrowser.dia",
  }),
});
const webClientIdPattern = /^\d{6,32}-[a-z0-9]{16,128}\.apps\.googleusercontent\.com$/u;
const statePattern = /^[A-Za-z0-9_-]{32,128}$/u;
const clientHashPattern = /^[a-f0-9]{64}$/u;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class ProofError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ProofError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProofError(code, message);
}

export function parseCli(argv) {
  const options = {
    browsers: ["arc", "dia"],
    preflightOnly: false,
    receiptDirectory: path.join(projectRoot, "artifacts"),
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--preflight-only") {
      options.preflightOnly = true;
    } else if (argument === "--browser") {
      const value = argv[++index];
      if (value === "all") options.browsers = ["arc", "dia"];
      else if (Object.hasOwn(browserConfigs, value)) options.browsers = [value];
      else fail("INVALID_BROWSER", "--browser must be arc, dia, or all");
    } else if (argument === "--receipt-dir") {
      const value = argv[++index];
      if (!value) fail("INVALID_RECEIPT_DIRECTORY", "--receipt-dir requires a path");
      options.receiptDirectory = path.resolve(process.cwd(), value);
    } else {
      fail("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  return Object.freeze(options);
}

function usage() {
  return [
    "Usage: node scripts/run-native-portable-proof.mjs [options]",
    "",
    "Options:",
    "  --browser arc|dia|all   Browser to prove (default: all, sequentially)",
    "  --preflight-only        Validate guards/build without launching a browser",
    "  --receipt-dir PATH      Directory for separate sanitized JSON receipts",
    "  --help                  Show this help without running preflight",
    "",
    "The proof always uses a new disposable profile and never selects a Google account.",
  ].join("\n");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(operation, {
  timeout = 15_000,
  interval = 100,
  code = "PROOF_TIMEOUT",
  label = "condition",
} = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  const detail = lastError ? ` (${sanitizeError(lastError)})` : "";
  fail(code, `Timed out waiting for ${label}${detail}`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
    else fail("UNSAFE_BUILD_ENTRY", `Build contains a non-file entry: ${entry.name}`);
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function treeProof(root) {
  const files = await walkFiles(root);
  const entries = [];
  for (const relative of files) {
    const absolute = path.join(root, relative);
    const details = await stat(absolute);
    entries.push({
      path: relative,
      size: details.size,
      sha256: await sha256File(absolute),
    });
  }
  const normalized = entries.map((entry) => `${entry.sha256}  ${entry.path}\n`).join("");
  return Object.freeze({
    fileCount: entries.length,
    compositeSha256: sha256(normalized),
    entries,
  });
}

async function makeTreeReadOnly(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await makeTreeReadOnly(absolute);
      await chmod(absolute, 0o500);
    } else if (entry.isFile()) {
      await chmod(absolute, 0o400);
    } else {
      fail("UNSAFE_BUILD_ENTRY", `Copied build contains a non-file entry: ${entry.name}`);
    }
  }
  await chmod(root, 0o500);
}

export function deriveExtensionId(publicKey) {
  const bytes = Buffer.from(publicKey || "", "base64");
  if (!publicKey || bytes.toString("base64") !== publicKey) {
    fail("INVALID_EXTENSION_KEY", "Manifest key is not canonical base64");
  }
  return crypto.createHash("sha256").update(bytes).digest().subarray(0, 16).toString("hex")
    .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

function exactParameters(parameters, expectedNames) {
  const names = [...new Set(parameters.keys())].sort();
  assert.deepEqual(names, [...expectedNames].sort());
  for (const name of names) assert.equal(parameters.getAll(name).length, 1);
}

export function inspectOAuthLaunchUrl(rawUrl, {
  clientId,
  redirectUri = expected.redirectUri,
} = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("OAUTH_LAUNCH_URL_INVALID", "OAuth launch URL is not parseable");
  }
  if (url.origin + url.pathname !== expected.oauthEndpoint
    || url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "") {
    fail("OAUTH_LAUNCH_URL_INVALID", "OAuth launch endpoint is not exact");
  }
  try {
    exactParameters(url.searchParams, [
      "access_type",
      "client_id",
      "include_granted_scopes",
      "prompt",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ]);
  } catch {
    fail("OAUTH_LAUNCH_URL_INVALID", "OAuth launch parameters are not exact and singular");
  }
  const state = url.searchParams.get("state");
  if (!webClientIdPattern.test(clientId || "")
    || url.searchParams.get("client_id") !== clientId
    || url.searchParams.get("access_type") !== "online"
    || url.searchParams.get("include_granted_scopes") !== "false"
    || url.searchParams.get("prompt") !== "select_account"
    || url.searchParams.get("redirect_uri") !== redirectUri
    || url.searchParams.get("response_type") !== "token"
    || url.searchParams.get("scope") !== expected.gmailScope
    || !statePattern.test(state || "")) {
    fail("OAUTH_LAUNCH_URL_INVALID", "OAuth launch boundary differs from the frozen contract");
  }
  return Object.freeze({
    endpoint: expected.oauthEndpoint,
    parameterNames: [...new Set(url.searchParams.keys())].sort(),
    accessType: "online",
    includeGrantedScopes: false,
    prompt: "select_account",
    responseType: "token",
    scope: expected.gmailScope,
    redirectUri,
    clientIdSha256: sha256(clientId),
    state: Object.freeze({ encoding: "base64url", length: state.length }),
  });
}

export function classifyProviderNavigation({ url: rawUrl, status }) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_URL_INVALID" });
  }
  if (url.origin !== "https://accounts.google.com"
    || url.username !== "" || url.password !== "" || url.hash !== "") {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_ORIGIN_INVALID" });
  }
  if (!Number.isInteger(status)) {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_STATUS_INVALID" });
  }
  if (status >= 300 && status < 400) {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_TRANSITION", status });
  }
  if (status !== 200) {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_STATUS_INVALID" });
  }
  if (/error/iu.test(url.pathname)
    || [...url.searchParams.keys()].some((key) => /(?:^|_)error(?:_|$)/iu.test(key))) {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_ERROR_PAGE" });
  }
  let providerSurface = null;
  if (/^\/(?:v\d+\/signin\/|signin\/)/u.test(url.pathname)) {
    providerSurface = "google-signin";
  } else if (/^\/AccountChooser(?:\/|$)/u.test(url.pathname)) {
    providerSurface = "google-account-chooser";
  } else if (/^\/ServiceLogin(?:\/|$)/u.test(url.pathname)) {
    providerSurface = "google-service-login";
  } else if (/^\/InteractiveLogin(?:\/|$)/u.test(url.pathname)) {
    providerSurface = "google-interactive-login";
  }
  if (!providerSurface) {
    return Object.freeze({ accepted: false, code: "OAUTH_PROVIDER_PATH_INVALID" });
  }
  return Object.freeze({
    accepted: true,
    code: "OAUTH_PROVIDER_ACCEPTED",
    providerSurface,
    status,
  });
}

export function updateProviderEvidence(current, classification) {
  const next = {
    accepted: current?.accepted || null,
    errorCode: current?.errorCode || null,
    responseCount: (current?.responseCount || 0) + 1,
  };
  if (classification?.accepted === true) {
    next.accepted = classification;
  } else {
    next.accepted = null;
    if (["OAUTH_PROVIDER_STATUS_INVALID", "OAUTH_PROVIDER_ERROR_PAGE"].includes(classification?.code)) {
      next.errorCode = classification.code;
    }
  }
  return Object.freeze(next);
}

export function assertCanceledAuthOutcome(outcome) {
  if (outcome?.status === "resolved") {
    fail("CHOOSER_CANCEL_RESOLVED", "launchWebAuthFlow resolved after harness cancellation");
  }
  if (outcome?.status !== "rejected") {
    fail("CHOOSER_CANCEL_OUTCOME_MISSING", "launchWebAuthFlow did not reject after harness cancellation");
  }
  return Object.freeze({ status: "rejected" });
}

export function assertPendingAuthOutcome(outcome) {
  if (outcome?.status !== "pending") {
    fail("CHOOSER_SETTLED_BEFORE_CANCEL", "launchWebAuthFlow settled before the harness cancellation");
  }
  return Object.freeze({ status: "pending" });
}

export function assertChooserPromiseContract(call) {
  if (call?.argumentCount !== 1 || call?.thenable !== true || call?.interactive !== true) {
    fail("CHOOSER_PROMISE_CONTRACT_INVALID",
      "launchWebAuthFlow must use one interactive options argument and return a promise");
  }
  return Object.freeze({ argumentCount: 1, interactive: true, thenable: true });
}

export function sanitizeError(error) {
  const message = String(error?.message || error || "UNKNOWN_PROOF_ERROR")
    .replace(/\b(?:authorization\s*:\s*)?bearer\s+[^\s,;]+/giu, "Bearer <redacted>")
    .replace(/\b(set-cookie|cookie|authorization)\s*:\s*[^\r\n]*/giu, "$1: <redacted>")
    .replace(/([?&#](?:access_token|code|id_token|refresh_token|state|client_secret)=)[^&#\s]*/giu, "$1<redacted>")
    .replace(/\b\d{6,32}-[a-z0-9]{16,128}\.apps\.googleusercontent\.com\b/giu,
      "<redacted-public-client-id>")
    .replace(/(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)]*/giu,
      "<redacted-local-endpoint>")
    .replace(/\b(?:localhost|127\.0\.0\.1):\d+\b/giu, "<redacted-local-endpoint>")
    .replace(/\/Users\/[^/\s]+(?:\/[^\s:),]*)?/gu, "<redacted-user-path>")
    .replace(/\/(?:private\/)?var\/folders\/[^\s:),]*/gu, "<redacted-temp-path>")
    .replace(/\b(pid|process(?:\s+id)?)\s*[=:]?\s*\d+\b/giu, "$1 <redacted-pid>")
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu,
      "<redacted-uuid>")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "<redacted-email>");
  return message.slice(0, 600);
}

export function assertCompactSurfaceBoundary({ compactAction, fullPageAction }) {
  if (compactAction !== null || fullPageAction !== "✦ Open full triage") {
    fail("COMPACT_WINDOW_CONTRACT_MISMATCH", "Portable launcher controls are incorrect");
  }
  return Object.freeze({ compactControlVisible: false, fullPageControlVisible: true });
}

function plistValue(plist, key) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], {
    encoding: "utf8",
  });
  if (result.status !== 0) fail("BROWSER_METADATA_UNAVAILABLE", `Cannot read ${key}`);
  return result.stdout.trim();
}

async function inspectBrowserInstall(config) {
  if (!await exists(config.executable) || !await exists(config.infoPlist)) {
    fail("BROWSER_NOT_INSTALLED", `${config.label} is not installed at the expected application path`);
  }
  const executable = await stat(config.executable);
  if (!executable.isFile() || (executable.mode & 0o111) === 0) {
    fail("BROWSER_NOT_EXECUTABLE", `${config.label} executable is unavailable`);
  }
  const bundleId = plistValue(config.infoPlist, "CFBundleIdentifier");
  if (bundleId !== config.expectedBundleId) {
    fail("BROWSER_BUNDLE_MISMATCH", `${config.label} bundle identifier is unexpected`);
  }
  return Object.freeze({
    bundleId,
    productVersion: plistValue(config.infoPlist, "CFBundleShortVersionString"),
    buildVersion: plistValue(config.infoPlist, "CFBundleVersion"),
  });
}

function processIds(processName) {
  const result = spawnSync("/usr/bin/pgrep", ["-x", processName], { encoding: "utf8" });
  if (result.status === 1) return [];
  if (result.status !== 0) fail("PROCESS_CHECK_FAILED", `Could not check whether ${processName} is running`);
  return result.stdout.trim().split(/\s+/u).filter(Boolean).map(Number).filter(Number.isSafeInteger);
}

export function assertNoPersonalBrowsersRunning(browserIds = Object.keys(browserConfigs)) {
  const running = browserIds.map((browserId) => browserConfigs[browserId])
    .filter(Boolean)
    .filter((config) => processIds(config.processName).length > 0);
  if (running.length > 0) {
    fail("PERSONAL_BROWSER_RUNNING",
      `Close ${running.map(({ label }) => label).join(" and ")} before running the disposable-profile proof`);
  }
}

export function desktopSessionLockedFromIoreg(output) {
  return /"CGSSessionScreenIsLocked"=Yes/u.test(String(output));
}

function assertInteractiveDesktopUnlocked() {
  const result = spawnSync("/usr/sbin/ioreg", ["-n", "Root", "-d1"], { encoding: "utf8" });
  if (result.status !== 0) fail("DESKTOP_SESSION_UNAVAILABLE", "Cannot verify the macOS desktop session");
  if (desktopSessionLockedFromIoreg(result.stdout)) {
    fail("DESKTOP_SESSION_LOCKED", "Unlock the macOS desktop before native popup proof");
  }
}

async function readJson(filePath, code) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    fail(code, `Required JSON is missing or invalid: ${path.basename(filePath)}`);
  }
}

async function assertFrozenBuild() {
  if (!await exists(buildRoot)) fail("FROZEN_BUILD_MISSING", "extension/build is missing");
  const [identity, manifest, marker] = await Promise.all([
    readJson(identityPath, "OAUTH_IDENTITY_INVALID"),
    readJson(path.join(buildRoot, "manifest.json"), "FROZEN_MANIFEST_INVALID"),
    readJson(path.join(buildRoot, ".inbox-island-build.json"), "FROZEN_MARKER_INVALID"),
  ]);
  if (identity.oauth_client_id === "PENDING_WEB_OAUTH_CLIENT_ID"
    || identity.oauth_client_status !== "active-private-pilot"
    || identity.oauth_client_type !== "web-application"
    || !webClientIdPattern.test(identity.oauth_client_id || "")) {
    fail("OAUTH_CLIENT_NOT_FROZEN", "The public Web OAuth client ID is missing or inactive");
  }
  const actualClientSha256 = assertExpectedClientHash(identity.oauth_client_id, expected.clientIdSha256);
  if (Object.keys(identity).some((key) => /secret/iu.test(key))) {
    fail("OAUTH_SECRET_PRESENT", "The identity record contains a secret-shaped key");
  }
  if (manifest.version !== expected.version || deriveExtensionId(manifest.key) !== expected.extensionId
    || manifest.action?.default_popup !== expected.popupPath
    || JSON.stringify(manifest.permissions) !== JSON.stringify(["identity"])
    || Object.hasOwn(manifest, "oauth2") || manifest.permissions.includes("identity.email")) {
    fail("FROZEN_MANIFEST_MISMATCH", `The built manifest differs from the portable ${expected.version} contract`);
  }
  if (identity.extension_id !== expected.extensionId
    || identity.oauth_redirect_uri !== expected.redirectUri
    || identity.gmail_scope !== expected.gmailScope) {
    fail("OAUTH_IDENTITY_MISMATCH", "The identity record differs from the fixed ID/redirect/scope");
  }
  if (marker.extensionVersion !== expected.version || marker.browserPortable !== true
    || marker.oauthClientType !== "web-application"
    || marker.oauthMode !== "launchWebAuthFlow-implicit-private-pilot"
    || marker.gmailConnected !== false) {
    fail("FROZEN_MARKER_MISMATCH", `The build marker is not the portable ${expected.version} marker`);
  }

  const files = await walkFiles(buildRoot);
  for (const relative of files) {
    if (!/\.(?:html|json|mjs|css|txt)$/u.test(relative)) continue;
    const source = await readFile(path.join(buildRoot, relative), "utf8");
    if (source.includes("PENDING_WEB_OAUTH_CLIENT_ID")) {
      fail("OAUTH_CLIENT_PLACEHOLDER_PRESENT", `Client placeholder remains in ${relative}`);
    }
    if (/client_secret/iu.test(source)) fail("OAUTH_SECRET_PRESENT", `Secret-shaped text remains in ${relative}`);
  }
  const builtAuth = await readFile(path.join(buildRoot, "app", "gmail-auth.mjs"), "utf8");
  if (!builtAuth.includes(`PILOT_OAUTH_CLIENT_ID = "${identity.oauth_client_id}"`)
    || !builtAuth.includes("launchWebAuthFlow")) {
    fail("OAUTH_CLIENT_BUILD_MISMATCH", "The built auth module does not contain the frozen public client");
  }

  const validation = spawnSync(process.execPath, [validatorPath, "--unpacked", buildRoot], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (validation.status !== 0) {
    fail("FROZEN_BUILD_VALIDATION_FAILED", sanitizeError(validation.stderr || validation.stdout));
  }
  const tree = await treeProof(buildRoot);
  return Object.freeze({
    clientId: identity.oauth_client_id,
    clientIdSha256: actualClientSha256,
    tree,
  });
}

export function assertExpectedClientHash(clientId, expectedClientSha256) {
  if (!clientHashPattern.test(expectedClientSha256 || "")) {
    fail("EXPECTED_CLIENT_HASH_NOT_FROZEN",
      "The source-pinned public client ID hash is still pending or invalid");
  }
  const actualClientSha256 = sha256(clientId);
  if (actualClientSha256 !== expectedClientSha256) {
    fail("EXPECTED_CLIENT_HASH_MISMATCH", "The frozen public client ID differs from the release expectation");
  }
  return actualClientSha256;
}

function loadChromium() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_CORE_PACKAGE, "playwright-core"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate).chromium;
    } catch {
      // Try the explicitly supplied or locally resolvable package next.
    }
  }
  fail("PLAYWRIGHT_CORE_MISSING",
    "Set PLAYWRIGHT_CORE_PACKAGE or install playwright-core for the CDP proof");
}

export function devToolsPortFromStderr(stderr) {
  for (const line of [...stderr].reverse()) {
    const match = String(line).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//u);
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= 65_535) return match[1];
  }
  return null;
}

async function waitForDevTools(profile, child, stderr) {
  return waitFor(async () => {
    if (child.exitCode !== null) fail("BROWSER_EXITED_EARLY", "Browser exited before DevTools became ready");
    let contents;
    for (const activePort of [
      path.join(profile, "DevToolsActivePort"),
      path.join(profile, "User Data", "DevToolsActivePort"),
    ]) {
      try { contents = await readFile(activePort, "utf8"); break; } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const [activePort] = contents ? contents.trim().split(/\r?\n/u) : [];
    const port = /^\d+$/u.test(activePort || "") ? activePort : devToolsPortFromStderr(stderr);
    if (!port) return null;
    if (!/^\d+$/u.test(port)) return null;
    const endpoint = `http://127.0.0.1:${port}`;
    const version = await fetch(`${endpoint}/json/version`).then((response) => response.json());
    return { endpoint, version };
  }, { timeout: 30_000, code: "DEVTOOLS_START_TIMEOUT", label: "disposable DevTools endpoint" });
}

export function parseProcessTable(output) {
  return String(output).split(/\r?\n/u).map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\s?\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/u);
    if (!match) return null;
    return Object.freeze({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      started: match[3].replace(/\s+/gu, " ").trim(),
      command: match[4],
      commandSha256: sha256(match[4]),
    });
  }).filter(Boolean);
}

function processSnapshot() {
  const result = spawnSync("/bin/ps", ["-ww", "-axo", "pid=,ppid=,lstart=,command="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.status !== 0) fail("PROCESS_CHECK_FAILED", "Could not inspect browser process ownership");
  return parseProcessTable(result.stdout);
}

function hasExactArgument(command, argument) {
  return String(command).split(/\s+/u).includes(argument);
}

function sameProcess(left, right) {
  return Boolean(left && right && left.pid === right.pid && left.started === right.started
    && left.commandSha256 === right.commandSha256);
}

export function captureOwnedProcessSet(processes, {
  config,
  profile,
  rootRecord,
  runId,
}) {
  const byPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const currentRoot = byPid.get(rootRecord.pid);
  if (!sameProcess(currentRoot, rootRecord)
    || currentRoot.command.split(/\s+/u)[0] !== config.executable
    || !hasExactArgument(currentRoot.command, `--user-data-dir=${profile}`)
    || !hasExactArgument(currentRoot.command, `--inbox-island-native-proof-owner=${runId}`)) {
    return Object.freeze({ owned: [], unknownProfile: [], rootValid: false });
  }
  const owned = new Map([[currentRoot.pid, currentRoot]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processInfo of processes) {
      if (owned.has(processInfo.pid) || !owned.has(processInfo.ppid)) continue;
      if (!processInfo.command.startsWith(config.applicationContents)) continue;
      owned.set(processInfo.pid, processInfo);
      changed = true;
    }
  }
  const unknownProfile = processes.filter((processInfo) =>
    hasExactArgument(processInfo.command, `--user-data-dir=${profile}`)
      && !owned.has(processInfo.pid));
  return Object.freeze({
    owned: [...owned.values()],
    unknownProfile,
    rootValid: true,
  });
}

export function verifiedRecordedProcesses(processes, records) {
  const byPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  return [...records.values()].filter((record) => sameProcess(byPid.get(record.pid), record));
}

async function captureSpawnRoot(child, config, profile, runId) {
  return waitFor(() => {
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.exitCode !== null) {
      fail("BROWSER_EXITED_EARLY", "Spawned browser exited before ownership was recorded");
    }
    const processInfo = processSnapshot().find(({ pid }) => pid === child.pid);
    if (!processInfo) return null;
    if (processInfo.command.split(/\s+/u)[0] !== config.executable
      || !hasExactArgument(processInfo.command, `--user-data-dir=${profile}`)
      || !hasExactArgument(processInfo.command, `--inbox-island-native-proof-owner=${runId}`)) {
      fail("SPAWN_OWNERSHIP_INVALID", "Spawned browser process does not match the owned invocation");
    }
    return processInfo;
  }, { timeout: 5_000, code: "SPAWN_OWNERSHIP_INVALID", label: "spawned browser ownership" });
}

async function launchBrowser(config, profile, copiedBuild, cleanupState) {
  const stderr = [];
  const args = [
    `--user-data-dir=${profile}`,
    `--inbox-island-native-proof-owner=${cleanupState.runId}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--enable-automation",
    "--disable-features=Translate,MediaRouter,DisableDisableExtensionsExceptCommandLineSwitch",
    `--disable-extensions-except=${copiedBuild}`,
    `--load-extension=${copiedBuild}`,
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-quic",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--use-mock-keychain",
    "--mute-audio",
    "--window-size=1280,900",
    "about:blank",
  ];
  // The check is deliberately adjacent to spawn to minimize the singleton-app race.
  assertNoPersonalBrowsersRunning([config.id]);
  const child = spawn(config.executable, args, { stdio: ["ignore", "ignore", "pipe"] });
  cleanupState.child = child;
  cleanupState.config = config;
  cleanupState.profile = profile;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr.push(...chunk.split(/\r?\n/u).filter(Boolean));
    if (stderr.length > 500) stderr.splice(0, stderr.length - 500);
  });
  const earlyError = new Promise((_, reject) => {
    child.once("error", (error) => reject(new ProofError("BROWSER_LAUNCH_FAILED", sanitizeError(error))));
  });
  cleanupState.rootRecord = await captureSpawnRoot(child, config, profile, cleanupState.runId);
  cleanupState.knownProcesses.set(cleanupState.rootRecord.pid, cleanupState.rootRecord);
  const devtools = await Promise.race([waitForDevTools(profile, child, stderr), earlyError]);
  const observer = await connectBrowserObserver(devtools);
  cleanupState.observer = observer;
  const browser = await loadChromium().connectOverCDP(devtools.endpoint);
  const context = browser.contexts()[0];
  if (!context) fail("BROWSER_CONTEXT_MISSING", "Disposable browser has no default context");
  const cdp = await browser.newBrowserCDPSession();
  const instance = {
    args,
    browser,
    cdp,
    child,
    config,
    context,
    devtools,
    observer,
    stderr,
  };
  cleanupState.instance = instance;
  return instance;
}

async function targetCensus(cdp) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return targetInfos.map((target) => ({
    targetId: target.targetId,
    type: target.type,
    url: target.url,
  }));
}

async function waitForWorker(context) {
  return waitFor(() => context.serviceWorkers().find((worker) =>
    worker.url() === `chrome-extension://${expected.extensionId}/background.mjs`), {
    timeout: 20_000,
    code: "EXTENSION_WORKER_MISSING",
    label: `Inbox Island ${expected.version} service worker`,
  });
}

async function inspectWorker(worker) {
  return worker.evaluate(async (redirectPath) => {
    const [popup, contexts] = await Promise.all([
      chrome.action.getPopup({}),
      chrome.runtime.getContexts({}),
    ]);
    const manifest = chrome.runtime.getManifest();
    return {
      runtimeId: chrome.runtime.id,
      version: manifest.version,
      permissions: manifest.permissions,
      hasOauth2: Object.hasOwn(manifest, "oauth2"),
      popup,
      redirectUri: chrome.identity.getRedirectURL(redirectPath),
      contexts: contexts.map(({ contextId, contextType, documentUrl }) => ({
        contextId,
        contextType,
        documentUrl,
      })),
    };
  }, "oauth2");
}

async function waitForPage(context, predicate, label, timeout = 15_000) {
  return waitFor(() => context.pages().find((page) => !page.isClosed() && predicate(page)), {
    timeout,
    code: "EXTENSION_PAGE_MISSING",
    label,
  });
}

async function connectRawTarget(debugEndpoint, targetId) {
  const targets = await fetch(`${debugEndpoint}/json/list`).then((response) => response.json());
  const target = targets.find((candidate) => candidate.id === targetId);
  if (!target?.webSocketDebuggerUrl) fail("POPUP_CDP_UNAVAILABLE", "Action popup has no CDP endpoint");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      events.push(message);
      if (events.length > 200) events.shift();
      return;
    }
    if (!pending.has(message.id)) return;
    const promise = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) promise.reject(new Error(`${message.error.code}: ${message.error.message}`));
    else promise.resolve(message.result || {});
  });
  socket.addEventListener("close", () => {
    for (const promise of pending.values()) promise.reject(new Error("Raw popup target closed"));
    pending.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description
        || result.exceptionDetails.text || "Raw popup evaluation failed");
    }
    return result.result?.value;
  };
  await send("Runtime.enable");
  await send("DOM.enable");
  await send("Page.enable");
  return Object.freeze({
    events,
    evaluate,
    send,
    close: () => socket.close(),
  });
}

async function connectBrowserObserver(devtools) {
  const socketUrl = devtools.version.webSocketDebuggerUrl;
  if (typeof socketUrl !== "string") {
    fail("BROWSER_OBSERVER_UNAVAILABLE", "Browser DevTools websocket is unavailable");
  }
  const socket = new WebSocket(socketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const sessions = new Map();
  const targets = new Map();
  const destroyedTargets = new Set();
  const provider = new Map();
  const summary = {
    accountsGoogleRequestCount: 0,
    exactOauthEndpointRequestCount: 0,
    gmailApiRequestCount: 0,
    oauthCallbackObserved: false,
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    socket.send(JSON.stringify(message));
  });
  const providerEntry = (targetId) => {
    if (!provider.has(targetId)) provider.set(targetId, {
      accepted: null,
      errorCode: null,
      responseCount: 0,
    });
    return provider.get(targetId);
  };
  const observeUrl = (rawUrl) => {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return;
    }
    if (url.hostname === "accounts.google.com") {
      summary.accountsGoogleRequestCount += 1;
      if (url.origin + url.pathname === expected.oauthEndpoint) {
        summary.exactOauthEndpointRequestCount += 1;
      }
    }
    if (url.hostname === "gmail.googleapis.com") summary.gmailApiRequestCount += 1;
    if (url.origin + url.pathname === expected.redirectUri) summary.oauthCallbackObserved = true;
  };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const promise = pending.get(message.id);
      if (!promise) return;
      pending.delete(message.id);
      if (message.error) promise.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else promise.resolve(message.result || {});
      return;
    }
    if (message.method === "Target.targetCreated"
      || message.method === "Target.targetInfoChanged") {
      const info = message.params.targetInfo;
      targets.set(info.targetId, { targetId: info.targetId, type: info.type, url: info.url });
      if (info.url) observeUrl(info.url);
      return;
    }
    if (message.method === "Target.targetDestroyed") {
      destroyedTargets.add(message.params.targetId);
      targets.delete(message.params.targetId);
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo } = message.params;
      sessions.set(sessionId, targetInfo.targetId);
      targets.set(targetInfo.targetId, {
        targetId: targetInfo.targetId,
        type: targetInfo.type,
        url: targetInfo.url,
      });
      void send("Network.enable", {}, sessionId).catch(() => null).finally(() => {
        void send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => null);
      });
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      sessions.delete(message.params.sessionId);
      return;
    }
    if (message.method === "Network.requestWillBeSent") {
      observeUrl(message.params.request?.url || "");
      return;
    }
    if (message.method === "Network.responseReceived") {
      const targetId = sessions.get(message.sessionId);
      const response = message.params.response;
      if (!targetId || message.params.type !== "Document" || !response?.url) return;
      let url;
      try {
        url = new URL(response.url);
      } catch {
        return;
      }
      if (url.hostname !== "accounts.google.com") return;
      const entry = providerEntry(targetId);
      const classification = classifyProviderNavigation({ url: response.url, status: response.status });
      provider.set(targetId, updateProviderEvidence(entry, classification));
    }
  });
  socket.addEventListener("close", () => {
    for (const promise of pending.values()) promise.reject(new Error("Browser observer closed"));
    pending.clear();
  });
  await send("Target.setDiscoverTargets", { discover: true });
  await send("Target.setAutoAttach", {
    autoAttach: true,
    flatten: true,
    waitForDebuggerOnStart: true,
  });
  const { targetInfos } = await send("Target.getTargets");
  for (const info of targetInfos) {
    targets.set(info.targetId, { targetId: info.targetId, type: info.type, url: info.url });
  }
  return Object.freeze({
    close: () => socket.close(),
    providerState: (targetId) => provider.get(targetId) || null,
    destroyedTargets,
    summary,
    targets,
  });
}

async function rawTrustedClick(raw, selector, tag) {
  await raw.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) throw new Error("Missing native proof click target");
    button.addEventListener("click", (event) => {
      console.info(
        ${JSON.stringify(`__INBOX_ISLAND_TRUSTED_CLICK__:${tag}:`)},
        event.isTrusted,
        navigator.userActivation?.isActive === true,
      );
    }, { capture: true, once: true });
    return true;
  })()`);
  const { root } = await raw.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await raw.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) fail("POPUP_CONTROL_MISSING", `Action popup is missing ${selector}`);
  const { model } = await raw.send("DOM.getBoxModel", { nodeId });
  const x = (model.content[0] + model.content[2] + model.content[4] + model.content[6]) / 4;
  const y = (model.content[1] + model.content[3] + model.content[5] + model.content[7]) / 4;
  await raw.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await raw.send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
  });
  await raw.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
  });
  return waitFor(() => {
    for (const event of raw.events) {
      if (event.method !== "Runtime.consoleAPICalled") continue;
      const values = event.params.args.map((argument) => argument.value);
      if (values[0] === `__INBOX_ISLAND_TRUSTED_CLICK__:${tag}:`) {
        return values[1] === true && values[2] === true;
      }
    }
    return null;
  }, { timeout: 3_000, code: "UNTRUSTED_EXTENSION_CLICK", label: `${tag} trusted click` });
}

async function openNativePopup(instance, worker, label, anchorPage) {
  await anchorPage.bringToFront();
  const popupUrl = `chrome-extension://${expected.extensionId}/${expected.popupPath}`;
  const beforeTargets = new Set((await targetCensus(instance.cdp)).map(({ targetId }) => targetId));
  const beforeContexts = new Set((await inspectWorker(worker)).contexts.map(({ contextId }) => contextId));
  const created = await worker.evaluate(async () => {
    try {
      const targetWindow = await chrome.windows.create({
        focused: true,
        type: "normal",
        url: "about:blank",
      });
      if (!Number.isInteger(targetWindow?.id)) throw new Error("No normal browser window is available");
      return { ok: true, windowId: targetWindow.id };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  });
  if (!created.ok) fail("ACTION_POPUP_OPEN_FAILED", sanitizeError(created.message));
  const activation = spawnSync("/usr/bin/osascript", [
    "-e",
    `tell application id "${instance.config.expectedBundleId}" to activate`,
  ], { encoding: "utf8" });
  if (activation.status !== 0) {
    fail("BROWSER_ACTIVATION_FAILED", `Could not activate ${instance.config.label}'s disposable window`);
  }
  await sleep(250);
  const invocation = await worker.evaluate(async (windowId) => {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      if (Number.isInteger(tabs[0]?.id)) await chrome.tabs.update(tabs[0].id, { active: true });
      let targetWindow;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        targetWindow = await chrome.windows.update(windowId, { focused: true });
        if (targetWindow.focused) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!targetWindow.focused) throw new Error("Disposable browser window did not become focused");
      await chrome.action.openPopup({ windowId });
      return { ok: true, windowIdPresent: true };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  }, created.windowId);
  if (!invocation.ok) fail("ACTION_POPUP_OPEN_FAILED", sanitizeError(invocation.message));
  const target = await waitFor(async () => (await targetCensus(instance.cdp)).find((candidate) =>
    !beforeTargets.has(candidate.targetId) && candidate.url === popupUrl), {
    timeout: 10_000,
    code: "ACTION_POPUP_TARGET_MISSING",
    label: `${label} native action popup target`,
  });
  const runtimeContext = await waitFor(async () => (await inspectWorker(worker)).contexts.find((context) =>
    !beforeContexts.has(context.contextId)
      && context.contextType === "POPUP"
      && context.documentUrl === popupUrl), {
    timeout: 8_000,
    code: "ACTION_POPUP_CONTEXT_MISSING",
    label: `${label} new native popup runtime context`,
  });
  const raw = await connectRawTarget(instance.devtools.endpoint, target.targetId);
  const ui = await waitFor(() => raw.evaluate(`(() => {
    if (document.documentElement.dataset.popupState !== "ready") return null;
    return {
      url: location.href,
      title: document.querySelector("#popup-title")?.textContent || null,
      compactAction: document.querySelector("#open-compact")?.textContent?.trim() || null,
      fullPageAction: document.querySelector("#open-tab")?.textContent?.trim() || null,
    };
  })()`), { timeout: 10_000, code: "ACTION_POPUP_NOT_READY", label: `${label} native popup UI` });
  assert.equal(ui.url, popupUrl);
  assertCompactSurfaceBoundary(ui);
  return Object.freeze({ raw, runtimeContext, target, ui });
}

async function waitForRawSurface(instance, targetId, expectedUrl, expectedSurface, label) {
  const raw = await connectRawTarget(instance.devtools.endpoint, targetId);
  try {
    return await waitFor(() => raw.evaluate(`(() => {
      if (location.href !== ${JSON.stringify(expectedUrl)}
        || document.documentElement.dataset.uiState !== "ready"
        || document.documentElement.dataset.surface !== ${JSON.stringify(expectedSurface)}) return null;
      return {
        url: location.href,
        surface: document.documentElement.dataset.surface,
        state: document.documentElement.dataset.uiState,
      };
    })()`), { timeout: 10_000, code: "EXTENSION_SURFACE_NOT_READY", label });
  } finally {
    raw.close();
  }
}

async function closeProofTarget(instance, targetId) {
  if (!(await targetCensus(instance.cdp)).some((target) => target.targetId === targetId)) return;
  const closed = await instance.cdp.send("Target.closeTarget", { targetId });
  if (closed.success !== true) fail("PROOF_TARGET_CLOSE_FAILED", "Could not close an exact proof target");
  await waitFor(async () => !(await targetCensus(instance.cdp))
    .some((target) => target.targetId === targetId), {
    timeout: 5_000,
    code: "PROOF_TARGET_CLOSE_FAILED",
    label: "exact proof target close",
  });
}

async function provePopupAndFullPage(instance, worker, workerProof, anchorPage) {
  const popupUrl = `chrome-extension://${expected.extensionId}/${expected.popupPath}`;
  const fullPageUrl = `chrome-extension://${expected.extensionId}/${expected.fullPagePath}`;
  const secondPopup = await openNativePopup(instance, worker, "canonical-full-page", anchorPage);
  try {
    const beforeTargets = new Set((await targetCensus(instance.cdp)).map(({ targetId }) => targetId));
    const trusted = await rawTrustedClick(secondPopup.raw, "#open-tab", "popup-full-page");
    assert.equal(trusted, true);
    const fullPageTarget = await waitFor(async () => (await targetCensus(instance.cdp)).find((target) =>
      !beforeTargets.has(target.targetId) && target.url === fullPageUrl), {
      timeout: 10_000,
      code: "FULL_PAGE_TARGET_MISSING",
      label: "new canonical full-page target after trusted popup click",
    });
    await waitForRawSurface(instance, fullPageTarget.targetId, fullPageUrl, "tab",
      "canonical popup-launched full page");
    const fullPage = await waitForPage(instance.context, (page) => page.url() === fullPageUrl,
      "popup-launched full page");
    await fullPage.waitForFunction(() => document.documentElement.dataset.uiState === "ready");
    const surface = await fullPage.evaluate(() => ({
      url: location.href,
      surface: document.documentElement.dataset.surface,
      state: document.documentElement.dataset.uiState,
      badge: document.querySelector("#surface-badge")?.textContent || null,
      connection: document.querySelector("#connection-label")?.textContent || null,
      runAction: document.querySelector("#run-button-label")?.textContent || null,
      demoAction: document.querySelector("#demo-button")?.textContent?.trim() || null,
      demoHidden: document.querySelector("#demo-button")?.hidden,
      accountCheckHidden: document.querySelector("#gmail-account-check")?.hidden,
      accountValueEmpty: document.querySelector("#gmail-expected-email")?.value === "",
    }));
    assert.deepEqual(surface, {
      url: fullPageUrl,
      surface: "tab",
      state: "ready",
      badge: "Private Gmail pilot",
      connection: "Gmail not connected",
      runAction: "Choose Google account",
      demoAction: "Try demo",
      demoHidden: false,
      accountCheckHidden: true,
      accountValueEmpty: true,
    });
    return {
      popup: {
        url: popupUrl,
        runtimeContextProved: Boolean(secondPopup.runtimeContext.contextId),
        compactWindowControlVisible: false,
        controls: ["Open full triage"],
        trustedFullPageClick: true,
        canonicalFullPageTargetDeltaProved: true,
      },
      fullPage,
      surface,
    };
  } finally {
    secondPopup.raw.close();
    await closeProofTarget(instance, secondPopup.target.targetId);
  }
}

async function instrumentChooser(page) {
  return page.evaluate(() => {
    const identity = chrome.identity;
    const original = identity.launchWebAuthFlow;
    const proof = { calls: [], trusted: null, userActivation: null };
    Object.defineProperty(globalThis, "__INBOX_ISLAND_PORTABLE_PROOF__", {
      value: proof,
      configurable: true,
    });
    const wrapped = function wrappedLaunchWebAuthFlow(...args) {
      const [options] = args;
      const record = {
        argumentCount: args.length,
        interactive: options?.interactive === true,
        thenable: null,
        url: String(options?.url || ""),
        outcome: { status: "pending" },
      };
      proof.calls.push(record);
      const result = Reflect.apply(original, identity, args);
      record.thenable = typeof result?.then === "function";
      Promise.resolve(result).then(() => {
        record.outcome = { status: "resolved" };
      }, () => {
        record.outcome = { status: "rejected" };
      });
      return result;
    };
    try {
      identity.launchWebAuthFlow = wrapped;
    } catch {
      return { instrumented: false };
    }
    document.querySelector("#run-button")?.addEventListener("click", (event) => {
      proof.trusted = event.isTrusted;
      proof.userActivation = navigator.userActivation?.isActive === true;
    }, { capture: true, once: true });
    return { instrumented: identity.launchWebAuthFlow === wrapped };
  });
}

async function readChooserCapture(page) {
  return waitFor(() => page.evaluate(() => {
    const proof = globalThis.__INBOX_ISLAND_PORTABLE_PROOF__;
    if (!proof?.calls?.length) return null;
    return {
      call: proof.calls[0],
      trusted: proof.trusted,
      userActivation: proof.userActivation,
    };
  }), { timeout: 8_000, code: "CHOOSER_INVOCATION_MISSING", label: "launchWebAuthFlow invocation" });
}

async function clearChooserCapture(page) {
  await page.evaluate(() => {
    const proof = globalThis.__INBOX_ISLAND_PORTABLE_PROOF__;
    if (proof?.calls?.[0]) proof.calls[0].url = null;
  });
}

async function readChooserOutcome(page) {
  return waitFor(() => page.evaluate(() => {
    const outcome = globalThis.__INBOX_ISLAND_PORTABLE_PROOF__?.calls?.[0]?.outcome;
    return outcome?.status && outcome.status !== "pending" ? outcome : null;
  }), { timeout: 15_000, code: "CHOOSER_CANCEL_OUTCOME_MISSING", label: "launchWebAuthFlow rejection" });
}

async function peekChooserOutcome(page) {
  return page.evaluate(() =>
    globalThis.__INBOX_ISLAND_PORTABLE_PROOF__?.calls?.[0]?.outcome || null);
}

function isGoogleChooserTarget(target, beforeIds) {
  if (beforeIds.has(target.targetId)) return false;
  try {
    const url = new URL(target.url);
    return url.hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

async function proveChooserCancellation(instance, page, clientId, observer) {
  const instrumented = await instrumentChooser(page);
  if (!instrumented.instrumented) {
    fail("CHOOSER_INSTRUMENTATION_BLOCKED", "Cannot observe the exact native launchWebAuthFlow call");
  }
  await instance.cdp.send("Target.setDiscoverTargets", { discover: true });
  const beforeIds = new Set((await targetCensus(instance.cdp)).map(({ targetId }) => targetId));
  await page.locator("#run-button").click();
  const capture = await readChooserCapture(page);
  assert.equal(capture.trusted, true);
  assert.equal(capture.userActivation, true);
  assertChooserPromiseContract(capture.call);
  assertPendingAuthOutcome(capture.call.outcome);
  const launch = inspectOAuthLaunchUrl(capture.call.url, { clientId });
  await clearChooserCapture(page);

  const chooserTarget = await waitFor(async () => (await targetCensus(instance.cdp))
    .find((target) => isGoogleChooserTarget(target, beforeIds)), {
    timeout: 15_000,
    code: "GOOGLE_CHOOSER_TARGET_MISSING",
    label: "browser-owned Google chooser target",
  });
  const provider = await waitFor(() => {
    const state = observer.providerState(chooserTarget.targetId);
    if (state?.errorCode) return { errorCode: state.errorCode };
    if (state?.accepted) return { accepted: state.accepted };
    return null;
  }, {
    timeout: 15_000,
    code: "OAUTH_PROVIDER_ACCEPTANCE_MISSING",
    label: "accepted Google sign-in/chooser response",
  });
  if (provider.errorCode) fail(provider.errorCode, "Google returned an OAuth error response");
  await waitFor(() => observer.summary.accountsGoogleRequestCount >= 1
    && observer.summary.exactOauthEndpointRequestCount >= 1, {
    timeout: 10_000,
    code: "GOOGLE_CHOOSER_REQUEST_MISSING",
    label: "exact Google OAuth chooser request",
  });
  assertPendingAuthOutcome(await peekChooserOutcome(page));
  const closed = await instance.cdp.send("Target.closeTarget", { targetId: chooserTarget.targetId });
  if (closed.success !== true) fail("GOOGLE_CHOOSER_CLOSE_FAILED", "Browser refused to close the chooser");
  await waitFor(async () => observer.destroyedTargets.has(chooserTarget.targetId)
    && !(await targetCensus(instance.cdp)).some(({ targetId }) => targetId === chooserTarget.targetId), {
    timeout: 8_000,
    code: "GOOGLE_CHOOSER_CLOSE_FAILED",
    label: "chooser cancellation",
  });
  const authOutcome = assertCanceledAuthOutcome(await readChooserOutcome(page));
  const cancellation = await waitFor(() => page.evaluate(() => {
    const banner = document.querySelector("#error-banner");
    if (!banner || banner.hidden) return null;
    const code = banner.textContent.match(/Code:\s*(GMAIL_AUTH_[A-Z_]+)/u)?.[1] || null;
    return {
      code,
      accountCheckHidden: document.querySelector("#gmail-account-check")?.hidden,
      accountValueEmpty: document.querySelector("#gmail-expected-email")?.value === "",
      connection: document.querySelector("#connection-label")?.textContent || null,
      runAction: document.querySelector("#run-button-label")?.textContent || null,
    };
  }), { timeout: 15_000, code: "CHOOSER_CANCEL_UI_MISSING", label: "safe chooser cancellation UI" });
  if (!["GMAIL_AUTH_ACCESS_DENIED", "GMAIL_AUTH_CANCELED"].includes(cancellation.code)) {
    fail("CHOOSER_CANCEL_CODE_UNSAFE", `Unexpected safe-cancel code: ${cancellation.code || "none"}`);
  }
  assert.equal(cancellation.accountCheckHidden, true);
  assert.equal(cancellation.accountValueEmpty, true);
  assert.equal(cancellation.connection, "Gmail not connected");
  assert.equal(cancellation.runAction, "Choose Google account");
  assert.equal(observer.summary.gmailApiRequestCount, 0);
  assert.equal(observer.summary.oauthCallbackObserved, false);
  return Object.freeze({
    launch,
    trustedConnectClick: true,
    userActivationObserved: true,
    browserOwnedTargetObserved: true,
    authTargetDomAttached: false,
    authTargetInputEventsDispatched: 0,
    accountSelected: false,
    chooserClosedByTargetId: true,
    chooserTargetDestroyedObserved: true,
    provider: provider.accepted,
    launchOutcome: authOutcome.status,
    cancellationCode: cancellation.code,
  });
}

async function readStorageBoundary(page) {
  return page.evaluate(async () => {
    const databaseName = "inbox-island-derived-v1";
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    if (!databases.some(({ name }) => name === databaseName)) {
      return {
        derivedKeyCount: 0,
        accountKeyCount: 0,
        localStorageKeyCount: localStorage.length,
        sessionStorageKeyCount: sessionStorage.length,
      };
    }
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(new Error("PROOF_INDEXEDDB_OPEN_FAILED")), { once: true });
    });
    try {
      const transaction = database.transaction("derived", "readonly");
      const keys = await new Promise((resolve, reject) => {
        const request = transaction.objectStore("derived").getAllKeys();
        request.addEventListener("success", () => resolve(request.result.map(String)), { once: true });
        request.addEventListener("error", () => reject(new Error("PROOF_INDEXEDDB_READ_FAILED")), { once: true });
      });
      return {
        derivedKeyCount: keys.length,
        accountKeyCount: keys.filter((key) => key.startsWith("inbox-island:account:")).length,
        localStorageKeyCount: localStorage.length,
        sessionStorageKeyCount: sessionStorage.length,
      };
    } finally {
      database.close();
    }
  });
}

async function waitForChildExit(child, timeout) {
  if (!child || child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    sleep(timeout).then(() => false),
  ]);
}

function exactProfileProcesses(processes, profile) {
  return profile ? processes.filter((processInfo) =>
    hasExactArgument(processInfo.command, `--user-data-dir=${profile}`)) : [];
}

async function closeDisposableBrowser(state) {
  const forcedSignals = [];
  let ownershipUncertain = false;
  if (state.rootRecord && state.config && state.profile) {
    const captured = captureOwnedProcessSet(processSnapshot(), {
      config: state.config,
      profile: state.profile,
      rootRecord: state.rootRecord,
      runId: state.runId,
    });
    if (captured.rootValid && captured.unknownProfile.length === 0) {
      for (const processInfo of captured.owned) {
        state.knownProcesses.set(processInfo.pid, processInfo);
      }
    } else if (captured.unknownProfile.length > 0) {
      ownershipUncertain = true;
    }
  }
  if (state.instance) {
    try {
      await state.instance.cdp.send("Browser.close");
    } catch {
      try {
        await state.instance.browser.close();
      } catch {
        // Exact disposable-profile process cleanup below remains authoritative.
      }
    }
    await waitForChildExit(state.child, 8_000);
  }
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    const current = processSnapshot();
    const verified = verifiedRecordedProcesses(current, state.knownProcesses);
    const verifiedIds = new Set(verified.map(({ pid }) => pid));
    const unknownProfile = exactProfileProcesses(current, state.profile)
      .filter(({ pid }) => !verifiedIds.has(pid));
    const currentRootPid = state.rootRecord
      ? current.find(({ pid }) => pid === state.rootRecord.pid) : null;
    if (unknownProfile.length > 0
      || (currentRootPid && !sameProcess(currentRootPid, state.rootRecord))) {
      ownershipUncertain = true;
      break;
    }
    const verifiedRoot = state.rootRecord && verified.find(({ pid }) => pid === state.rootRecord.pid);
    if (!verifiedRoot) break;
    if (!Number.isSafeInteger(verifiedRoot.pid) || verifiedRoot.pid <= 0) {
      ownershipUncertain = true;
      break;
    }
    try {
      process.kill(verifiedRoot.pid, signal);
      forcedSignals.push(signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    await sleep(signal === "SIGTERM" ? 3_000 : 1_000);
  }
  const finalProcesses = processSnapshot();
  const verifiedRemaining = verifiedRecordedProcesses(finalProcesses, state.knownProcesses);
  const verifiedIds = new Set(verifiedRemaining.map(({ pid }) => pid));
  const unknownProfileRemaining = exactProfileProcesses(finalProcesses, state.profile)
    .filter(({ pid }) => !verifiedIds.has(pid));
  const finalRootPid = state.rootRecord
    ? finalProcesses.find(({ pid }) => pid === state.rootRecord.pid) : null;
  if (unknownProfileRemaining.length > 0
    || (finalRootPid && !sameProcess(finalRootPid, state.rootRecord))) ownershipUncertain = true;
  try {
    state.observer?.close();
  } catch {
    // The browser may already have closed its DevTools websocket.
  }
  return {
    stopped: verifiedRemaining.length === 0 && unknownProfileRemaining.length === 0,
    ownershipUncertain,
    forcedSignals: [...new Set(forcedSignals)],
  };
}

export function createIdempotentCleanup(task) {
  if (typeof task !== "function") throw new TypeError("CLEANUP_TASK_REQUIRED");
  let inFlight;
  return () => {
    if (!inFlight) inFlight = Promise.resolve().then(task);
    return inFlight;
  };
}

export function createSignalCleanupCoordinator({ exit = (code) => process.exit(code) } = {}) {
  let activeCleanup = null;
  let signalHandling = null;
  return Object.freeze({
    register(cleanup) {
      activeCleanup = cleanup;
    },
    clear(cleanup) {
      if (activeCleanup === cleanup) activeCleanup = null;
    },
    handle(signal) {
      if (signalHandling) return signalHandling;
      const exitCode = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[signal] || 1;
      signalHandling = Promise.resolve()
        .then(() => activeCleanup?.())
        .catch(() => null)
        .then(() => exit(exitCode));
      return signalHandling;
    },
  });
}

function installSignalHandlers(coordinator) {
  const handlers = new Map();
  for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
    const handler = () => { void coordinator.handle(signal); };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

async function validateDisposableRoot(tempRoot, runId) {
  const [temporaryBase, resolved, details, marker] = await Promise.all([
    realpath(os.tmpdir()),
    realpath(tempRoot),
    lstat(tempRoot),
    readJson(path.join(tempRoot, ".inbox-island-proof-owner.json"),
      "DISPOSABLE_OWNERSHIP_INVALID"),
  ]);
  if (details.isSymbolicLink()
    || path.dirname(resolved) !== temporaryBase
    || path.basename(resolved) !== path.basename(tempRoot)
    || marker.schema !== "inbox-island.native-proof-owner.v1"
    || marker.runId !== runId) {
    fail("DISPOSABLE_OWNERSHIP_INVALID", "Temporary proof root failed its ownership boundary");
  }
}

async function trashDisposableRoot(tempRoot, runId) {
  await validateDisposableRoot(tempRoot, runId);
  const result = spawnSync("/usr/bin/trash", [tempRoot], { encoding: "utf8" });
  if (result.status !== 0 || await exists(tempRoot)) {
    return { disposed: false, error: sanitizeError(result.stderr || "trash did not remove the source path") };
  }
  return { disposed: true, method: "macOS Trash" };
}

const receiptPhases = new Set([
  "prepare", "copy-build", "launch", "runtime", "surfaces", "oauth-cancel",
  "storage", "integrity", "cleanup", "complete",
]);
const receiptFailureCodes = new Set([
  "ACTION_POPUP_CONTEXT_MISSING", "ACTION_POPUP_NOT_READY", "ACTION_POPUP_OPEN_FAILED",
  "ACTION_POPUP_TARGET_MISSING", "BROWSER_ACTIVATION_FAILED", "BROWSER_CHROMIUM_TOO_OLD", "BROWSER_CONTEXT_MISSING",
  "BROWSER_EXITED_EARLY", "BROWSER_LAUNCH_FAILED", "BROWSER_OBSERVER_UNAVAILABLE",
  "CHOOSER_CANCEL_CODE_UNSAFE", "CHOOSER_CANCEL_OUTCOME_MISSING", "CHOOSER_CANCEL_RESOLVED",
  "CHOOSER_CANCEL_UI_MISSING", "CHOOSER_INSTRUMENTATION_BLOCKED", "CHOOSER_INVOCATION_MISSING",
  "CHOOSER_PROMISE_CONTRACT_INVALID", "CHOOSER_SETTLED_BEFORE_CANCEL",
  "DESKTOP_SESSION_LOCKED", "DESKTOP_SESSION_UNAVAILABLE", "DEVTOOLS_START_TIMEOUT",
  "DISPOSABLE_CLEANUP_FAILED", "DISPOSABLE_OWNERSHIP_INVALID",
  "EXTENSION_PAGE_MISSING", "EXTENSION_SURFACE_NOT_READY", "EXTENSION_WORKER_MISSING",
  "FULL_PAGE_TARGET_MISSING", "GOOGLE_CHOOSER_CLOSE_FAILED", "GOOGLE_CHOOSER_REQUEST_MISSING",
  "GOOGLE_CHOOSER_TARGET_MISSING", "NATIVE_PROOF_ASSERTION_FAILED", "NATIVE_PROOF_FAILED",
  "OAUTH_LAUNCH_URL_INVALID", "OAUTH_PROVIDER_ACCEPTANCE_MISSING", "OAUTH_PROVIDER_ERROR_PAGE",
  "OAUTH_PROVIDER_ORIGIN_INVALID", "OAUTH_PROVIDER_PATH_INVALID", "OAUTH_PROVIDER_STATUS_INVALID",
  "OAUTH_PROVIDER_URL_INVALID", "PERSONAL_BROWSER_RUNNING", "PLAYWRIGHT_CORE_MISSING",
  "POPUP_CDP_UNAVAILABLE", "POPUP_CONTROL_MISSING", "PROCESS_CHECK_FAILED",
  "PROOF_TARGET_CLOSE_FAILED",
  "SIDE_PANEL_CONTRACT_MISMATCH", "SIDE_PANEL_FALLBACK_MISMATCH",
  "SIDE_PANEL_OR_FALLBACK_MISSING", "SPAWN_OWNERSHIP_INVALID", "UNTRUSTED_EXTENSION_CLICK",
]);
const forbiddenReceiptKeys = new Set([
  "accesstoken",
  "clientsecret",
  "refreshtoken",
  "idtoken",
  "authorization",
  "setcookie",
  "cookie",
]);
const forbiddenSerializedReceiptKey = /"(?:access[\s_.-]*token|client[\s_.-]*secret|refresh[\s_.-]*token|id[\s_.-]*token|authorization|set[\s_.-]*cookie|cookie)"\s*:/iu;

export function receiptFailure(error, phase) {
  const normalizedPhase = receiptPhases.has(phase) ? phase : "complete";
  const candidate = error?.code === "ERR_ASSERTION" ? "NATIVE_PROOF_ASSERTION_FAILED" : error?.code;
  const code = receiptFailureCodes.has(candidate) ? candidate : "NATIVE_PROOF_FAILED";
  return Object.freeze({ phase: normalizedPhase, code });
}

export function assertReceiptObjectKeysSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (forbiddenReceiptKeys.has(normalized)) {
      fail("RECEIPT_SANITIZATION_FAILED", "Receipt contains a forbidden secret or header key");
    }
    assertReceiptObjectKeysSafe(child, seen);
  }
  return true;
}

function createBatchId(date = new Date(), randomBytes = crypto.randomBytes) {
  const timestamp = date.toISOString().replace(/[-:.]/gu, "");
  return `${timestamp}-${randomBytes(8).toString("hex")}`;
}

function receiptFile(receiptDirectory, browserId, batchId) {
  return path.join(receiptDirectory, `native-pilot-${expected.version}-${batchId}-${browserId}-proof.json`);
}

export async function writeReceipt(filePath, receipt, forbiddenValues = []) {
  assertReceiptObjectKeysSafe(receipt);
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  for (const value of forbiddenValues.filter(Boolean)) {
    if (body.includes(value)) fail("RECEIPT_SANITIZATION_FAILED", "Receipt contains a forbidden exact value");
  }
  if (forbiddenSerializedReceiptKey.test(body)
    || /\b(?:access_token|client_secret|refresh_token|id_token)\s*[=:]/iu.test(body)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(body)
    || /\/Users\/|\/(?:private\/)?var\/folders\//u.test(body)
    || /(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu.test(body)
    || /\b(?:localhost|127\.0\.0\.1):\d+\b/iu.test(body)
    || /\b(?:pid|process(?:\s+id)?)\s*[=:]?\s*\d+\b/iu.test(body)
    || /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/iu.test(body)
    || /\b(?:authorization|set-cookie|cookie)\s*:/iu.test(body)
    || /\bbearer\s+[^\s,;]+/iu.test(body)) {
    fail("RECEIPT_SANITIZATION_FAILED", "Receipt contains forbidden path, process, auth, or account data");
  }
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, body, { mode: 0o600, flag: "wx" });
    await link(temporary, filePath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("RECEIPT_ALREADY_EXISTS", "Refusing to overwrite an existing proof receipt");
    }
    throw error;
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function runBrowserProof(config, install, frozen, receiptDirectory, batchId, signalCoordinator) {
  const receiptPath = receiptFile(receiptDirectory, config.id, batchId);
  const receipt = {
    schema: "inbox-island.native-portable-browser-proof.v1",
    batchId,
    recordedAt: new Date().toISOString(),
    verdict: "RUNNING",
    browser: {
      id: config.id,
      label: config.label,
      bundleId: install.bundleId,
      productVersion: install.productVersion,
      buildVersion: install.buildVersion,
    },
    scope: {
      extensionVersion: expected.version,
      disposableProfileOnly: true,
      personalProfileReadOrWritten: false,
      googleAccountSelected: false,
      googleConsentGranted: false,
      mailboxAccessAllowed: false,
      providerDomInspectionAllowed: false,
    },
    build: {
      extensionId: expected.extensionId,
      version: expected.version,
      redirectUri: expected.redirectUri,
      clientIdSha256: frozen.clientIdSha256,
      clientIdSha256Expectation: "source-pinned",
      fileCount: frozen.tree.fileCount,
      compositeSha256: frozen.tree.compositeSha256,
    },
  };
  const cleanupState = {
    child: null,
    config,
    instance: null,
    knownProcesses: new Map(),
    observer: null,
    profile: null,
    rootRecord: null,
    runId: null,
    tempRoot: null,
  };
  let copiedBuild = null;
  let cleanup = null;
  let cleanupResult = {
    stopped: { stopped: true, ownershipUncertain: false, forcedSignals: [] },
    disposed: { disposed: true, method: "not-created" },
  };
  let phase = "prepare";
  let proofFailure;
  try {
    assertNoPersonalBrowsersRunning([config.id]);
    cleanupState.runId = crypto.randomUUID();
    cleanupState.tempRoot = mkdtempSync(path.join(os.tmpdir(), `inbox-island-native-${config.id}-`));
    writeFileSync(path.join(cleanupState.tempRoot, ".inbox-island-proof-owner.json"), `${JSON.stringify({
      schema: "inbox-island.native-proof-owner.v1",
      runId: cleanupState.runId,
    })}\n`, { mode: 0o600, flag: "wx" });
    cleanupState.profile = path.join(cleanupState.tempRoot, "disposable-profile");
    copiedBuild = path.join(cleanupState.tempRoot, "read-only-build");
    mkdirSync(cleanupState.profile, { mode: 0o700 });
    cleanup = createIdempotentCleanup(async () => {
      const stopped = await closeDisposableBrowser(cleanupState);
      let disposed = { disposed: false, method: "preserved-fail-closed" };
      if (stopped.stopped && !stopped.ownershipUncertain) {
        disposed = await trashDisposableRoot(cleanupState.tempRoot, cleanupState.runId);
      }
      return Object.freeze({ stopped, disposed });
    });
    signalCoordinator.register(cleanup);
    assert.equal((await readdir(cleanupState.profile)).length, 0);
    phase = "copy-build";
    await cp(buildRoot, copiedBuild, { recursive: true });
    const copiedTree = await treeProof(copiedBuild);
    assert.equal(copiedTree.compositeSha256, frozen.tree.compositeSha256);
    assert.equal(copiedTree.fileCount, frozen.tree.fileCount);
    await makeTreeReadOnly(copiedBuild);
    receipt.disposable = {
      freshProfileEntryCount: 0,
      copiedBuildReadOnly: true,
      copiedBuildCompositeSha256: copiedTree.compositeSha256,
    };

    phase = "launch";
    const instance = await launchBrowser(config, cleanupState.profile, copiedBuild, cleanupState);
    const commandLine = await instance.cdp.send("Browser.getBrowserCommandLine");
    const commandArguments = commandLine.arguments || [];
    assert(commandArguments.includes(`--user-data-dir=${cleanupState.profile}`));
    assert(commandArguments.includes(`--inbox-island-native-proof-owner=${cleanupState.runId}`));
    assert(commandArguments.includes(`--load-extension=${copiedBuild}`));
    assert(commandArguments.includes(`--disable-extensions-except=${copiedBuild}`));
    assert(commandArguments.includes("--remote-debugging-port=0"));
    receipt.launch = {
      mode: "headed native app",
      disposableUserDataDirVerified: true,
      spawnOwnershipTokenVerified: true,
      readOnlyBuildLoadVerified: true,
      disableExtensionsExceptVerified: true,
      ephemeralRemoteDebuggingVerified: true,
      browserProtocol: instance.devtools.version.ProtocolVersion || null,
      browserProduct: instance.devtools.version.Browser || null,
    };
    const chromiumMajor = Number(instance.devtools.version.Browser?.match(/\/(\d+)/u)?.[1]);
    if (!Number.isSafeInteger(chromiumMajor) || chromiumMajor < 145) {
      fail("BROWSER_CHROMIUM_TOO_OLD", `${config.label} does not expose Chromium 145 or newer`);
    }
    receipt.launch.chromiumMajor = chromiumMajor;
    phase = "runtime";
    const bootstrap = await instance.context.newPage();
    await bootstrap.goto(`chrome-extension://${expected.extensionId}/${expected.popupPath}`);
    await bootstrap.waitForFunction(() => document.documentElement.dataset.popupState === "ready");
    const worker = await waitForWorker(instance.context);
    const workerProof = await inspectWorker(worker);
    assert.equal(workerProof.runtimeId, expected.extensionId);
    assert.equal(workerProof.version, expected.version);
    assert.deepEqual(workerProof.permissions, ["identity"]);
    assert.equal(workerProof.hasOauth2, false);
    assert.equal(workerProof.popup,
      `chrome-extension://${expected.extensionId}/${expected.popupPath}`);
    assert.equal(workerProof.redirectUri, expected.redirectUri);
    receipt.runtime = {
      extensionId: workerProof.runtimeId,
      version: workerProof.version,
      permissions: workerProof.permissions,
      manifestOauth2Present: workerProof.hasOauth2,
      popup: workerProof.popup,
      redirectUri: workerProof.redirectUri,
    };
    phase = "surfaces";
    const surfaces = await provePopupAndFullPage(instance, worker, workerProof, bootstrap);
    await bootstrap.close();
    receipt.actionPopup = surfaces.popup;
    receipt.fullPage = surfaces.surface;
    phase = "oauth-cancel";
    receipt.chooser = await proveChooserCancellation(
      instance,
      surfaces.fullPage,
      frozen.clientId,
      instance.observer,
    );
    phase = "storage";
    const storage = await readStorageBoundary(surfaces.fullPage);
    assert.equal(storage.accountKeyCount, 0);
    assert.equal(storage.derivedKeyCount, 0);
    assert.equal(storage.localStorageKeyCount, 0);
    assert.equal(storage.sessionStorageKeyCount, 0);
    receipt.storage = storage;
    receipt.network = {
      accountsGoogleRequestCount: instance.observer.summary.accountsGoogleRequestCount,
      exactOauthEndpointRequestCount: instance.observer.summary.exactOauthEndpointRequestCount,
      gmailApiRequestCount: instance.observer.summary.gmailApiRequestCount,
      oauthCallbackObserved: instance.observer.summary.oauthCallbackObserved,
    };
    assert(instance.observer.summary.accountsGoogleRequestCount >= 1);
    assert(instance.observer.summary.exactOauthEndpointRequestCount >= 1);
    assert.equal(instance.observer.summary.gmailApiRequestCount, 0);
    assert.equal(instance.observer.summary.oauthCallbackObserved, false);

    phase = "integrity";
    const [canonicalAfter, copiedAfter] = await Promise.all([
      treeProof(buildRoot),
      treeProof(copiedBuild),
    ]);
    assert.equal(canonicalAfter.compositeSha256, frozen.tree.compositeSha256);
    assert.equal(copiedAfter.compositeSha256, frozen.tree.compositeSha256);
    receipt.build.postProofCompositeSha256 = canonicalAfter.compositeSha256;
    receipt.build.copiedPostProofCompositeSha256 = copiedAfter.compositeSha256;
    receipt.verdict = "PASS";
  } catch (error) {
    proofFailure = error;
    receipt.verdict = "FAIL";
    receipt.failure = receiptFailure(error, phase);
  } finally {
    phase = "cleanup";
    try {
      if (cleanup) cleanupResult = await cleanup();
      if (!cleanupResult.stopped.stopped || cleanupResult.stopped.ownershipUncertain
        || !cleanupResult.disposed.disposed) {
        throw new ProofError("DISPOSABLE_CLEANUP_FAILED", "Disposable proof state was preserved fail closed");
      }
    } catch (cleanupError) {
      if (cleanupResult.disposed.method === "not-created" && cleanupState.tempRoot) {
        cleanupResult = {
          stopped: { stopped: false, ownershipUncertain: true, forcedSignals: [] },
          disposed: { disposed: false, method: "preserved-fail-closed" },
        };
      }
      receipt.verdict = "FAIL";
      receipt.cleanupFailure = receiptFailure(cleanupError, "cleanup");
      if (!proofFailure) proofFailure = cleanupError?.code
        ? cleanupError : new ProofError("DISPOSABLE_CLEANUP_FAILED", sanitizeError(cleanupError));
    } finally {
      if (cleanup) signalCoordinator.clear(cleanup);
    }
    receipt.cleanup = {
      browserStopped: cleanupResult.stopped.stopped,
      ownershipUncertain: cleanupResult.stopped.ownershipUncertain,
      forcedSignals: cleanupResult.stopped.forcedSignals,
      profileDisposed: cleanupResult.disposed.disposed,
      method: cleanupResult.disposed.method || null,
    };
    receipt.completedAt = new Date().toISOString();
    await writeReceipt(receiptPath, receipt, [
      frozen.clientId,
      cleanupState.tempRoot,
      cleanupState.profile,
      copiedBuild,
    ]);
  }
  if (proofFailure) throw proofFailure;
  return Object.freeze({ path: receiptPath, receipt: Object.freeze(receipt) });
}

async function preflight(browserIds) {
  assertInteractiveDesktopUnlocked();
  assertNoPersonalBrowsersRunning(browserIds);
  const installs = {};
  for (const browserId of browserIds) {
    installs[browserId] = await inspectBrowserInstall(browserConfigs[browserId]);
  }
  const frozen = await assertFrozenBuild();
  return { frozen, installs };
}

async function writePairedSummary(receiptDirectory, batchId, results) {
  if (results.length !== 2 || results.some(({ receipt }) => receipt.verdict !== "PASS")) return null;
  const [first, second] = results;
  if (first.receipt.build.compositeSha256 !== second.receipt.build.compositeSha256
    || first.receipt.build.clientIdSha256 !== second.receipt.build.clientIdSha256
    || first.receipt.build.version !== second.receipt.build.version) {
    fail("PAIRED_SUMMARY_MISMATCH", "Browser receipts do not prove the same frozen release");
  }
  const summaryPath = path.join(
    receiptDirectory,
    `native-pilot-${expected.version}-${batchId}-paired-summary.json`,
  );
  await writeReceipt(summaryPath, {
    schema: "inbox-island.native-portable-paired-summary.v1",
    batchId,
    recordedAt: new Date().toISOString(),
    verdict: "PASS",
    build: {
      version: first.receipt.build.version,
      extensionId: first.receipt.build.extensionId,
      clientIdSha256: first.receipt.build.clientIdSha256,
      compositeSha256: first.receipt.build.compositeSha256,
    },
    browsers: results.map(({ path: receiptPath, receipt }) => ({
      id: receipt.browser.id,
      receipt: path.basename(receiptPath),
      verdict: receipt.verdict,
    })),
  });
  return summaryPath;
}

async function main(signalCoordinator) {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const { frozen, installs } = await preflight(options.browsers);
  if (options.preflightOnly) {
    console.log(JSON.stringify({
      verdict: "PREFLIGHT_PASS",
      browsers: options.browsers.map((id) => ({ id, ...installs[id] })),
      build: {
        extensionId: expected.extensionId,
        version: expected.version,
        redirectUri: expected.redirectUri,
        clientIdSha256: frozen.clientIdSha256,
        fileCount: frozen.tree.fileCount,
        compositeSha256: frozen.tree.compositeSha256,
      },
    }, null, 2));
    return;
  }
  const batchId = createBatchId();
  const results = [];
  for (const browserId of options.browsers) {
    assertNoPersonalBrowsersRunning([browserId]);
    results.push(await runBrowserProof(
      browserConfigs[browserId],
      installs[browserId],
      frozen,
      options.receiptDirectory,
      batchId,
      signalCoordinator,
    ));
  }
  const summaryPath = await writePairedSummary(options.receiptDirectory, batchId, results);
  console.log(`Native portable proof passed: ${[
    ...results.map(({ path: receiptPath }) => receiptPath),
    ...(summaryPath ? [summaryPath] : []),
  ].join(", ")}`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const signalCoordinator = createSignalCleanupCoordinator();
  const removeSignalHandlers = installSignalHandlers(signalCoordinator);
  main(signalCoordinator)
    .catch((error) => {
      console.error(`${error?.code || "NATIVE_PROOF_FAILED"}: ${sanitizeError(error)}`);
      process.exitCode = 1;
    })
    .finally(removeSignalHandlers);
}
