Updated: 2026-10-12T16:20:00-07:00 by Sean

# STATUS

## State

- Canonical project: `/Users/Sean/projects/inbox-island/`.
- **Versions 0.3.0, 0.3.1, and 0.3.2 are withdrawn. Do not install or resend
  them.** JPop's own-device tests exposed three different gaps: fragile panel
  launch, a toolbar action Chrome could consume silently, and finally a
  Chrome-profile OAuth dependency that fails in Arc and Dia.
- **0.4.0 is withdrawn.** JPop's own-device Arc run reached Google's
  `400 invalid_request` page instead of an account chooser. The prior native
  probe falsely accepted any `accounts.google.com` target as a chooser and did
  not reject Google's OAuth error path.
- **0.4.1–0.4.7 are withdrawn.** They proved portable OAuth and classifier
  repairs, but retained an unreliable native side-panel launcher or invalid
  visibility detection.
- **0.4.8 is the current pilot candidate.** It forces companion windows out of
  inherited maximized state, removes user-facing security flags, stops internal
  parser signals from inflating Review, and demotes optional surveys, contests,
  entertainment recommendations, and browse/book campaigns to Low signal. Each
  result now links directly to its exact thread in the selected Gmail account.
- **Unpackaged 0.4.9 work is staged, not released.** It invalidates stale v2
  classifier snapshots and adds Low-signal regressions for loan offers, weekly
  suggestions, fundraising/history solicitations, and course promotions. The
  unsupported compact-window control and implementation are now removed; the
  expanded toolbar popup shows quick Needs you, Waiting, Filed, and Low signal
  counts and has one honest **Open full triage** action. The full 153-test,
  source, browser, build, validator, and six-surface UI gate passes. No 0.4.9
  package is approved yet.
- The first bounded Mailreef smoke on JPop's real mailbox discovered 10 recent
  message IDs without prose, but all five selected reads failed before release
  with `SUMMARIZER_UPSTREAM_LLM_COMPLETION_NOT_AUTHORIZED`. This is classified
  as caller/model authorization failure, not a security block and not email
  evidence. Real-mail classifier evaluation remains blocked until that exact
  caller route can run both isolated gates.
- Native proof is not yet green for the revised popup. Arc twice timed out
  waiting for its disposable DevTools endpoint; Dia launched but reported no
  active browser window when opening the action popup. These are proof-harness
  failures, so no Arc/Dia success or package is claimed.
- Arc `1.167.0` and Dia `1.47.1` are installed locally for the pending native
  proof. The design targets their Chromium Manifest V3 extension surface;
  expanded toolbar popup and full page are the canonical surfaces.
- JPop's accepted product direction is a fast own-device pilot followed by the
  earliest defensible public release, with Arc/Dia portability, visible source,
  auditability, truthful privacy disclosures, and a disconnected demo.

## 0.4.8 browser and OAuth boundary

- Manifest permissions are exactly `sidePanel` and `identity`; the only host
  permission is `https://gmail.googleapis.com/*`.
- `identity.email`, `getProfileUserInfo()`, and manifest OAuth are absent. A
  user click calls `chrome.identity.launchWebAuthFlow()` with the public Web
  client, exact fixed-ID callback, explicit account choice, and sole scope
  `gmail.readonly`.
- The returned short-lived token is held only in page memory. It is tied to an
  acquisition lease, expires automatically, is never logged or persisted, and
  cannot be substituted across overlapping account selections or stale Gmail
  requests.
- Inbox Island first reads only `users/me/profile`, displays the selected
  address, and requires a second explicit click before listing messages.
  Account mismatch, cancellation, expiry, stale callback, malformed response,
  wrong scope, 401, disconnect, or cross-view disconnect fails closed.
- Disconnect forgets the in-memory lease and clears local derived state. It
  does not claim to revoke the Google Account grant.
- The supported extension-client flow contains no client secret or refresh
  token and preserves the no-server boundary.

## Publication and update posture

- Store-installed extensions auto-update; ordinary users cannot opt into each
  package version. The publication plan uses Verified CRX Uploads, public source
  tags/hashes/build instructions, deferred publication, stable permissions,
  in-product version/change disclosure, and optional manual/enterprise-pinned
  lanes instead of claiming package-level opt-in updates.
- The no-refresh-token, memory-only design means an honest update has no standing
  Gmail credential; the next Connect/Sync remains user initiated.
- Source availability alone is insufficient. Public claims must be tied to the
  exact shipped bytes, SBOM, release receipts, data-flow proof, and revocation/
  deletion guidance.
- Canonical release and trust plan: `resources/PUBLICATION-TRUST-PLAN.md`.

## Data and product boundary

- Gmail discovery is bounded to recent Inbox/Sent mail from the last 30 days:
  100 messages by default, 200 maximum, four pages maximum.
- Individual malformed, oversized, invalid, or disappeared messages become
  safe Review placeholders; auth, network, permission, server, and abort
  failures stop the sync.
- Raw bodies, HTML, attachments, OAuth material, summaries, and active links
  are never persisted. IndexedDB stores only account-scoped derived triage
  state. The classifier is advisory and Gmail remains authoritative.
- There are no content scripts, Gmail mutations, attachment downloads,
  telemetry, app server, remotely hosted code, API key, or bundled secret.

## Proof now

- Source/unit gate: **154/154 passing** after the browser-neutral OAuth repair,
  hardening, including
  explicit chooser/confirmation, state and callback validation, expiry,
  same-task abort, late chooser, stale 401, token-reuse, cross-account lease,
  disconnect/no-further-egress, compact-window reuse, explicit full-page launch,
  process ownership, signal cleanup, provider-error rejection, and receipt
  privacy/no-clobber behavior.
- Browser core source check passes: 11 dependency-free modules with no network
  clients or URLs.
- Exact built bytes opened Google's chooser in disposable Arc and Dia profiles
  from trusted browser input, with zero Gmail requests before consent.
- UI proof passes across six viewport/surface sizes with zero external requests,
  WebSockets, page errors, or console errors.
- The 0.4.8 UI proof passes across six surfaces with no user-facing safety
  flags, an uncertainty-only Review queue, zero external requests, and exact
  regressions for surveys, contests, entertainment promos, browse/book mail,
  and account-bound Gmail thread links.
- The packaged archive extracted to 39 files, byte-matched the validated build,
  and revalidated successfully.
- No Google account, consent, token, cookie, or mailbox data was used on
  ClawPop. JPop's authenticated Google steps remain on his own device/browser.

## GCP state

Already complete in project `inbox-island`:

- Gmail API enabled;
- External / Testing audience;
- JPop is the sole test user;
- only `gmail.readonly` is configured;
- canonical extension ID is `jeemdbgakejlmmmbngpihndfkjiddbhl`.

The Web application client `Inbox Island Browser OAuth` is active with only
the fixed extension callback. Its public Client ID is pinned in source and by
SHA-256 in the native proof runner; its client secret is unused and absent from
the project tree and build.

The public architecture is not frozen. `0.3.2` failed at its mandatory
Chrome-profile preview before token acquisition; it did not test the existing
Chrome Extension client with interactive `getAuthToken()` and no profile-bound
account. That policy-preferred, profile-unbound Arc/Dia probe is now the first
next step.

## Next

1. In disposable Arc and Dia profiles, probe the existing Chrome Extension
   client with interactive `getAuthToken()` but no `getProfileUserInfo()`,
   `identity.email`, or explicit profile account. Stop before personal sign-in
   or Gmail access.
2. If that supported path fails, record the new Web client only for JPop's
   staging pilot and independently pin its SHA-256 in the native proof runner.
3. Rerun full tests, coverage, source policy, exact validator, and build.
4. Freeze the exact build tree and test identical bytes in fresh disposable Arc
   and Dia profiles: popup, full page, optional panel, redirect generation,
   real Google chooser launch, safe cancel, zero Gmail access before consent,
   and zero unexpected network/runtime errors.
5. Package and byte-verify the exact proven tree.
6. Deliver the pilot only after those Arc/Dia gates pass. JPop then performs account
   selection, read-only consent, and the first bounded sync on his own device.

## Historical evidence

- `artifacts/inbox-island-private-pilot-0.3.2.zip` and its native proof are
  retained only as evidence; 0.3.2 is withdrawn after the Arc/Dia auth failure.
- 0.3.1 and 0.3.0 artifacts are likewise historical and withdrawn.
- The inspected 42-thread development corpus remains in-sample evidence:
  26/42 exact and 12/14 reply-or-attention capture. It is not real-mail or
  unseen-validation proof.

## Current limitations

- Real chooser completion, consent presentation, token issuance, Gmail API
  behavior, and real-mail quality remain unproved until a test-user run.
- Public OAuth verification, Chrome Web Store review, employer/firm approval,
  complete thread history, incremental `history.list`, storage stress, and a
  production local model remain later work.
- Google requires separate testing and production projects; the production
  project is deliberately deferred until the public OAuth path is frozen.
- Ordinary Store installs cannot provide per-version opt-in updates. Verified
  CRX signing plus exact-source/build transparency and a GitHub/manual install
  lane are the accepted mitigation target; no custom opt-in updater is planned.
- `https://inboxisland.jpop.cloud/` is live as the canonical product URL with
  an honest private-pilot product page and draft privacy policy. Public source,
  release, install, contact, and finalized-policy links remain intentionally
  absent until their artifacts exist; the website is not a pilot blocker.
- The disconnected demo is deferred until after the private pilot works.
- This directory currently has no Git metadata. Exact artifacts and receipts
  are preserved, but repository provenance must be established before public
  release.

Sequenced work lives in `ROADMAP.md`.
