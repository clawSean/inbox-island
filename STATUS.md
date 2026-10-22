# STATUS

Updated: 2026-10-22 by Sean

## Current state

- Canonical project: this repository root.
- Versions `0.3.0` through `0.4.8` are withdrawn. Do not install or resend
  them. Their receipts remain historical evidence only.
- `0.4.9` is a source and Chrome Web Store package candidate. It is **not
  released or approved for upload** until the exact Arc/Dia native proof and
  renewed-grant real-mail smoke pass.
- Public Git provenance is live at `https://github.com/clawSean/inbox-island`.
  The candidate source is commit `c83aca30dfa1129c5e6788643191ea448683d8c7`,
  with its package receipt committed as `fadb371`. The final release tag still
  waits for the native and real-mail gates.
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

- Full source/unit/development/synthetic/browser/build/validator/UI gate:
  **157/157 tests passed**.
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

## Real-mail smoke state

- The original smoke discovered ten recent message IDs without exposing prose,
  then five screened reads failed before content release with the obsolete
  caller/model authorization error
  `SUMMARIZER_UPSTREAM_LLM_COMPLETION_NOT_AUTHORIZED`.
- Mailreef `0.11.5` / broker `1.7.1` now maps the real condition to stable
  `BROKER_REAUTHORIZATION_REQUIRED`; the repair is published at commit
  `d8fc99319da098d1bf9abae8d9e8365357a4eeb7` with 37/37 Python checks and a
  22-check live preflight.
- JPop's existing Google refresh grant is expired or revoked (`invalid_grant`).
  A new five-minute private authorization handoff was sent but expired before
  completion. No new token was stored.
- The real-mail classifier comparison therefore remains pending a fresh
  read-only grant completed by JPop on his own Tailscale-connected device.

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
  and a Halloween submission checklist;
- a disconnected reviewer path requiring no Google account or credentials;
- a reproducible root-manifest upload packager that strips only the
  development `key`, extracts, byte-compares, revalidates, scans, and hashes.
- candidate ZIP: `extension/dist/inbox-island-web-store-0.4.9.zip`, 38 files,
  SHA-256 `d9cf942bbc036b78cbfbf9e90e7a6a984df2038d9d6fad66ba3d0a070ce11ae3`,
  package-tree SHA-256
  `fa98f0b62b5819ddb3927f6473728b358266aaf596a464b994028920818dd8f6`;
  receipt: `webstore/PACKAGE-RECEIPT.json`.
- public source, build instructions, release status, SBOM, support Issues, and
  private vulnerability reporting at `https://github.com/clawSean/inbox-island`;
- live homepage and final policy at `https://inboxisland.jpop.cloud/` and
  `https://inboxisland.jpop.cloud/privacy/`, byte-matched to committed website
  source and browser-proved at 390px and 1440px.

The candidate package is mechanical proof only. It is not the final upload
until native/browser and real-mail gates pass unchanged.

Remaining public-release decisions:

- final brand clearance: another active paid privacy-email training product
  uses “Inbox Island”; no current Store listing or verified exact USPTO result
  was found, but that is not legal clearance;
- production OAuth architecture and Google verification submission;
- final release tag/artifact and Verified CRX key custody.

## Blockers before 0.4.9 handoff

1. Unlock ClawPop and close Arc for the Arc proof; close Dia for the Dia proof.
2. Run both proofs against the exact unchanged build.
3. Renew Mailreef's read-only Google grant through a fresh private five-minute
   handoff and run the screened real-mail sample.
4. Turn repeatable real-mail misses into regressions, rerun all gates, then
   freeze, regenerate the package from the final release commit, revalidate,
   hash, tag, push, and deliver.

## Product boundary

- Gmail discovery is bounded to recent Inbox/Sent mail from the last 30 days:
  100 messages by default, 200 maximum, four pages maximum.
- Raw bodies, HTML, attachments, OAuth material, summaries, and active links
  are never persisted. IndexedDB stores only account-scoped derived triage
  state.
- The classifier is advisory, uncertain mail remains visible, and Gmail remains
  authoritative.
- No personal Google login, consent, token, or mailbox data is used on ClawPop.

Sequencing: `ROADMAP.md`
