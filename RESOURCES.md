# RESOURCES — Inbox Island

## Internal evidence and reusable patterns

2026-09-25 · int · `/Users/Sean/projects/lobster-chat/VISION.md` · Canonical privacy promises and honest non-guarantee language for the existing browser-local Privacy Check.
2026-09-25 · int · `/Users/Sean/projects/lobster-chat/src/privacy-model-assets.mjs` · Immutable model/runtime asset manifest and integrity metadata pattern.
2026-09-25 · int · `/Users/Sean/projects/lobster-chat/public/privacy-model-worker.js` · Browser worker, WebGPU runtime, and model-loading implementation reference.
2026-09-25 · int · `/Users/Sean/projects/lobster-chat/ops/verify-privacy-cache.mjs` · Cold, reload, relaunch, cache-integrity, and transfer-count proof pattern.
2026-09-25 · int · `/Users/Sean/projects/lobster-chat/ops/verify-privacy-model.mjs` · Real WebGPU quality, model binding, and egress proof pattern.
2026-09-25 · int · `/Users/Sean/projects/lobster-chat/ops/verify-privacy-ui.mjs` · Browser interaction, recovery, accessibility, and responsive proof harness pattern.
2026-09-25 · int · `/Users/Sean/.openclaw/workspace/knowledge/research/pii-screener-ux-review-2026-09-02.md` · Local-first UX and honest privacy-copy lessons.
2026-09-25 · int · `/Users/Sean/projects/mailreef/VISION.md` · Existing hostile-email and read-only capability-isolation principles; canonical project renamed to Mailreef on 2026-10-08.
2026-09-25 · int · `/Users/Sean/projects/mailreef/docs/ARCHITECTURE.md` · Gmail broker, untrusted-source, and schema-bound output reference.
2026-09-25 · int · `/Users/Sean/projects/mailreef/scripts/bootstrap_mailreef_oauth.py` · Exact-scope, expected-account, local PKCE, and private credential-handling reference; not directly reusable as browser code.
2026-09-25 · int · `/Users/Sean/projects/mailreef/tests/` · Adversarial email and OAuth failure-test inventory reference.
2026-09-25 · int · `/Users/Sean/.openclaw/workspace/MEMORY.md` · Current warning that Sean's screened Gmail capability is disabled and must not be misrepresented as live proof for this product.

## External primary sources

2026-09-25 · ext · `https://developers.google.com/workspace/gmail/api/auth/scopes` · `gmail.readonly` capability and restricted-scope classification; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/workspace/gmail/api/guides/sync` · Full sync, `historyId`, partial sync, and history-expiry behavior; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/workspace/gmail/api/guides/list-messages` · Mailbox search, pagination, message IDs, and separate full-content retrieval; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification` · Verification, exceptions, and server-path security-assessment trigger; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/terms/api-services-user-data-policy` · Limited-use, disclosure, retention, security, and restricted-data obligations; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/workspace/workspace-api-user-data-developer-policy` · Workspace-specific minimum-permission, transparent-use, and user-data requirements; fetched HTTP 200.
2026-09-25 · ext · `https://developers.google.com/identity/oauth2/web/guides/use-token-model` · Backendless web token model, user-driven authorization, short-lived token behavior, and direct API calls; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/reference/api/identity` · Extension OAuth/identity surface; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle` · Manifest V3 worker termination and persistence constraints; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/reference/api/offscreen` · Hidden-document/worker capability and lifecycle constraints; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/reference/api/sidePanel` · Persistent side-panel product surface; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure` · Chrome extension least-privilege, isolation, and secure-coding guidance; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/webstore/program-policies/user-data-faq` · Chrome Web Store disclosure, handling, and privacy-policy requirements; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements` · Manifest V3 remote-code restrictions relevant to bundled runtimes and downloaded model assets; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies` · Extension storage surfaces and service-worker availability; fetched HTTP 200.
2026-09-25 · ext · `https://developer.chrome.com/docs/ai/built-in` · Browser-managed local AI APIs as an optional future runtime, not a committed dependency; fetched HTTP 200.
2026-09-25 · ext · `https://www.nist.gov/privacy-framework` · Privacy-risk vocabulary for the public security/compliance packet; fetched HTTP 200.

## Project-owned synthesis

2026-09-25 · int · `resources/ARCHITECTURE.md` · Reference architecture, trust zones, data flow, sync shape, storage posture, and website-to-extension path.
2026-09-25 · int · `resources/SECURITY-COMPLIANCE.md` · Threat model, mandatory controls, evidence gates, and honest organizational/compliance boundary.
2026-09-25 · int · `resources/INTERNAL-REUSE-MAP.md` · Exact internal source paths, reusable lessons, and anti-drift boundaries.
2026-09-25 · int · `resources/SOURCE-NOTES-2026-09-25.md` · Dated primary-source findings and revalidation triggers.
