import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { normalizeGmailMessage } from "../src/gmail-normalize.mjs";
import { runSyntheticTriage } from "../src/pipeline.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedNow = () => new Date("2026-10-08T00:00:00.000Z");

test("core performs no network operation while processing mailbox content", async () => {
  const calls = [];
  const previous = new Map();
  for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"]) {
    previous.set(name, globalThis[name]);
    globalThis[name] = (...args) => {
      calls.push([name, ...args]);
      throw new Error("NETWORK_FORBIDDEN");
    };
  }
  try {
    const output = await runSyntheticTriage(syntheticMailbox, { now: fixedNow });
    assert.equal(output.threadCount, 15);
    assert.deepEqual(calls, []);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

test("browser core has no Node or network-client import and no network primitive call", async () => {
  const sourceRoot = path.join(projectRoot, "src");
  for (const name of await readdir(sourceRoot)) {
    if (!name.endsWith(".mjs")) continue;
    const source = await readFile(path.join(sourceRoot, name), "utf8");
    assert.doesNotMatch(source, /from\s+["']node:|require\s*\(/u, name);
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon|importScripts)\s*\(/u, name);
    assert.doesNotMatch(source, /\b(?:https?|wss?):\/\//u, name);
  }
});

test("fixed-seed malformed-input fuzz never throws or emits unbounded fields", () => {
  let state = 0x12345678;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let index = 0; index < 1_000; index += 1) {
    const raw = {
      id: random() % 3 ? `fuzz-${index}` : { polluted: true },
      threadId: random() % 4 ? `thread-${random() % 20}` : "bad thread / value",
      internalDate: random() % 2 ? String(random()) : "not-a-date",
      labelIds: random() % 2 ? ["INBOX"] : { invalid: true },
      payload: random() % 3 ? {
        mimeType: random() % 2 ? "text/plain" : "text/html",
        headers: random() % 2 ? [{ name: "Subject", value: `Fuzz ${random()}` }] : null,
        body: { data: random() % 2 ? "bm9uLXNlY3JldA" : "%%%" },
      } : null,
    };
    const normalized = normalizeGmailMessage(raw);
    assert.ok(normalized.id.length <= 160);
    assert.ok(normalized.threadId.length <= 160);
    assert.ok(normalized.body.length <= 48_000);
  }
});
