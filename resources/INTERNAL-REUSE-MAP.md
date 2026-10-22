# Internal Reuse Map

This project owns the product design and any future implementation. Existing
projects remain canonical for their own artifacts; copy lessons deliberately,
not whole private trees, and never create compatibility aliases.

## Portal Privacy Check

Canonical source: sibling `lobster-chat` project.

Reuse or adapt:

- `src/privacy-model-assets.mjs` — release-bound asset manifests, sizes, hashes,
  cache keys, and runtime/model separation.
- `public/privacy-model-worker.js` — browser-local worker and WebGPU setup.
- `ops/verify-privacy-cache.mjs` — cold/reload/relaunch transfer and integrity
  proof.
- `ops/verify-privacy-model.mjs` — WebGPU, quality, preservation, and zero-egress
  proof patterns.
- `ops/verify-privacy-ui.mjs` — browser recovery, accessibility, responsive,
  stale-action, and failure-state proof.
- `VISION.md` and the privacy UX review — honest claims, visible boundary,
  local clear-data controls, and synthetic-before-real-data posture.

Do not infer:

- Portal's Privacy Filter is a useful email triage/summarization model.
- Portal's current device support or 809 MB cache is acceptable for this product.
- Portal's synthetic-beta evidence authorizes real confidential email use.
- Lobster Chat's server/auth architecture belongs in a client-only email tool.

## Mailreef screened email boundary

Canonical source: sibling `mailreef` project.

Reuse or adapt:

- `VISION.md` — every email is hostile; isolation and typed validation are
  stronger than detection.
- `docs/ARCHITECTURE.md` — normalized inputs, typed output, evidence binding,
  and fail-closed stages.
- `scripts/bootstrap_mailreef_oauth.py` — expected-account and exact-scope
  checks as behavioral requirements.
- `mailreef-plugin/scripts/check.mjs` and `tests/` — schema, exact-evidence,
  OAuth, caller-boundary, and adversarial-message failure cases.
- `SECURITY.md` and `BASELINE_PLUGIN_AUDIT.md` — proof categories and known
  residual-risk framing.

Do not infer:

- Mailreef's OpenClaw/plugin/broker/model architecture belongs in a browser
  extension.
- Its Desktop OAuth/broker/plugin architecture should be copied into a website
  or Chrome extension.
- Its model/tool boundaries prove browser-extension isolation.
- Its maximum five-message/seven-day contract fits inbox triage.

## Workspace knowledge and memory

- Local PII-screener UX research — privacy UX should unblock with usable output
  while keeping technical detail behind contextual disclosure.
- Local-first screener landscape research — evaluation, quality, and
  non-guarantee lessons.
- Agent activation memory — consult before any test involving a real mailbox;
  never infer that a screened mail lane is live.

## Anti-drift boundary

- This project may link to those sources and port reviewed patterns later.
- It must not edit Portal or Mailreef to satisfy its own roadmap.
- Shared code becomes a deliberately extracted package only after two real
  consumers and an explicit ownership/API decision exist.
- Runtime, test, and policy claims remain attached to the exact project and
  revision that produced their evidence.
