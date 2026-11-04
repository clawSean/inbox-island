import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pngSize(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("Chrome Web Store kit matches the packaged Chrome-first public-release contract", async () => {
  const [manifest, packageScript, validator, disclosureSource, listing, privacy,
    reviewer, checklist, assetReceipt, sbom, packageJson, status, roadmap,
    setup, pilot, verification] = await Promise.all([
    readFile(path.join(root, "extension/manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "scripts/package-web-store.mjs"), "utf8"),
    readFile(path.join(root, "extension/scripts/validate.mjs"), "utf8"),
    readFile(path.join(root, "app/index.html"), "utf8"),
    readFile(path.join(root, "webstore/LISTING.md"), "utf8"),
    readFile(path.join(root, "webstore/PRIVACY-PRACTICES.md"), "utf8"),
    readFile(path.join(root, "webstore/TEST-INSTRUCTIONS.md"), "utf8"),
    readFile(path.join(root, "webstore/SUBMISSION-CHECKLIST.md"), "utf8"),
    readFile(path.join(root, "webstore/assets/ASSET-HASHES.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "webstore/SBOM.spdx.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "STATUS.md"), "utf8"),
    readFile(path.join(root, "ROADMAP.md"), "utf8"),
    readFile(path.join(root, "resources/JPOP-GOOGLE-SETUP.md"), "utf8"),
    readFile(path.join(root, "resources/JPOP-PILOT-INSTALL.md"), "utf8"),
    readFile(path.join(root, "resources/GOOGLE-OAUTH-VERIFICATION.md"), "utf8"),
  ]);

  assert.equal(manifest.version, "0.5.0");
  assert.deepEqual(manifest.permissions, ["identity"]);
  assert.deepEqual(manifest.host_permissions, ["https://gmail.googleapis.com/*"]);
  assert.deepEqual(manifest.oauth2, {
    client_id: "270655843779-4gktio587oago4rsgh3609te7h4eoe6r.apps.googleusercontent.com",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  assert.ok(!Object.hasOwn(manifest, "side_panel"));
  assert.match(disclosureSource, /bounded recent Inbox\/Sent slice for on-device triage/u);
  assert.match(disclosureSource, /id="run-button"[^>]*aria-describedby="gmail-disclosure"/u);
  assert.match(packageScript, /delete manifest\.key/u);
  assert.match(packageScript, /--webstore-unpacked/u);
  assert.match(packageScript, /PACKAGE_REQUIRES_CLEAN_GIT_TREE/u);
  assert.match(validator, /Web Store package must omit the development-only manifest key/u);
  assert.match(listing, /Google classifies `gmail\.readonly` as a restricted scope/u);
  assert.match(privacy, /does not send that data to an Inbox Island server or\s+>\s+cloud AI/u);
  assert.match(reviewer, /No credentials or Google account are required/u);
  assert.match(reviewer, /Google Chrome/u);
  assert.match(checklist, /Google Chrome-only/u);
  assert.match(checklist, /Google restricted-scope verification/u);
  assert.match(checklist, /live-account Chrome pilot/u);
  assert.match(checklist, /Do not manually publish/u);
  assert.match(reviewer, /project is In Production and has no test-user dependency/u);
  assert.match(setup, /Basic → Editor/u);
  assert.match(setup, /Do not add Sean as\s+ a test user/iu);
  assert.match(status, /Do not add any test user/u);
  assert.match(roadmap, /Do not create or maintain test users/u);
  assert.match(pilot, /No test-user list\s+ exists in the pilot path/u);
  assert.match(verification, /No test users are added or\s+removed/u);
  assert.doesNotMatch(reviewer, /temporary test user/iu);
  assert.doesNotMatch(status, /Add Sean's Google identity as a project test user/iu);
  assert.doesNotMatch(roadmap, /Add a dedicated test account/iu);
  assert.doesNotMatch(pilot, /after JPop adds it as a test user/iu);
  assert.equal(packageJson.scripts["build:seed"], "sh extension/scripts/build-webstore-seed.sh");
  assert.match(packageJson.scripts["validate:extension"], /npm run build:seed/u);

  assert.equal(assetReceipt.syntheticDataOnly, true);
  assert.equal(assetReceipt.externalRequests, 0);
  for (const entry of assetReceipt.files) {
    const bytes = await readFile(path.join(root, "webstore/assets", entry.file));
    assert.equal(sha256(bytes), entry.sha256);
    const expected = entry.file === "store-icon-128.png"
      ? { width: 128, height: 128 } : { width: 1280, height: 800 };
    assert.deepEqual(pngSize(bytes), expected);
  }
  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.equal(sbom.packages[0].versionInfo, "0.5.0");
  assert.match(sbom.packages[0].comment, /neither ships in the extension/iu);
});
