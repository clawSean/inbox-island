import crypto from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function filesBelow(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function treeDigest(root, files) {
  const rows = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    rows.push(`${relative}\0${sha256}`);
  }
  return {
    files: rows.length,
    sha256: crypto.createHash("sha256").update(`${rows.join("\n")}\n`).digest("hex"),
  };
}

export async function writeUiReceipt(report) {
  const sourceFiles = [
    "package.json",
    "extension/background.mjs",
    "extension/identity.json",
    "extension/manifest.json",
    "extension/scripts/build-pilot.mjs",
    "extension/scripts/validate.mjs",
    "fixtures/synthetic-mailbox.mjs",
    "scripts/run-ui-proof.mjs",
    "scripts/ui-proof-actions.mjs",
    "scripts/ui-proof-assertions.mjs",
    "scripts/ui-proof-server.mjs",
    "scripts/ui-receipt.mjs",
    "test/ui-view-model.test.mjs",
    "test/panel-launch.test.mjs",
    ...await filesBelow(projectRoot, "app"),
    ...await filesBelow(projectRoot, "src"),
  ].sort();
  const buildRoot = path.join(projectRoot, "extension", "build");
  const buildFiles = await filesBelow(buildRoot);
  const screenshotFiles = report.screenshots.map((file) => `artifacts/${file}`);
  const receipt = {
    schema: "inbox-island-synthetic-ui-proof-v1",
    proofDate: "2026-10-09",
    report,
    sourceTree: await treeDigest(projectRoot, sourceFiles),
    builtExtensionTree: await treeDigest(buildRoot, buildFiles),
    screenshots: await Promise.all(screenshotFiles.map(async (file) => ({
      file,
      sha256: crypto.createHash("sha256").update(await readFile(path.join(projectRoot, file)))
        .digest("hex"),
    }))),
    limitations: [
      "This proof serves the exact unpacked pilot build over loopback HTTP and exercises its synthetic fallback.",
      "Native chrome-extension surfaces are recorded in separate version-specific receipts.",
      "The manifest and app include OAuth/Gmail capability, but this proof uses no consent, token, or real mailbox data.",
      "A production local model remains unselected.",
    ],
  };
  const target = path.join(projectRoot, "artifacts", "synthetic-ui-proof-2026-10-09.json");
  await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
