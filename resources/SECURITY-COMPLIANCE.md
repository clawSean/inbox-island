# Security and Compliance Contract

Status: design requirements. This is not legal advice or a compliance
certification.

The proof gates below are staged for live Gmail, public distribution, or firm
evaluation as indicated. They are not all blockers to showing the disconnected
synthetic design-partner prototype.

## Honest claim

The product aims to make a materially safer choice for confidential email by
removing cloud AI and application-server access to mailbox data. It cannot make
the use of AI, OAuth, Gmail, Chrome extensions, or local processing permissible
when an organization, client, regulator, court, contract, or insurer forbids it.

Target wording:

> Email analysis runs on this device. Mailbox content is fetched directly from
> Google and is not sent to our servers or a cloud AI provider. This does not
> replace your organization's approval or guarantee compliance with laws,
> professional duties, contracts, or security policies.

## Primary threats

- OAuth token theft or excessive scope.
- A compromised application/extension update.
- Email prompt injection or model-output laundering.
- Malicious HTML, MIME, links, images, or attachments.
- Exfiltration through telemetry, crash reporting, fonts, model endpoints,
  analytics, logs, support tooling, DNS, or unexpected browser requests.
- Raw or derived mailbox data leaking through sync storage, backups, clipboard,
  screenshots, exports, browser profiles, or multi-account crossover.
- Model/runtime supply-chain substitution or incompatible silent updates.
- Denial of service through huge threads, decompression bombs, malformed MIME,
  expensive prompts, or storage exhaustion.
- False triage that mis-prioritizes urgent mail inside product views or
  fabricates requests/deadlines. Inbox Island does not hide or mutate Gmail.
- Misleading privacy/compliance claims that cause use without authorization.

## Mandatory controls

### Authorization

- Separate Google Cloud project and OAuth client for this product.
- Exact granted-scope verification; reject unexpected additional scopes.
- `gmail.readonly` only. No refresh token, client secret, authorization code,
  or token persistence in the extension, identity record, package, receipt, or
  application backend.
- Private pilot only: explicit `launchWebAuthFlow()` account selection uses a
  Web application client, one-use state, exact fixed-ID redirect, and a
  short-lived fragment token. This legacy direct token flow is not preapproved
  as the public OAuth architecture.
- Pin each chooser/sync transaction to one in-memory credential lease. Recheck
  ownership immediately before every Gmail request so disconnect, expiry,
  stale 401s, late callbacks, or a newer account cannot substitute credentials
  or continue egress.
- Visible connected identity, explicit disconnect, Google revocation guidance,
  and account-isolated state.
- Never request Gmail credentials or passwords directly.

### Data flow

- Default-deny CSP and explicit network allowlist.
- No third-party analytics, error reporting, support widgets, fonts, CDNs, ads,
  feature flags, or remote configuration in the mailbox-processing surface.
- Model worker has no network or token access.
- Raw mailbox data never enters URL parameters, console logs, crash payloads,
  service-worker logs, browser sync storage, or application-server requests.
- Network canaries include raw, encoded, fragmented, compressed, derived, and
  delayed egress attempts.

### Hostile content

- Render plain, sanitized text; never execute email HTML or remote resources.
- Strip active content and cap nesting, decoded size, thread length, and tokens.
- Treat model output as untrusted; accept only versioned schema and validate
  types, bounds, evidence references, URLs, and enumerations deterministically.
- No model-accessible browser APIs, tools, navigation, clipboard, filesystem,
  Gmail token, or mutation capability.
- Attachments remain unsupported until each format has an isolated parser and
  adversarial corpus.

### Supply chain and updates

- Lock dependencies and produce an SBOM plus model/runtime/license inventory.
- Hash and pin model artifacts; reject partial, stale, or mismatched bundles.
- Bundle executable extension code and comply with Manifest V3's remote-code
  restrictions.
- Scan secrets, licenses, provenance, known vulnerabilities, package contents,
  and update diffs before release.
- Re-run the privacy and hostile-input gates on every code, dependency, model,
  prompt, schema, OAuth, permission, or distribution change.

### Storage and deletion

- Raw body persistence off by default.
- Derived state minimized, account-scoped, versioned, and excluded from sync.
- Clear-account and clear-all operations receive postcondition proof.
- Disconnect and local deletion are described separately from Google OAuth
  revocation and Google-side mailbox retention.
- No encryption-at-rest claim without an owned key-management design and proof.

## Proof gates

- Synthetic fixtures only until the complete network and storage harness passes.
- Exact permission/scope inspection from the packaged artifact.
- Clean-profile install, first run, restart, update, downgrade refusal, clear,
  revoke, and uninstall tests in every supported browser family. Arc and Dia
  are explicit private-pilot gates; a Chrome-only receipt is insufficient.
- Browser network capture proving only approved Google API and immutable model
  asset requests, with zero mailbox-derived egress.
- Hostile-email suite: direct/indirect/encoded injection, HTML/MIME tricks,
  hidden text, fake system prompts, credential requests, malicious links,
  conflicting deadlines, quoted-chain confusion, and model-output relay.
- Availability suite: WebGPU absent, model download interruption, quota, OAuth
  expiry, history expiry, offline use, worker termination, corrupt storage, and
  low-memory recovery.
- Quality suite reports urgency/reply/deadline recall, false-important rate,
  uncertainty calibration, per-category failures, and user correction cost.
- Independent security review before public mailbox authorization.

## Launch evidence packet

- Architecture and data-flow diagram.
- Threat model and abuse cases.
- OAuth scope justification and Google verification result.
- Browser-store permission/privacy disclosures.
- Privacy policy and user-data inventory.
- SBOM, dependency licenses, model card/license/provenance, and build hashes.
- Reproducible network, storage, deletion, hostile-input, quality, accessibility,
  and update receipts.
- Vulnerability reporting and incident-response contacts.
- Firm/admin deployment note covering managed-browser approval and the fact that
  local-only operation does not override organizational policy.
