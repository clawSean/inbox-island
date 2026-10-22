#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const expectedHash = "1eb9f4d0e1f924347315f751f6762e4fb2f7718c315857f97ad2e09f3cb18a54";
const expectedEntries = [
  "icons/icon128.png", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png",
  "manifest.json", "popup.css", "popup.html",
];
const archive = path.resolve(process.cwd(), process.argv[2]
  || "extension/dist/inbox-island-webstore-seed-0.1.0.zip");
const bytes = await readFile(archive);
const digest = crypto.createHash("sha256").update(bytes).digest("hex");

function entries(zip) {
  const earliest = Math.max(0, zip.length - 65_557);
  let eocd = -1;
  for (let cursor = zip.length - 22; cursor >= earliest; cursor -= 1) {
    if (zip.readUInt32LE(cursor) === 0x06054b50) {
      eocd = cursor;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP_EOCD_NOT_FOUND");
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP_DIRECTORY_INVALID");
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const start = cursor + 46;
    names.push(zip.toString("utf8", start, start + nameLength));
    cursor = start + nameLength + extraLength + commentLength;
  }
  return names.sort();
}

if (digest !== expectedHash) throw new Error(`SEED_HASH_MISMATCH:${digest}`);
const actualEntries = entries(bytes);
if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
  throw new Error(`SEED_ENTRIES_MISMATCH:${actualEntries.join(",")}`);
}
console.log(`Validated immutable 0.1.0 seed: 7 files, SHA-256 ${digest}.`);
