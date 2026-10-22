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

test("Chrome Web Store kit matches the packaged privacy and release contract", async () => {
  const [manifest, packageScript, validator, disclosureSource, listing, privacy,
    reviewer, checklist, assetReceipt, sbom] = await Promise.all([
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
  ]);

  assert.equal(manifest.version, "0.4.9");
  assert.deepEqual(manifest.permissions, ["identity"]);
  assert.deepEqual(manifest.host_permissions, ["https://gmail.googleapis.com/*"]);
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
  assert.match(checklist, /Google OAuth restricted-scope verification will continue separately/u);

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
  assert.equal(sbom.packages[0].versionInfo, "0.4.9");
  assert.match(sbom.packages[0].comment, /neither ships in the extension/iu);
});
