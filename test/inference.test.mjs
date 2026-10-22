import assert from "node:assert/strict";
import test from "node:test";
import { syntheticMailbox } from "../fixtures/synthetic-mailbox.mjs";
import { ENGINE_VERSION, INFERENCE_ENGINE_VERSION } from "../src/contracts.mjs";
import { INFERENCE_CANDIDATE_VERSION } from "../src/inference.mjs";
import { runSyntheticTriage } from "../src/pipeline.mjs";

const fixedNow = () => new Date("2026-10-08T00:00:00.000Z");
const ambiguousOnly = {
  accountId: syntheticMailbox.accountId,
  messages: syntheticMailbox.messages.filter(({ id }) => id === "m-ambiguous"),
};

test("inference provenance advances with its deterministic base", () => {
  assert.equal(
    INFERENCE_ENGINE_VERSION.match(/v\d+$/u)?.[0],
    ENGINE_VERSION.match(/v\d+$/u)?.[0],
  );
});

function candidate(input, overrides = {}) {
  const source = input.messages.at(-1);
  return {
    schemaVersion: INFERENCE_CANDIDATE_VERSION,
    threadId: input.threadId,
    bucket: "record",
    confidence: 0.75,
    summary: "Context-only information with no requested response.",
    requestedAction: null,
    deadline: null,
    evidence: [{
      kind: "classification",
      messageId: source.id,
      field: "body",
      start: 0,
      end: source.body.length,
      quote: source.body,
    }],
    ...overrides,
  };
}

test("accepts a closed, source-safe local inference candidate", async () => {
  const output = await runSyntheticTriage(ambiguousOnly, {
    now: fixedNow,
    infer: async (input) => candidate(input),
  });
  assert.equal(output.results[0].bucket, "record");
  assert.match(output.results[0].reasons.at(-1), /Validated local inference/u);
});

test("invalid, stale, throwing, and timed-out inference fail closed", async (context) => {
  const cases = [
    ["unknown key", async (input) => ({ ...candidate(input), extra: true })],
    ["stale thread", async (input) => candidate(input, { threadId: "stale" })],
    ["fabricated evidence", async (input) => candidate(input, {
      evidence: [{
        kind: "request",
        messageId: "m-ambiguous",
        field: "body",
        start: 0,
        end: 12,
        quote: "fabricated!!",
      }],
    })],
    ["active URL in summary", async (input) => candidate(input, {
      summary: "Open https://example.test now.",
    })],
    ["exception", async () => { throw new Error("private raw model prose"); }],
    ["uppercase secret-shaped exception", async () => { throw new Error("SECRET_TOKEN"); }],
    ["timeout", async () => new Promise(() => {})],
  ];
  for (const [name, infer] of cases) {
    await context.test(name, async () => {
      const output = await runSyntheticTriage(ambiguousOnly, {
        now: fixedNow,
        infer,
        timeoutMs: 10,
      });
      assert.equal(output.results[0].bucket, "uncertain");
      assert.equal(output.results[0].confidence, 0);
      assert.doesNotMatch(JSON.stringify(output), /private raw model prose/u);
      assert.doesNotMatch(JSON.stringify(output), /SECRET_TOKEN/u);
    });
  }
});

test("unsafe input never reaches the inference adapter", async () => {
  let calls = 0;
  const hostile = {
    accountId: syntheticMailbox.accountId,
    messages: syntheticMailbox.messages.filter(({ id }) => id === "m-injection"),
  };
  const output = await runSyntheticTriage(hostile, {
    now: fixedNow,
    infer: async (input) => {
      calls += 1;
      return candidate(input, { bucket: "noise" });
    },
  });
  assert.equal(calls, 0);
  assert.equal(output.results[0].bucket, "uncertain");
  assert.deepEqual(output.results[0].riskFlags, ["prompt_injection"]);
});

test("inference cannot override deterministic risk, deadline, or direction buckets", async () => {
  let calls = 0;
  const phishing = {
    accountId: syntheticMailbox.accountId,
    messages: syntheticMailbox.messages.filter(({ id }) => id === "m-phish"),
  };
  const output = await runSyntheticTriage(phishing, {
    now: fixedNow,
    infer: async (input) => {
      calls += 1;
      return candidate(input, { bucket: "record" });
    },
  });
  assert.equal(calls, 0);
  assert.equal(output.results[0].bucket, "attention");
  assert.ok(output.results[0].evidence.some(({ kind }) => kind === "credential-risk"));
  assert.ok(output.results[0].evidence.some(({ kind }) => kind === "suspicious-link"));

  for (const id of ["m-attention", "m-reply", "m-wait-out"]) {
    const mailbox = {
      accountId: syntheticMailbox.accountId,
      messages: syntheticMailbox.messages.filter((message) => (
        id === "m-wait-out" ? message.threadId === "t-waiting" : message.id === id
      )),
    };
    await runSyntheticTriage(mailbox, {
      now: fixedNow,
      infer: async (input) => {
        calls += 1;
        return candidate(input, { bucket: "noise" });
      },
    });
  }
  assert.equal(calls, 0);
});

test("candidate buckets require consistent evidence and waiting remains direction-owned", async () => {
  for (const overrides of [{ evidence: [] }, { bucket: "waiting" }, { bucket: "reply" }]) {
    const output = await runSyntheticTriage(ambiguousOnly, {
      now: fixedNow,
      infer: async (input) => candidate(input, overrides),
    });
    assert.equal(output.results[0].bucket, "uncertain");
    assert.equal(output.results[0].confidence, 0);
  }
});

test("inference cannot classify an exact extracted deadline as noise", async () => {
  const body = "Tomorrow at 9am is the project kickoff.";
  const data = btoa(body).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
  const output = await runSyntheticTriage({
    accountId: syntheticMailbox.accountId,
    messages: [{
      id: "model-deadline",
      threadId: "model-deadline",
      internalDate: "1",
      labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "Subject", value: "Project kickoff" }],
        body: { data },
      },
    }],
  }, {
    now: fixedNow,
    infer: async (input) => {
      const source = input.messages.at(-1);
      const span = {
        messageId: source.id,
        field: "body",
        start: 0,
        end: source.body.length,
        quote: source.body,
      };
      return candidate(input, {
        bucket: "noise",
        deadline: { ...span, text: "Tomorrow at 9am" },
        evidence: [{ kind: "deadline", ...span }],
      });
    },
  });
  assert.equal(output.results[0].bucket, "uncertain");
  assert.equal(output.results[0].confidence, 0);
});

test("deadline text must be inside its exact source-bound deadline evidence", async () => {
  const output = await runSyntheticTriage(ambiguousOnly, {
    now: fixedNow,
    infer: async (input) => {
      const source = input.messages.at(-1);
      const span = {
        messageId: source.id,
        field: "body",
        start: 0,
        end: source.body.length,
        quote: source.body,
      };
      return candidate(input, {
        deadline: { ...span, text: "Tomorrow at 9am" },
        evidence: [{ kind: "deadline", ...span }],
      });
    },
  });
  assert.equal(output.results[0].bucket, "uncertain");
  assert.equal(output.results[0].confidence, 0);
});

test("timeout signals cooperative cancellation", async () => {
  let aborted = false;
  const output = await runSyntheticTriage(ambiguousOnly, {
    now: fixedNow,
    timeoutMs: 10,
    infer: async (_input, { signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        resolve(null);
      }, { once: true });
    }),
  });
  assert.equal(aborted, true);
  assert.equal(output.results[0].bucket, "uncertain");
  assert.equal(output.results[0].confidence, 0);
});

test("validated model output is deeply immutable and detached from the candidate", async () => {
  let emitted;
  const output = await runSyntheticTriage(ambiguousOnly, {
    now: fixedNow,
    infer: async (input) => {
      emitted = candidate(input);
      return emitted;
    },
  });
  emitted.evidence[0].quote = "changed";
  assert.equal(output.results[0].evidence[0].quote, "Sharing this for context.");
  assert.equal(Object.isFrozen(output.results[0].evidence), true);
  assert.equal(Object.isFrozen(output.results[0].evidence[0]), true);
});

test("inference receives Gmail threads in chronological order", async () => {
  const make = (id, time, body) => ({
    id,
    threadId: "reverse-order",
    internalDate: String(time),
    labelIds: ["INBOX"],
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "Subject", value: "FYI" }],
      body: { data: btoa(body).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "") },
    },
  });
  let order;
  await runSyntheticTriage({
    accountId: syntheticMailbox.accountId,
    messages: [make("newest", 2, "Later context."), make("oldest", 1, "Earlier context.")],
  }, {
    now: fixedNow,
    infer: async (input) => {
      order = input.messages.map(({ id }) => id);
      return candidate(input);
    },
  });
  assert.deepEqual(order, ["oldest", "newest"]);
});
