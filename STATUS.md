# STATUS

Updated: 2026-10-29 by Sean

## Current state

- Canonical project: this repository root.
- Versions `0.3.0` through `0.4.8` are withdrawn. Do not install or resend
  them. Their receipts remain historical evidence only.
- `0.4.9` remains a source and Chrome Web Store package candidate. It is **not
  released or approved for upload** until exact Arc/Dia native and visible
  pilot proof pass. The October 29 classifier repair supersedes the October 22
  package candidate; its old ZIP must not be uploaded.
- Public Git provenance is live at `https://github.com/clawSean/inbox-island`.
  The current candidate source is commit
  `39c6b69a078828d3eb0d9f56a783d4d3cb419d01`. The final release tag still
  waits for native/live-pilot proof.
- Chrome Web Store draft item ID: `jeemdbgakejlmmmbngpihndfkjiddbhl`.

## What 0.4.9 changes

- Removes the disproved side-panel and compact companion-window paths.
- Uses a browser-owned popup for quick Needs you, Waiting, Filed, and Low
  signal counts, with one **Open full triage** persistent-workspace action.
- Invalidates stale classifier snapshots from earlier engines.
- Demotes optional surveys, contests, entertainment recommendations,
  browse/book campaigns, loan offers, weekly suggestions, fundraising/history
  solicitations, and course promotions.
- Removes user-facing “security” framing. Parser/injection diagnostics cannot
  create a reply obligation or scary badge.
- Keeps account-bound **Open in Gmail** links for real Gmail threads.
- Adds a disconnected synthetic demo and clearly removes Gmail actions from
  synthetic cards.
- Shows the Gmail data disclosure before account selection.
- Reduces the manifest to `identity` plus the Gmail API host; `sidePanel` is
  gone.

## Verified now

- Full source/unit/development/synthetic/browser/build/validator/UI gate passes
  on the October 29 source. It has 12 networkless browser-core modules; worker
  and UI proofs had zero external requests or browser errors.
- The inspected **42-case development corpus** now scores 40/42 exact,
  12/14 reply-or-attention capture, zero false-important, zero unsafe-to-noise,
  and 9 uncertain. This is in-sample calibration, **not** real-mail
  generalization proof.
- The repair gives completed records and bulk mail exact classification
  evidence, distinguishes active pickup/bid/calendar cues, and prevents
  ordinary bank-account mentions and negated password advice from becoming
  credential-request alarms.
- The package builds with Manifest V3, no npm dependencies, no remote code,
  no telemetry, no content scripts, no Gmail mutation code, no client secret,
  and a Gmail-only `connect-src`.
- Synthetic demo and Store screenshots run with zero external requests.
- The native harness now:
  - parses Arc's loopback DevTools stderr endpoint when
    `DevToolsActivePort` is absent;
  - targets and focuses its own disposable normal browser window;
  - applies the personal-browser guard only to the browser under proof; and
  - fails before launch with `DESKTOP_SESSION_LOCKED` on a locked Mac.
- Current native preflight produces exactly
  `DESKTOP_SESSION_LOCKED: Unlock the macOS desktop before native popup proof`.
  No false Arc/Dia success is claimed.

## Real-mail quality state

- Mailreef `0.11.5` is live. Fresh read-only grants for JPop and Sean passed
  their 22-check preflights and bounded list/body canaries on October 24;
  the earlier `invalid_grant` blocker is resolved.
- On October 29, a 100-message discovery slice supplied 40 selected screened
  summaries for provisional label review: 29 bulk/noise, 6 completed records,
  and 5 live-attention items. Mailreef withheld or blocked some reads at its
  safety gates. No raw body, OAuth token, active link, or attachment was
  written into this project.
- This sample exposed overlarge Review and false credential attention, driving
  the source regressions above. The labels describe screened summaries, not
  the exact raw-body input the extension sees. **No live-extension real-mail
  accuracy score or claim of 100/100 inspection is justified.** A visible
  JPop-device pilot and corrections remain the acceptance gate.

## Browser/OAuth boundary

- Extension permission: `identity` only.
- Host permission: `https://gmail.googleapis.com/*` only.
- Google scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- Current private-pilot auth: explicit account selection through
  `launchWebAuthFlow()` with a Web application client and exact fixed-ID
  callback. Token leases are short-lived, memory-only, and never refreshed.
- Public auth is not frozen. The current implicit Web-client path works for the
  private browser-neutral pilot but is Google's discouraged legacy flow;
  Google's documented extension path uses a Chrome Extension client with
  `getAuthToken()`.
- `gmail.readonly` is restricted. Google currently publishes an approximately
  six-week verification estimate, separate from Chrome Web Store review.

## Store readiness

Prepared under `webstore/`:

- 128×128 icon and two 1280×800 synthetic-only screenshots with SHA receipts;
- listing copy, privacy-form answers, public privacy policy, reviewer steps,
  and a submission checklist;
- a disconnected reviewer path requiring no Google account or credentials;
- a reproducible root-manifest upload packager that strips only the
  development `key`, extracts, byte-compares, revalidates, scans, and hashes.
- current candidate ZIP: `extension/dist/inbox-island-web-store-0.4.9.zip`,
  39 files, SHA-256
  `876f3df6a6644870fc0afac3135c7206394b53c2fa55cf24aefe160e045c9138`,
  package-tree SHA-256
  `28a816c188afa2694fa5a56d125e7f65f94c27a07643456580f3f2d7275a1c28`;
  receipt: `webstore/PACKAGE-RECEIPT.json`. The old 38-file ZIP is retained
  only under `artifacts/superseded/`.
- public source, build instructions, release status, SBOM, support Issues, and
  private vulnerability reporting at `https://github.com/clawSean/inbox-island`;
- live homepage and final policy at `https://inboxisland.jpop.cloud/` and
  `https://inboxisland.jpop.cloud/privacy/`, byte-matched to committed website
  source and browser-proved at 390px and 1440px.

The October 29 package passed mechanical proof, but it is **not the final
upload** until native and live-pilot gates pass unchanged.

Remaining public-release decisions:

- final brand clearance: another active paid privacy-email training product
  uses “Inbox Island”; no current Store listing or verified exact USPTO result
  was found, but that is not legal clearance;
- production OAuth architecture and Google verification submission;
- final release tag/artifact and Verified CRX key custody.

## Blockers before 0.4.9 handoff

1. Unlock ClawPop and close Arc for the Arc proof; close Dia for the Dia proof.
   October 29 preflight still returns `DESKTOP_SESSION_LOCKED` before launch.
2. Run both proofs against the exact unchanged build.
3. Have JPop run the visible Arc/Dia pilot on his own device/profile and
   confirm the popup, full page, demo, account choice, bounded sync, direct
   Gmail links, disconnect, and reconnect.
4. Turn repeatable pilot misses into regressions, rerun all gates, then
   freeze, regenerate the package from the final release commit, revalidate,
   hash, tag, push, and deliver. Public Gmail launch additionally requires
   brand and production OAuth decisions plus Google's verification.

## Product boundary

- Gmail discovery is bounded to recent Inbox/Sent mail from the last 30 days:
  100 messages by default, 200 maximum, four pages maximum.
- Raw bodies, HTML, attachments, OAuth material, summaries, and active links
  are never persisted. IndexedDB stores only account-scoped derived triage
  state.
- The classifier is advisory, uncertain mail remains visible, and Gmail remains
  authoritative.
- Inbox Island uses no personal Google login, consent, token, or raw mailbox
  data on ClawPop; Mailreef exposes only screened summaries for this audit.

Sequencing: `ROADMAP.md`
