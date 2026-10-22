# Inbox Island

Inbox Island is a local-first Gmail triage extension for Chromium-family
browsers, including Arc and Dia. It reads a bounded recent Inbox/Sent slice,
classifies it in the browser, and leaves Gmail unchanged.

> **Current state:** `0.4.9` is a verified source candidate, not an approved
> release. Versions `0.3.0` through `0.4.8` are withdrawn. Do not install or
> resend an older archive.

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

The source/unit/browser/build/validator/UI gate passes **157/157 tests**. The
native runner now parses Arc's loopback DevTools endpoint, targets a disposable
browser window, and refuses to run on a locked desktop. Exact `0.4.9` Arc/Dia
proof is still pending an unlocked ClawPop desktop with the corresponding
personal browser closed.

The inspected 42-case development corpus is in-sample calibration evidence:
`12/14` reply-or-attention capture and zero observed false-important results.
It is not unseen or real-mail validation. The real-mail smoke awaits a renewed
read-only Google grant on JPop's own device.

## Chrome Web Store

`webstore/` contains synthetic screenshots, listing copy, privacy disclosures,
reviewer instructions, and the Halloween submission checklist for item
`jeemdbgakejlmmmbngpihndfkjiddbhl`.

The Store upload can be prepared and submitted before Halloween. Full Google
restricted-scope verification is a separate process whose published estimate
is about six weeks, so public Gmail authorization is not promised by Halloween.

## Canonical references

- Current truth: `STATUS.md`
- Sequencing: `ROADMAP.md`
- Architecture: `resources/ARCHITECTURE.md`
- Pilot handoff: `resources/JPOP-PILOT-INSTALL.md`
- Publication controls: `resources/PUBLICATION-TRUST-PLAN.md`
- Store kit: `webstore/README.md`

Updated: 2026-10-22 by Sean
