# Inbox Island

Inbox Island is a local-first Gmail triage extension for Chromium-family
browsers, including Arc and Dia. It reads a bounded recent Inbox/Sent slice,
classifies it in the browser, and leaves Gmail unchanged.

> **Current state:** `0.4.9` is being frozen for Chrome Web Store review with
> **deferred publishing**. It is not approved for manual public publication.
> Versions `0.3.0` through `0.4.8` are withdrawn.

## Product contract

- Categories are advisory shortcuts; Gmail remains authoritative.
- Every real result can open the exact thread in Gmail.
- The extension cannot send, reply, label, archive, delete, or mark mail read.
- Mail and tokens never pass through an Inbox Island server or cloud model.
- Raw bodies, HTML, attachments, summaries, and OAuth material are not
  persisted.

## Surfaces

- The browser-owned toolbar popup shows quick Needs you, Waiting, Filed, and
  Low signal counts.
- **Open full triage** launches the persistent workspace.
- **Try demo** runs bundled synthetic `.example.test` messages without Google,
  Gmail, or external requests.
- The former side-panel and compact-window paths are removed. Arc can report a
  hidden side panel and clamps requested compact windows to a large minimum.

## Permission and network boundary

The Manifest V3 package requests exactly:

- extension permission `identity`;
- host access `https://gmail.googleapis.com/*`;
- Google OAuth scope `https://www.googleapis.com/auth/gmail.readonly`.

It has no content scripts, remote code, telemetry, analytics, Gmail mutations,
refresh token, client secret, or application backend.

The current private-pilot flow uses an explicit Google account chooser through
`chrome.identity.launchWebAuthFlow()`, displays the selected address after a
profile-only read, and requires a second click before message discovery. Its
short-lived token is held only in page memory and forgotten after the bounded
run. That Web-client implicit flow is **not yet the frozen public OAuth
architecture**; Google documents Chrome Extension clients with `getAuthToken()`
for published extensions, and `gmail.readonly` is a restricted scope.

## Gmail and classifier bounds

- Query: recent Inbox/Sent mail from the last 30 days.
- Default: 100 messages; hard maximum: 200 and four pages.
- Gmail responses and MIME structure are byte/complexity bounded.
- Unsafe individual messages become Review placeholders. Account, auth,
  network, permission, server, and abort failures stop the sync.
- Deterministic rules are authoritative. Optional networkless local inference
  may refine only clean `uncertain` results.

## Development and proof

Requires Node.js 22 or newer. The extension has no npm package dependencies;
browser proof uses an explicitly supplied existing `playwright-core` and
Chromium path as documented in `BUILD.md`.

```sh
npm run verify
npm run webstore:assets
npm run native:proof:portable -- --browser arc
npm run native:proof:portable -- --browser dia
```

The full source/unit/browser/build/validator/UI gate passes with `162/162`
tests. Two blind release reviews found and drove repairs for the exact OAuth
launch parameter set, Google's optional unchanged callback scope, and
clean-checkout seed validation.

Native preflight passes on the unlocked Sean desktop. A disposable Arc run
proved the extension surfaces and exact Google OAuth request but exposed the
chooser only as a hidden browser target, so the strict chooser cancellation
gate remains red. Arc/Dia live-account portability is a pilot/publication gate,
not a blocker for credential-free Chrome Store review.

The inspected 42-case development corpus is in-sample calibration evidence:
`40/42` exact, `12/14` reply-or-attention capture, and zero observed
false-important results. It is not unseen or real-mail validation. A separate
Mailreef review of 40 screened summaries informed the classifier repair, but
only JPop's visible Arc/Dia pilot can validate the exact real-mail experience.

## Chrome Web Store

`webstore/` contains synthetic screenshots, listing copy, privacy disclosures,
reviewer instructions, and a submission checklist for item
`jeemdbgakejlmmmbngpihndfkjiddbhl`.

The exact package can be submitted for Chrome review using the disconnected
demo and **deferred publishing**. Google restricted-scope verification,
production OAuth, brand clearance, and live-account pilot acceptance remain
separate blockers before manual public publication.

Public project pages:

- Product: https://inboxisland.jpop.cloud/
- Privacy: https://inboxisland.jpop.cloud/privacy/
- Source and support: https://github.com/clawSean/inbox-island

## Canonical references

- Current truth: `STATUS.md`
- Sequencing: `ROADMAP.md`
- Architecture: `resources/ARCHITECTURE.md`
- Pilot handoff: `resources/JPOP-PILOT-INSTALL.md`
- Publication controls: `resources/PUBLICATION-TRUST-PLAN.md`
- Store kit: `webstore/README.md`

Updated: 2026-11-02 by Sean
