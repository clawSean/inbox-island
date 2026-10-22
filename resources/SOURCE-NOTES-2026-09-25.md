# Primary-Source Notes — 2026-09-25

These are dated orientation notes, not substitutes for live policy. Recheck the
linked primary source before OAuth submission, Chrome Web Store submission,
model/runtime adoption, or public privacy/compliance claims.

## Gmail capability and synchronization

- Google classifies `gmail.readonly` as a **restricted** scope. It can view
  messages and settings and is the least Gmail scope that supports whole-mailbox
  body reading without mutation.
- `gmail.metadata` is also restricted and excludes bodies, so it cannot provide
  useful summary/action extraction by itself.
- `messages.list` returns IDs/thread IDs and supports Gmail search, labels,
  pagination, and bounded result counts. Full content requires `messages.get`.
- Google's client-sync guidance uses an initial full sync, caches a recent
  `historyId`, and uses `history.list` for later partial sync.
- History records are not permanent. An expired cursor can return HTTP 404 and
  requires a new full sync; the product must bound and explain that recovery.

Primary sources:

- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/list-messages
- https://developers.google.com/workspace/gmail/api/guides/sync

## OAuth and Google policy

- Public consumer apps requesting restricted scopes need verification unless
  they qualify for a documented exception.
- Google states that apps able to access restricted data from or through a
  third-party server need an annual security assessment. This design removes
  that server path, but the exemption must be confirmed through Google's review.
- A backendless website can obtain short-lived access tokens from a user-driven
  Google Identity Services flow and call Google APIs directly. Expired tokens
  require another access-token request; the site does not gain silent always-on
  behavior for free.
- Google policies require minimum permissions, accurate disclosure, secure
  handling, limited use, and user control. "We do not have a backend" does not
  eliminate verification, privacy-policy, or disclosure obligations.

Primary sources:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/terms/api-services-user-data-policy
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Chrome extension architecture and distribution

- Manifest V3 service workers are intentionally terminable. Durable queues and
  state must live in storage rather than globals.
- Side panels provide a persistent extension UI beside web content without
  making Gmail DOM scraping the ingestion mechanism.
- Offscreen documents can host DOM/worker-dependent work but have constrained
  extension API access and require a declared reason; use only when the visible
  extension page cannot own the job.
- Extension storage is available across extension contexts. Mailbox-derived
  data must avoid sync storage and should be minimized in IndexedDB/OPFS.
- Manifest V3 prohibits remotely hosted executable code. Any local-AI runtime
  and downloaded model design needs explicit Chrome Web Store review against
  the current policy; calling model weights "data" is not sufficient proof.
- Chrome Web Store user-data policies still require prominent disclosure,
  minimum permissions, secure handling, and a privacy policy.

Primary sources:

- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Local AI and compliance boundary

- Chrome exposes browser-managed local AI surfaces, but availability and API
  maturity make them an optional adapter rather than a dependable sole runtime.
- NIST's Privacy Framework is useful for identifying and communicating privacy
  risk; it does not certify this product or replace sector/professional rules.
- A firm's "no AI" rule may cover all models or unapproved software regardless
  of egress. The product must make administrative review easier, never market
  itself as a loophole around policy.

Primary sources:

- https://developer.chrome.com/docs/ai/built-in
- https://www.nist.gov/privacy-framework

## Revalidation triggers

Re-fetch and revise these notes when any of the following changes:

- OAuth scope, Google verification, limited-use, or security-assessment policy;
- Chrome extension identity, service worker, offscreen, storage, remote-code,
  or user-data policy;
- selected model/runtime, distribution channel, permissions, or data flow;
- any public claim about local-only operation, compliance, confidentiality,
  encryption, retention, deletion, or organizational suitability.

## 2026-10-09 portability update

- Chrome Identity's `getProfileUserInfo()` and `getAuthToken()` are tied to the
  browser's primary Chrome account. That contract caused the 0.3.2 failure in
  Arc and Dia; a Gmail tab login is not a substitute.
- `launchWebAuthFlow()` is the browser-neutral extension surface. Its callback
  must use `https://<extension-id>.chromiumapp.org/...`, and callers must
  validate the exact redirect and state.
- Google's client-side implicit OAuth documentation supports a short-lived
  access-token response without a backend, but treats the direct flow as a
  legacy pattern. The response may omit `scope` when it is unchanged and
  clients must ignore unrecognized response fields.
- Google's authorization-code model requires a secure token-exchange design;
  a Web-client secret cannot be embedded in an extension. A public product must
  reassess GIS/code flow, backend trust, and restricted-scope review rather than
  treating the private-pilot implicit flow as permanent.
- Arc documents Chromium extension/MV3 compatibility. Dia exposes Chromium
  Manifest V3 and side-panel support, but both need independent native proof;
  neither promises Chrome-branded profile identity.

Primary sources:

- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open
- https://www.diabrowser.com/changelog/mac/1-10-1
