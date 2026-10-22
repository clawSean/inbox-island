# Local BGE bakeoff

## Decision

**Reject this six-prototype BGE classifier.** Its original run was private and
fast enough to study, but its quality was not good enough for Inbox Island. Do
not integrate it into the extension or tune its gates against this corpus.

The deterministic pipeline remains authoritative. BGE was allowed to classify
only clean threads that the deterministic pipeline had already left
`uncertain`; it never generated summaries, actions, deadlines, or evidence.

## Historical proof

- 42 newly authored synthetic/adversarial threads, balanced at 7 per class:
  `reply`, `attention`, `waiting`, `record`, `noise`, and `uncertain`.
- Zero exact raw or valid-normalized overlap with the existing product fixture.
- Six semantic prototypes and their acceptance gate were frozen before the
  first scored model run.
- Exact cached `Xenova/bge-small-en-v1.5` revision
  `ea104dacec62c0de699686887e3f920caeb4f3e3`.
- Exact read-only Transformers.js 4.2.0 and ORT Web bytes from Lobster Chat.
- No installs, downloads, production-source edits, or extension edits.

## Results

| Metric | Deterministic | Deterministic + BGE |
|---|---:|---:|
| Exact accuracy | 16/42 (`0.380952`) | 17/42 (`0.404762`) |
| Macro-F1 | `0.308333` | `0.299769` |
| Reply + attention recall | 2/14 (`0.142857`) | 3/14 (`0.214286`) |
| False-important | `0` | `0` |
| Uncertain | 33/42 (`0.785714`) | 25/42 (`0.595238`) |
| Unsafe → noise | `0` | `0` |

BGE saw 28 clean uncertain threads. The gate accepted 8 and only 1 was right
(`0.125` accepted accuracy). Seven false accepts were labeled `waiting`,
including reply, attention, and noise mail. Raw top-1 accuracy was only 7/28
(`0.25`). Macro-F1 therefore fell despite one extra exact answer and fewer
uncertain results. `record` and `noise` recall remained zero.

## Privacy, safety, and runtime proof

- Chrome `154.0.8037.98` exposed WebGPU and returned a WebGPU adapter.
- Requested device: `webgpu`; silent model fallback was disabled.
- Simulated missing WebGPU chose deterministic-only and requested zero model
  assets.
- Strict CSP allowed only same-origin scripts, workers, and connections.
- External browser requests attempted: `0`; local requests: `11`; page and
  console errors: `0`.
- Six risk-bearing threads were kept out of BGE; unsafe-to-noise stayed `0`.
- 34-text batch (6 prototypes + 28 threads), 384 dimensions. The persisted
  receipt records the exact load, first-inference, and warm-inference timings
  for its run; those machine timings naturally vary between runs.
- Warm repeat delta was `0`; normalized prototype vector norms round to `1` at
  the receipt's six-decimal precision.
- The executable proof is split into focused modules; the largest is 220 lines.

## Reproduction boundary

[`receipt.json`](./receipt.json) preserves the original result with local path
metadata redacted. Its six experiment modules retain equivalent proof logic and
match the recorded public hashes; the eight runtime/model assets retain their
original hashes and sizes. The runner, however, imports the mutable production pipeline,
normalizer, transitive core, and product fixture; those original production
bytes were not snapshotted or hashed in the receipt. After the deterministic
core changed, rerunning the runner changed its baseline and hybrid metrics.

Do **not** run it in this canonical tree: it would evaluate the rejected model
against today's core and overwrite the historical receipt. Current
deterministic metrics come from `npm run quality:development`. Any future model
evaluation must use a fresh prospective corpus and hash or snapshot its full
transitive production dependency set before scoring.

## Limitations

This is a small synthetic corpus authored by the same implementer as the
prototypes. Its historical bytes are frozen and exact-text-disjoint, but it was
not independently blinded and is now inspected development data. The timings
are one headless local Chrome run with warm local files. The proof is for a
strict local web page, not Manifest V3 packaging or representative devices.
