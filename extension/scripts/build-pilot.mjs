#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(extensionRoot, "..");
const buildRoot = path.join(extensionRoot, "build");
const identity = JSON.parse(await readFile(path.join(extensionRoot, "identity.json"), "utf8"));
const sourceManifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8"));
const authSource = await readFile(path.join(projectRoot, "app", "gmail-auth.mjs"), "utf8");
const oauthClientId = /^\d{6,32}-[a-z0-9]{16,128}\.apps\.googleusercontent\.com$/u;

if (buildRoot !== path.join(projectRoot, "extension", "build")) {
  throw new Error("UNSAFE_BUILD_PATH");
}
if (sourceManifest.version !== "0.4.8"
  || identity.oauth_client_type !== "web-application"
  || identity.oauth_client_status !== "active-private-pilot"
  || !oauthClientId.test(identity.oauth_client_id || "")
  || Object.keys(identity).some((key) => /secret/iu.test(key))
  || Object.hasOwn(sourceManifest, "oauth2")
  || !authSource.includes(`PILOT_OAUTH_CLIENT_ID = "${identity.oauth_client_id}"`)
  || !authSource.includes("launchWebAuthFlow")) {
  throw new Error("PORTABLE_OAUTH_CLIENT_NOT_FROZEN");
}

await rm(buildRoot, { force: true, recursive: true });
await mkdir(buildRoot, { recursive: true });

await cp(path.join(extensionRoot, "manifest.json"), path.join(buildRoot, "manifest.json"));
await cp(path.join(extensionRoot, "background.mjs"), path.join(buildRoot, "background.mjs"));
await mkdir(path.join(buildRoot, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await cp(
    path.join(extensionRoot, "icons", `icon${size}.png`),
    path.join(buildRoot, "icons", `icon${size}.png`),
  );
}
await cp(path.join(projectRoot, "app"), path.join(buildRoot, "app"), { recursive: true });
await cp(path.join(projectRoot, "src"), path.join(buildRoot, "src"), { recursive: true });
await mkdir(path.join(buildRoot, "fixtures"), { recursive: true });
await cp(
  path.join(projectRoot, "fixtures", "synthetic-mailbox.mjs"),
  path.join(buildRoot, "fixtures", "synthetic-mailbox.mjs"),
);

const manifest = JSON.parse(await readFile(path.join(buildRoot, "manifest.json"), "utf8"));
const marker = {
  artifact: "gmail-pilot-unpacked",
  browserPortable: true,
  extensionVersion: manifest.version,
  gmailOauthEnabled: true,
  gmailConnected: false,
  generated: true,
  oauthClientType: "web-application",
  oauthMode: "launchWebAuthFlow-implicit-private-pilot",
};
await writeFile(path.join(buildRoot, ".inbox-island-build.json"), `${JSON.stringify(marker, null, 2)}\n`);

console.log(`Built private Gmail pilot extension at ${buildRoot}`);
