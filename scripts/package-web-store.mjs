#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(root, "extension", "build");
const distRoot = path.join(root, "extension", "dist");
const receiptPath = path.join(root, "webstore", "PACKAGE-RECEIPT.json");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const outputName = `inbox-island-web-store-${packageJson.version}.zip`;
const outputPath = path.join(distRoot, outputName);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "inbox-island-webstore-package-"));
const stagedRoot = path.join(tempRoot, "staged");
const extractedRoot = path.join(tempRoot, "extracted");
const tempArchive = path.join(tempRoot, outputName);
const fixedTime = new Date("2000-01-01T00:00:00.000Z");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout || ""}`);
  }
  return (result.stdout || "").trim();
}

async function filesBelow(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(directory, relative));
    else if (entry.isFile()) output.push(relative);
    else throw new Error(`PACKAGE_NON_FILE_ENTRY:${relative}`);
  }
  return output.sort();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function treeReceipt(directory) {
  const files = await filesBelow(directory);
  const composite = crypto.createHash("sha256");
  for (const relative of files) {
    const digest = sha256(await readFile(path.join(directory, relative)));
    composite.update(relative).update("\0").update(digest).update("\0");
  }
  return { compositeSha256: composite.digest("hex"), fileCount: files.length };
}

async function byteCompare(leftRoot, rightRoot) {
  const [leftFiles, rightFiles] = await Promise.all([filesBelow(leftRoot), filesBelow(rightRoot)]);
  if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) throw new Error("PACKAGE_FILE_LIST_DRIFT");
  for (const relative of leftFiles) {
    const [left, right] = await Promise.all([
      readFile(path.join(leftRoot, relative)), readFile(path.join(rightRoot, relative)),
    ]);
    if (!left.equals(right)) throw new Error(`PACKAGE_BYTE_DRIFT:${relative}`);
  }
}

try {
  const dirty = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { capture: true });
  if (dirty) throw new Error("PACKAGE_REQUIRES_CLEAN_GIT_TREE");
  await access(buildRoot, constants.R_OK);
  await mkdir(distRoot, { recursive: true });
  await mkdir(extractedRoot, { recursive: true });
  await cp(buildRoot, stagedRoot, { recursive: true, errorOnExist: true });
  await rm(path.join(stagedRoot, ".inbox-island-build.json"));

  const manifestPath = path.join(stagedRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== packageJson.version) throw new Error("PACKAGE_VERSION_DRIFT");
  if (!Object.hasOwn(manifest, "key")) throw new Error("PACKAGE_SOURCE_KEY_MISSING");
  delete manifest.key;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const relative of await filesBelow(stagedRoot)) {
    await chmod(path.join(stagedRoot, relative), 0o644);
    await utimes(path.join(stagedRoot, relative), fixedTime, fixedTime);
  }

  run(process.execPath, ["extension/scripts/validate.mjs", "--webstore-unpacked", stagedRoot]);
  const files = await filesBelow(stagedRoot);
  run("zip", ["-X", "-q", tempArchive, ...files], { cwd: stagedRoot });
  run("unzip", ["-q", tempArchive, "-d", extractedRoot]);
  await byteCompare(stagedRoot, extractedRoot);
  run(process.execPath, ["extension/scripts/validate.mjs", "--webstore-unpacked", extractedRoot]);

  const archiveBytes = await readFile(tempArchive);
  const stagedTree = await treeReceipt(stagedRoot);
  const extractedTree = await treeReceipt(extractedRoot);
  if (stagedTree.compositeSha256 !== extractedTree.compositeSha256) {
    throw new Error("PACKAGE_TREE_HASH_DRIFT");
  }
  for (const relative of files) {
    if (/\.(?:pem|key|p8|der)$/iu.test(relative)) throw new Error(`PRIVATE_KEY_FILE:${relative}`);
    const bytes = await readFile(path.join(stagedRoot, relative));
    if (/GOCSPX-|client_secret/iu.test(bytes.toString("utf8"))) {
      throw new Error(`SECRET_SHAPED_CONTENT:${relative}`);
    }
  }

  let existing = null;
  try {
    existing = await readFile(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing && !existing.equals(archiveBytes)) throw new Error("PACKAGE_OUTPUT_EXISTS_WITH_DIFFERENT_BYTES");
  if (!existing) await copyFile(tempArchive, outputPath, constants.COPYFILE_EXCL);

  const sourceCommit = run("git", ["rev-parse", "HEAD"], { capture: true });
  const sourceCommitTime = run("git", ["show", "-s", "--format=%cI", "HEAD"], { capture: true });
  const receipt = {
    schemaVersion: "inbox-island-webstore-package-v1",
    version: packageJson.version,
    itemId: "jeemdbgakejlmmmbngpihndfkjiddbhl",
    sourceCommit,
    sourceCommitTime,
    archive: {
      file: `extension/dist/${outputName}`,
      sha256: sha256(archiveBytes),
      size: archiveBytes.length,
    },
    packageTree: stagedTree,
    checks: {
      manifestAtArchiveRoot: files.includes("manifest.json"),
      manifestKeyRemoved: !Object.hasOwn(manifest, "key"),
      extractedByteParity: true,
      extractedRevalidated: true,
      privateKeyFiles: 0,
      secretShapedFiles: 0,
    },
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  const normalized = path.resolve(tempRoot);
  if (!normalized.startsWith(`${path.resolve(os.tmpdir())}${path.sep}inbox-island-webstore-package-`)) {
    throw new Error("REFUSED_UNSAFE_TEMP_CLEANUP");
  }
  await rm(normalized, { force: true, recursive: true });
}
