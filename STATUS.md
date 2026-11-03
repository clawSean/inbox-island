# STATUS

Updated: 2026-11-02 by Sean

## Current state

- Canonical project: this repository root.
- Versions `0.3.0` through `0.4.8` are withdrawn. Their receipts are historical
  evidence only.
- `0.4.9` source is ready to freeze for a **Chrome Web Store deferred-publishing
  submission**. The final ZIP is being regenerated from the clean release
  source; the October 29 ZIP must not be uploaded.
- A Store upload is not approval to publish publicly. Manual publication stays
  blocked on the public OAuth/Google verification decision, brand decision, and
  an acceptable live-account pilot.
- Public source: `https://github.com/clawSean/inbox-island`.
- Chrome Web Store draft item ID: `jeemdbgakejlmmmbngpihndfkjiddbhl`.

## Release decision

Chrome reviewers have a credential-free, disconnected synthetic demo. The
extension can therefore enter Chrome review with **deferred publishing** while
public Gmail authorization proceeds on its separate Google timeline. This is a
Store-review decision, not a claim that Gmail authorization is public-ready.

Arc/Dia private-pilot portability is also separate from Chrome Store upload.
Those browsers remain supported targets, but their exact live-account flow must
pass before they are advertised as release-proved.

## Verified source

- The complete source/unit/development/synthetic/browser/build/validator/UI
  gate passes with `162/162` tests.
- Browser and UI proofs report zero external post-ready requests, WebSockets,
  page errors, or console errors.
- The inspected 42-case development corpus remains `40/42` exact, `12/14`
  reply-or-attention capture, zero false-important, zero unsafe-to-noise, and 9
  uncertain. This is in-sample calibration, not real-mail generalization proof.
- Manifest V3 uses only extension permission `identity` and host access to
  `https://gmail.googleapis.com/*`.
- The extension has no npm dependencies, remote code, telemetry, content
  scripts, Gmail mutation code, refresh token, client secret, or Inbox Island
  application backend.
- Synthetic demo and Store screenshots use synthetic data and make no external
  requests.
- Clean-checkout validation now rebuilds its immutable seed before validating
  it; the gate no longer depends on an ignored local ZIP.

## Blind review results

On November 2, a blind release-risk seat and a separate exact-head technical
review both found the same OAuth integration mismatch: production omitted
`access_type=online` while the native contract required it. The repair adds the
exact parameter and regression coverage.

The reviews also found and drove two additional repairs:

- accept Google's documented omission of an unchanged callback `scope` while
  rejecting duplicate or changed sensitive fields; and
- rebuild the ignored seed archive during extension validation so a clean clone
  can reproduce the gate.

No P0 finding or additional action-changing privacy/listing blocker was found.
The old Store receipt is intentionally superseded and will be regenerated from
the clean release source.

## Native browser evidence

- Native preflight passes on the unlocked Sean desktop for installed Arc
  `1.171.0` and Dia `1.55.1` against extension `0.4.9`.
- A fresh disposable Arc run proved the real popup, persistent full page,
  trusted connect click, exact Google OAuth request, accepted Google sign-in
  response, zero Gmail API requests, and disposable cleanup.
- Arc exposed the Google chooser only as a hidden browser-owned target in this
  automation environment. The exact chooser-close/cancellation gate therefore
  failed honestly; no account was selected, no consent was granted, and no
  mailbox was accessed.
- Dia's exact native run is not claimed as passing. Arc/Dia live-account proof
  remains a private-pilot/publication gate, not a disconnected Chrome Store
  review gate.

## Real-mail quality state

- Mailreef `0.11.5` read-only grants for JPop and Sean passed their 22-check
  preflights and bounded list/body canaries on October 24.
- An October 29 discovery slice supplied 40 selected screened summaries for
  provisional review: 29 bulk/noise, 6 completed records, and 5 attention.
  Safety gates withheld some reads. No raw body, token, active link, or
  attachment was written into this project.
- That sample informed classifier regressions but is not the extension's exact
  raw-body input. No live-extension accuracy score is claimed.

## OAuth boundary

- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- Private-pilot auth: explicit account selection through
  `launchWebAuthFlow()` with a Web application client and exact fixed-ID
  callback. Token leases are short-lived, memory-only, and never refreshed.
- Public auth is not frozen. The current implicit Web-client path is a private
  pilot, while Google's documented published-extension path uses a Chrome
  Extension client with `getAuthToken()`.
- `gmail.readonly` is restricted. Google verification is separate from Chrome
  Web Store review and is expected to take weeks, not days.

## Store kit

Prepared under `webstore/`:

- 128×128 icon and two 1280×800 synthetic screenshots with SHA receipts;
- listing, privacy answers/policy, reviewer instructions, and submission
  checklist;
- a disconnected reviewer path requiring no Google account or credentials;
- public homepage, privacy policy, source, support, SBOM, and security contact;
- a reproducible packager that strips only the development manifest key and
  internal build marker, then extracts, byte-compares, revalidates, scans, and
  hashes the exact Store ZIP.

The final package commit, file count, package-tree hash, and ZIP SHA-256 will be
recorded here and in `webstore/PACKAGE-RECEIPT.json` after the clean source
commit is frozen.

## Remaining before Store upload

1. Commit and push the reviewed release source.
2. Regenerate the exact `0.4.9` Store ZIP from that clean commit.
3. Revalidate extraction, byte parity, manifest, secrets, and hashes.
4. Tag/publish the release evidence and deliver the exact ZIP to JPop.
5. JPop uploads it to the existing item, selects **deferred publishing**, and
   submits for review from his own authenticated browser.

## Remaining before manual public publication

1. Freeze and implement the production OAuth architecture.
2. Complete Google restricted-scope verification and any assessment Google
   actually requires.
3. Decide whether to retain the Inbox Island name publicly; an active paid
   privacy-email training product uses the exact name, which is not legal
   clearance.
4. Pass an acceptable visible live-account pilot and validate the approved
   Store package before manually publishing.

## Product boundary

- Gmail discovery is limited to recent Inbox/Sent mail from the last 30 days:
  100 messages by default, 200 maximum, four pages maximum.
- Raw bodies, HTML, attachments, OAuth material, summaries, and active links
  are never persisted. IndexedDB stores only account-scoped derived state.
- The classifier is advisory; uncertain mail remains visible and Gmail remains
  authoritative.

Sequencing: `ROADMAP.md`
