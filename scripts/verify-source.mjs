#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.private, true);
assert.equal(packageJson.dependencies, undefined);
assert.equal(packageJson.devDependencies, undefined);

let files = 0;
for (const name of await readdir(path.join(root, "src"))) {
  if (!name.endsWith(".mjs")) continue;
  files += 1;
  const source = await readFile(path.join(root, "src", name), "utf8");
  assert.ok(source.split("\n").length <= 220, `${name} exceeds the 220-line source budget`);
  assert.doesNotMatch(source, /from\s+["']node:|require\s*\(/u, `${name} imports Node`);
  assert.doesNotMatch(
    source,
    /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon|importScripts)\s*\(/u,
    `${name} calls a network primitive`,
  );
  assert.doesNotMatch(source, /\b(?:https?|wss?):\/\//u, `${name} embeds a network URL`);
}
assert.ok(files >= 7);
console.log(`Verified ${files} dependency-free browser-core modules with no network clients or URLs.`);
