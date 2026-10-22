# RESOURCES — Inbox Island

## Internal evidence and reusable patterns

2026-09-25 · int · sibling `lobster-chat` project · Privacy promises, immutable local-model assets, worker containment, cache/integrity proof, and honest non-guarantee patterns.
2026-09-25 · int · local PII-screener UX research · Local-first UX and honest privacy-copy lessons.
2026-09-25 · int · sibling `mailreef` project · Hostile-email, read-only capability isolation, exact-scope OAuth, typed evidence, and fail-closed test patterns; its broker/plugin architecture is not reused here.
2026-09-25 · int · agent activation memory · Real-mail proof must not be claimed while the screened read lane is unavailable.

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
