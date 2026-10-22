#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(extensionRoot, "..");
const manifestPath = path.join(extensionRoot, "manifest.json");
const identityPath = path.join(extensionRoot, "identity.json");
const iconSizes = [16, 32, 48, 128];
const failures = [];
const expectedVersion = "0.4.8";
const oauthClientId = /^\d{6,32}-[a-z0-9]{16,128}\.apps\.googleusercontent\.com$/u;

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function json(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    failures.push(`Cannot parse ${file}: ${error.message}`);
    return {};
  }
}

async function filesBelow(root, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(root, relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output.sort();
}

function extensionId(publicKey) {
  try {
    const bytes = Buffer.from(publicKey || "", "base64");
    check(bytes.toString("base64") === publicKey, "manifest key must be canonical base64 DER");
    const key = crypto.createPublicKey({ key: bytes, format: "der", type: "spki" });
    check(key.asymmetricKeyType === "rsa", "manifest key must contain an RSA public key");
    return crypto.createHash("sha256").update(bytes).digest().subarray(0, 16).toString("hex")
      .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
  } catch (error) {
    failures.push(`Cannot validate manifest key: ${error.message}`);
    return "";
  }
}

async function expectedBuildFiles() {
  const files = ["manifest.json", "background.mjs", ".inbox-island-build.json"];
  files.push(...(await filesBelow(projectRoot, "app")));
  files.push(...(await filesBelow(projectRoot, "src")));
  files.push("fixtures/synthetic-mailbox.mjs");
  files.push(...iconSizes.map((size) => `icons/icon${size}.png`));
  return files.sort();
}

function sourceFileForBuild(relative) {
  if (relative === "manifest.json" || relative === "background.mjs"
    || relative.startsWith("icons/")) {
    return path.join(extensionRoot, relative);
  }
  return path.join(projectRoot, relative);
}

async function validateUiSources() {
  const allowedUrls = new Map([
    ["app/gmail-api.mjs", new Set(["https://gmail.googleapis.com"])],
    ["app/render.mjs", new Set(["https://mail.google.com/mail/u/"])],
    ["app/gmail-auth.mjs", new Set([
      "https://${runtimeApi.id}.chromiumapp.org/oauth2",
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://www.googleapis.com/auth/gmail.readonly",
    ])],
  ]);
  for (const relative of await filesBelow(projectRoot, "app")) {
    const file = path.join(projectRoot, relative);
    const source = await readFile(file, "utf8");
    const urls = [...source.matchAll(/\bhttps?:\/\/[^\s"'`]+/gu)].map(([url]) => url);
    check(urls.every((url) => allowedUrls.get(relative)?.has(url)),
      `${relative} references a non-allowlisted URL`);
    if (relative !== "app/gmail-api.mjs") {
      check(!/\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\s*\(/u.test(source),
        `${relative} crosses the network boundary`);
    }
    if (relative.endsWith(".mjs")) {
      check(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/u.test(source),
        `${relative} uses an unsafe HTML sink`);
    }
    if (relative.endsWith(".html")) {
      check(!/<style\b/iu.test(source), `${relative} contains inline style`);
      check(!/<script(?![^>]*\bsrc=)[^>]*>/iu.test(source), `${relative} contains inline script`);
      check(!/\son[a-z]+\s*=/iu.test(source), `${relative} contains an inline event handler`);
    }
  }
}

const manifest = await json(manifestPath);
const identity = await json(identityPath);
check(manifest.manifest_version === 3, "manifest_version must be 3");
check(manifest.name === "Inbox Island", "manifest must use the canonical product name");
check(manifest.version === expectedVersion,
  `private pilot manifest version must be ${expectedVersion}`);
check(manifest.minimum_chrome_version === "145", "minimum Chrome version must be 145");
check(JSON.stringify(manifest.permissions) === JSON.stringify(["sidePanel", "identity"]),
  "the only declared permissions must be sidePanel and identity");
check(JSON.stringify(manifest.host_permissions) === JSON.stringify([
  "https://gmail.googleapis.com/*",
]), "the only host permission must be the Gmail API origin");
check(!Object.hasOwn(manifest, "oauth2"),
  "Web-client pilot must not declare a manifest OAuth block");
for (const forbidden of [
  "optional_permissions", "optional_host_permissions",
  "content_scripts", "externally_connectable", "web_accessible_resources",
]) check(!(forbidden in manifest), `manifest must not declare ${forbidden}`);

check(JSON.stringify(manifest.background) === JSON.stringify({
  service_worker: "background.mjs",
  type: "module",
}), "background must reset the withdrawn direct-panel preference");
const backgroundSource = await readFile(path.join(extensionRoot, "background.mjs"), "utf8");
check(!/\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\s*\(/u.test(backgroundSource)
  && !/\bhttps?:\/\//u.test(backgroundSource),
"background service worker must not cross the network boundary");
check(/openPanelOnActionClick:\s*false/u.test(backgroundSource)
  && /POPUP_PATH\s*=\s*["']app\/popup\.html["']/u.test(backgroundSource)
  && /action\.setPopup/u.test(backgroundSource)
  && /action\.getPopup/u.test(backgroundSource)
  && /sidePanel\.getPanelBehavior/u.test(backgroundSource)
  && /tabs\.create/u.test(backgroundSource)
  && /void\s+ensureToolbarLauncher\(\)/u.test(backgroundSource)
  && !/action\.onClicked/u.test(backgroundSource),
"background must immediately verify popup migration, progressively disable direct action ownership, and expose a visible fallback");

const expectedCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src https://gmail.googleapis.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
check(manifest.content_security_policy?.extension_pages === expectedCsp,
  "extension page CSP must match the reviewed Gmail-only network policy");
check(manifest.action?.default_popup === "app/popup.html",
  "toolbar click must always expose the browser-owned popup launcher");
check(manifest.action?.default_title === "Open Inbox Island",
  "toolbar tooltip must describe the visible launcher");
check(manifest.side_panel?.default_path === "app/index.html", "side panel must use app/index.html");

const derivedId = extensionId(manifest.key);
check(derivedId === "jeemdbgakejlmmmbngpihndfkjiddbhl", "manifest key derives the wrong ID");
check(identity.extension_id === derivedId && identity.web_store_item_id === derivedId,
  "identity record must match the manifest key");
check(identity.google_cloud_project_id === "inbox-island", "identity must retain clean GCP project");
check(identity.oauth_client_type === "web-application", "OAuth client must be Web application type");
check(identity.oauth_client_name === "Inbox Island Browser OAuth", "OAuth label drifted");
check(identity.oauth_flow === "launchWebAuthFlow-implicit-private-pilot", "OAuth flow drifted");
check(identity.oauth_client_status === "active-private-pilot",
  "private-pilot Web OAuth client is not active");
check(oauthClientId.test(identity.oauth_client_id || ""),
  "canonical extension OAuth client ID is missing or invalid");
check(identity.gmail_scope === "https://www.googleapis.com/auth/gmail.readonly",
  "OAuth identity record must retain only gmail.readonly");
check(!Object.keys(identity).some((key) => /secret/iu.test(key)),
  "identity record must never contain a secret-bearing field");
const authSource = await readFile(path.join(projectRoot, "app", "gmail-auth.mjs"), "utf8");
check(/launchWebAuthFlow/u.test(authSource)
  && /prompt:\s*["']select_account["']/u.test(authSource)
  && /interactive:\s*true/u.test(authSource)
  && !/getAuthToken|getProfileUserInfo/u.test(authSource),
"auth source must use explicit browser Web OAuth without profile binding");

for (const size of iconSizes) {
  const relative = `icons/icon${size}.png`;
  check(manifest.icons?.[size] === relative, `manifest.icons.${size} must reference ${relative}`);
  check(manifest.action?.default_icon?.[size] === relative,
    `action.default_icon.${size} must reference ${relative}`);
  check(existsSync(path.join(extensionRoot, relative)), `${relative} is missing`);
}
await validateUiSources();

const unpackedFlag = process.argv.indexOf("--unpacked");
if (unpackedFlag >= 0) {
  const argument = process.argv[unpackedFlag + 1];
  check(Boolean(argument), "--unpacked requires a directory");
  if (argument) {
    const unpacked = path.resolve(process.cwd(), argument);
    check(existsSync(unpacked), `unpacked build is missing: ${unpacked}`);
    if (existsSync(unpacked)) {
      const actual = await filesBelow(unpacked);
      const expected = await expectedBuildFiles();
      check(JSON.stringify(actual) === JSON.stringify(expected),
        `unpacked file list differs:\n${actual.join("\n")}`);
      for (const relative of expected.filter((file) => file !== ".inbox-island-build.json")) {
        const [sourceBytes, builtBytes] = await Promise.all([
          readFile(sourceFileForBuild(relative)),
          readFile(path.join(unpacked, relative)),
        ]);
        check(sourceBytes.equals(builtBytes), `unpacked byte drift: ${relative}`);
        check(!/GOCSPX-|client_secret/iu.test(builtBytes.toString("utf8")),
          `unpacked build contains secret-shaped content: ${relative}`);
      }
      const builtManifest = await json(path.join(unpacked, "manifest.json"));
      check(JSON.stringify(builtManifest) === JSON.stringify(manifest),
        "unpacked manifest differs from source manifest");
      const marker = await json(path.join(unpacked, ".inbox-island-build.json"));
      check(marker.artifact === "gmail-pilot-unpacked" && marker.gmailOauthEnabled === true
        && marker.gmailConnected === false && marker.browserPortable === true
        && marker.oauthClientType === "web-application"
        && marker.oauthMode === "launchWebAuthFlow-implicit-private-pilot"
        && marker.extensionVersion === expectedVersion,
        "unpacked build marker is invalid");
    }
  }
}

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Validated portable private Gmail pilot ${expectedVersion}: exact read-only OAuth, ID ${derivedId}.`);
