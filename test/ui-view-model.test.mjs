import assert from "node:assert/strict";
import test from "node:test";
import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { normalizeMailbox } from "../src/gmail-normalize.mjs";
import { runSyntheticTriage } from "../src/pipeline.mjs";
import {
  BUCKET_META,
  BUCKET_PRIORITY,
  VIEW_META,
  buildUiRows,
  deriveViewCounts,
  filterUiRows,
} from "../app/view-model.mjs";
import { gmailThreadUrl } from "../app/render.mjs";

const fixedNow = () => new Date("2026-10-08T00:00:00.000Z");

async function fixtureRows() {
  const output = await runSyntheticTriage(syntheticMailbox, { now: fixedNow });
  return buildUiRows(output, normalizeMailbox(syntheticMailbox.messages));
}

test("metadata defines the complete bucket priority and named filters", () => {
  assert.deepEqual(BUCKET_PRIORITY, [
    "reply", "attention", "uncertain", "waiting", "record", "noise",
  ]);
  assert.deepEqual(BUCKET_META.map(({ id, priority }) => [id, priority]), [
    ["reply", 0], ["attention", 1], ["uncertain", 2],
    ["waiting", 3], ["record", 4], ["noise", 5],
  ]);
  assert.deepEqual(VIEW_META.map(({ id }) => id), [
    "all", "needs-me", "review", "waiting", "record", "noise",
  ]);
  assert.ok(Object.isFrozen(BUCKET_META));
  assert.ok(Object.isFrozen(VIEW_META));
});

test("Gmail thread links target the selected account and exact thread", () => {
  assert.equal(
    gmailThreadUrl({ accountId: "person+pilot@example.com", threadId: "thread-123" }),
    "https://mail.google.com/mail/u/?authuser=person%2Bpilot%40example.com#all/thread-123",
  );
});

test("rows expose safe display fields in deterministic priority order", async () => {
  const rows = await fixtureRows();
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map(({ bucket }) => bucket), [
    "reply",
    "attention", "attention",
    "uncertain", "uncertain", "uncertain", "uncertain",
    "uncertain", "uncertain", "uncertain", "uncertain",
    "waiting",
    "record", "record",
    "noise",
  ]);
  assert.deepEqual(rows.filter(({ bucket }) => bucket === "attention").map(({ threadId }) => (
    threadId
  )), ["m-phish", "m-attention"]);
  assert.deepEqual(rows.filter(({ bucket }) => bucket === "record").map(({ threadId }) => (
    threadId
  )), ["m-attachment", "m-record"]);

  const reply = rows[0];
  assert.equal(reply.subject, "Budget question");
  assert.equal(reply.from, "Sender <sender@example.test>");
  assert.equal(reply.latestTimestamp, "2026-10-01T16:01:00.000Z");
  assert.equal(reply.deadline.text, "Friday at 5pm");
  assert.match(reply.requestedAction, /decide whether to reply/u);
});

test("review contains only genuinely uncertain threads, not internal parser signals", async () => {
  const rows = await fixtureRows();
  assert.deepEqual(deriveViewCounts(rows), {
    all: 15,
    "needs-me": 3,
    review: 8,
    waiting: 1,
    record: 2,
    noise: 1,
  });
  assert.deepEqual(filterUiRows(rows, { view: "needs-me" }).map(({ threadId }) => threadId), [
    "m-reply", "m-phish", "m-attention",
  ]);
  const reviewIds = filterUiRows(rows, { view: "review" }).map(({ threadId }) => threadId);
  assert.equal(reviewIds.length, 8);
  assert.equal(reviewIds.includes("m-phish"), false, "attention mail is not duplicated in review");
  assert.equal(reviewIds.includes("m-attachment"), false, "record mail is not duplicated in review");
  assert.ok(reviewIds.includes("m-ambiguous"), "risk-free uncertain mail remains in review");
});

test("benign hidden-layout metadata alone does not create a review obligation", () => {
  const row = {
    bucket: "noise",
    riskFlags: ["hidden_content"],
    subject: "Offer",
    from: "sender@example.test",
    summary: "Offer summary",
    requestedAction: null,
    deadline: null,
    evidence: [],
  };
  assert.deepEqual(filterUiRows([row], { view: "review" }), []);
});

test("search is case-insensitive and uses only displayed row data", async () => {
  const rows = await fixtureRows();
  assert.deepEqual(filterUiRows(rows, { search: "BUDGET" }).map(({ threadId }) => threadId), [
    "m-reply",
  ]);
  assert.deepEqual(filterUiRows(rows, {
    view: "all",
    search: "ATTACHMENT_UNSUPPORTED",
  }).map(({ threadId }) => threadId), ["m-attachment"]);
  assert.deepEqual(filterUiRows(rows, { search: "evil.example.test" }).map(({ threadId }) => (
    threadId
  )), ["m-phish"]);
  assert.deepEqual(filterUiRows(rows, { search: "not present" }), []);
});

test("rows are immutable and retain no raw message body or active URL fields", async () => {
  const rows = await fixtureRows();
  assert.ok(Object.isFrozen(rows));
  for (const row of rows) {
    assert.ok(Object.isFrozen(row));
    assert.ok(Object.isFrozen(row.riskFlags));
    assert.ok(Object.isFrozen(row.evidence));
    assert.equal(Object.hasOwn(row, "body"), false);
    assert.equal(Object.hasOwn(row, "html"), false);
    assert.equal(Object.hasOwn(row, "url"), false);
    assert.equal(Object.hasOwn(row, "href"), false);
    assert.equal(Object.hasOwn(row, "messages"), false);
    for (const evidence of row.evidence) {
      assert.deepEqual(Object.keys(evidence).sort(), ["field", "kind", "messageId", "quote"]);
      assert.ok(Object.isFrozen(evidence));
    }
  }
  assert.throws(() => { rows[0].subject = "changed"; }, TypeError);
});

test("invalid inputs and unknown filters fail closed", async () => {
  const rows = await fixtureRows();
  assert.throws(() => filterUiRows(rows, { view: "bogus" }), /UNKNOWN_VIEW/u);
  assert.throws(() => filterUiRows(rows, { search: null }), /INVALID_SEARCH/u);
  assert.throws(() => deriveViewCounts(null), /INVALID_ROWS/u);
  assert.throws(() => buildUiRows({}, []), /INVALID_VIEW_MODEL_INPUT/u);
});
