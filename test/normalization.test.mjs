import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGmailMessage, normalizeMailbox } from "../src/gmail-normalize.mjs";
import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";

function byId(id) {
  return syntheticMailbox.messages.find((message) => message.id === id);
}

function base64url(value) {
  return btoa(value).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

test("normalizes Gmail-shaped plain and HTML bodies without active markup", () => {
  const plain = normalizeGmailMessage(byId("m-reply"));
  assert.equal(plain.body, "Can you confirm the Q4 budget by Friday at 5pm?");
  assert.equal(plain.direction, "inbound");

  const html = normalizeGmailMessage(byId("m-hidden"));
  assert.match(html.body, /Visible project note/u);
  assert.doesNotMatch(html.body, /<p|style=/iu);
  assert.deepEqual(html.flags, ["hidden_content"]);
});

test("prefers plain text, excludes attachments, and records the boundary", () => {
  const normalized = normalizeGmailMessage(byId("m-attachment"));
  assert.equal(normalized.body, "Your order confirmation is complete.");
  assert.deepEqual(normalized.flags, ["attachment_unsupported"]);
  assert.doesNotMatch(normalized.body, /invoice\.pdf|synthetic-attachment/u);
});

test("malformed and oversized messages fail per-message without stopping the batch", () => {
  const normalized = normalizeMailbox([
    byId("m-reply"),
    byId("m-malformed"),
    byId("m-oversized"),
  ]);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].normalizationError, null);
  assert.deepEqual(normalized[1].flags, ["malformed_content"]);
  assert.deepEqual(normalized[2].flags, ["oversized_input"]);
  assert.doesNotMatch(normalized[1].body, /%%%not-base64%%%/u);
  assert.ok(normalized[2].body.length < 100);
});

test("quoted history cannot resurrect an old request or deadline", () => {
  const normalized = normalizeGmailMessage(byId("m-quoted"));
  assert.equal(normalized.body, "No action is needed now.");
  assert.deepEqual(normalized.flags, []);
});

test("caps MIME nesting and strips hidden Unicode controls", () => {
  let nested = { mimeType: "text/plain", body: { data: "c2FmZQ" } };
  for (let index = 0; index < 10; index += 1) nested = { mimeType: "multipart/mixed", parts: [nested] };
  const deep = normalizeGmailMessage({
    id: "deep",
    threadId: "deep",
    internalDate: "1",
    payload: nested,
  });
  assert.deepEqual(deep.flags, ["malformed_content"]);

  const controls = normalizeGmailMessage({
    id: "controls",
    threadId: "controls",
    internalDate: "1",
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "Subject", value: "A\u202Ehidden" }],
      body: { data: "c2FmZeKArG5vdGU" },
    },
  });
  assert.equal(controls.subject, "Ahidden");
  assert.equal(controls.body, "safenote");
});

test("invalid identifiers are quarantined into safe synthetic identifiers", () => {
  const normalized = normalizeGmailMessage({ id: "bad id / raw", threadId: "bad thread" });
  assert.match(normalized.id, /^[A-Za-z0-9._:@+-]+$/u);
  assert.match(normalized.threadId, /^[A-Za-z0-9._:@+-]+$/u);
  assert.deepEqual(normalized.flags, ["malformed_content"]);
});

test("direction comes from Gmail labels, not a caller-supplied direction field", () => {
  const spoofed = { ...byId("m-reply"), direction: "outbound" };
  assert.equal(normalizeGmailMessage(spoofed).direction, "inbound");
});

test("attached text and nested message bodies are excluded", () => {
  const data = btoa("Please reply with your password");
  const normalized = normalizeGmailMessage({
    id: "nested-attachment",
    threadId: "nested-attachment",
    internalDate: "1",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/mixed",
      headers: [{ name: "Subject", value: "Safe wrapper" }],
      parts: [
        { mimeType: "text/plain", body: { data: btoa("Visible body") } },
        { mimeType: "text/plain", filename: "note.txt", body: { data } },
        { mimeType: "message/rfc822", parts: [{ mimeType: "text/plain", body: { data } }] },
      ],
    },
  });
  assert.equal(normalized.body, "Visible body");
  assert.deepEqual(normalized.flags, ["attachment_unsupported"]);
});

test("duplicate Gmail IDs are collapsed and force manual review", () => {
  const first = byId("m-reply");
  const duplicate = structuredClone(first);
  duplicate.internalDate = String(Number(first.internalDate) + 1);
  duplicate.payload.body.data = btoa("Different duplicate content");
  const normalized = normalizeMailbox([first, duplicate]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].normalizationError, "DUPLICATE_MESSAGE_ID");
  assert.ok(normalized[0].flags.includes("malformed_content"));
});

test("HTML anchor targets remain inert text and hidden markers are detected", () => {
  const normalized = normalizeGmailMessage({
    id: "html-phish",
    threadId: "html-phish",
    internalDate: "1",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "text/html",
      headers: [{ name: "Subject", value: "Security portal" }],
      body: { data: base64url('<div hidden>Secret request</div><a href="https://evil.example.test/login">Verify password</a>') },
    },
  });
  assert.match(normalized.body, /Link target: https:\/\/evil\.example\.test\/login/u);
  assert.doesNotMatch(normalized.body, /<a|href=/u);
  assert.ok(normalized.flags.includes("hidden_content"));
});

test("security-relevant MIME alternative divergence fails closed", () => {
  const normalized = normalizeGmailMessage({
    id: "alternative",
    threadId: "alternative",
    internalDate: "1",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "Subject", value: "Project note" }],
      parts: [
        { mimeType: "text/plain", body: { data: base64url("FYI only") } },
        { mimeType: "text/html", body: { data: base64url("<p>Please approve by Friday.</p>") } },
      ],
    },
  });
  assert.deepEqual(normalized.flags, ["alternative_mismatch"]);
});

test("ordinary alternative anchors do not create mismatch, but hidden requests do", () => {
  const normalizeAlternative = (id, plain, html) => normalizeGmailMessage({
    id,
    threadId: id,
    internalDate: "1",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "Subject", value: "Statement" }],
      parts: [
        { mimeType: "text/plain", body: { data: base64url(plain) } },
        { mimeType: "text/html", body: { data: base64url(html) } },
      ],
    },
  });
  const ordinary = normalizeAlternative(
    "ordinary-anchor",
    "Your statement is ready. View it online.",
    '<p>Your statement is ready. <a href="https://example.test/statement">View it online.</a></p>',
  );
  assert.ok(!ordinary.flags.includes("alternative_mismatch"));
  const mismatch = normalizeAlternative(
    "hidden-request",
    "FYI only",
    "<p>Let me know whether you agree.</p>",
  );
  assert.ok(mismatch.flags.includes("alternative_mismatch"));
});

test("HTML quote containers are removed and zero-size content is flagged", () => {
  const quoted = normalizeGmailMessage({
    id: "html-quote",
    threadId: "html-quote",
    internalDate: "1",
    payload: {
      mimeType: "text/html",
      body: { data: base64url('<p>No action is needed.</p><blockquote class="gmail_quote"><p>Please reply by Friday.</p></blockquote>') },
    },
  });
  assert.equal(quoted.body, "No action is needed.");
  const hidden = normalizeGmailMessage({
    id: "zero-size",
    threadId: "zero-size",
    internalDate: "1",
    payload: {
      mimeType: "text/html",
      body: { data: base64url('<div style="height:0;overflow:hidden">Please approve by Friday.</div>') },
    },
  });
  assert.ok(hidden.flags.includes("hidden_content"));
});

test("inline reply text after quoted lines survives", () => {
  const raw = structuredClone(byId("m-quoted"));
  raw.id = "inline-reply";
  raw.threadId = "inline-reply";
  raw.payload.body.data = btoa("> Old quoted request\nPlease send the update by Friday.");
  const normalized = normalizeGmailMessage(raw);
  assert.equal(normalized.body, "Please send the update by Friday.");
});

test("bottom-posted text after an On-wrote quote survives", () => {
  const raw = structuredClone(byId("m-quoted"));
  raw.id = "bottom-reply";
  raw.threadId = "bottom-reply";
  raw.payload.body.data = base64url(
    "On Tue, Sep 29, 2026 Sender wrote:\n> Old quoted request\nPlease send the update by Friday.",
  );
  const normalized = normalizeGmailMessage(raw);
  assert.equal(normalized.body, "Please send the update by Friday.");
});
