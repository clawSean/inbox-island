# Inbox Island

Inbox Island is a local-first Gmail triage extension for Google Chrome. It
reads a bounded recent Inbox/Sent slice, classifies it in the browser, and
leaves Gmail unchanged.

> **Current state:** `0.5.0` is the Chrome-first public-release candidate.
> The complete source gate and clean-tree package receipt pass. The exact ZIP
> remains held for a human-completed live Chrome pilot, final brand approval,
> and authenticated Google/Store submission. The published `0.4.9` artifact is
> historical only and must not be uploaded or made public.

## Product contract

- Categories are advisory shortcuts; Gmail remains authoritative.
- Every real result can open the exact thread in Gmail.
- The extension cannot send, reply, label, archive, delete, or mark mail read.
- Mail and tokens never pass through an Inbox Island server or cloud model.
- Raw bodies, HTML, attachments, summaries, and OAuth material are not
  persisted.

## Surfaces

- The toolbar popup shows quick Needs you, Waiting, Filed, and Low signal
  counts.
- **Open full triage** launches the persistent workspace.
- **Try demo** runs bundled synthetic `.example.test` messages without Google,
  Gmail, or external requests.

## Permission and network boundary

The Manifest V3 package requests exactly:

- extension permission `identity`;
- host access `https://gmail.googleapis.com/*`;
- Google OAuth scope `https://www.googleapis.com/auth/gmail.readonly`.

The public candidate uses Google's documented Chrome Extension OAuth client
through `chrome.identity.getAuthToken()` after an explicit user click. It
displays the Gmail address returned by the Gmail profile endpoint and requires
a second confirmation before message discovery. The access token is kept only
in memory for the bounded run; the Chrome token cache is cleared afterward and
again on Disconnect. No refresh token or client secret exists in the package.

Arc and Dia are not supported for the first public release. Fresh-profile
proof on their current builds reaches Google's provider-error page for the
documented Chrome Extension OAuth path. The older browser-neutral Web-client
flow is retired from the public candidate because Google labels direct implicit
OAuth legacy.

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
Chrome path as documented in `BUILD.md`.

```sh
npm run verify
npm run webstore:assets
npm run proof:oauth:chrome
npm run proof:live:chrome
```

The Chrome-first auth probe uses a disposable profile and proves that a trusted
click on the exact build reaches Google's real sign-in chooser with zero Gmail
requests. The live harness uses another disposable profile, pauses for a human
to complete Google sign-in/consent, hashes the returned account for comparison,
then records only sanitized counts and pass/fail facts while proving bounded
sync, a Gmail thread link, token cleanup, Disconnect, and local-data clear.

The inspected 42-case development corpus is in-sample calibration evidence:
`40/42` exact, `12/14` reply-or-attention capture, and zero observed
false-important results. It is not unseen or real-mail validation.

## Chrome Web Store and Google review

`webstore/` contains synthetic screenshots, listing copy, privacy disclosures,
reviewer instructions, and the submission checklist for item
`jeemdbgakejlmmmbngpihndfkjiddbhl`.

Chrome Web Store review and Google OAuth verification are separate. Public
Gmail authorization requires Google's restricted-scope approval for
`gmail.readonly`. The exact submission answers, data-flow explanation, scope
justification, and video script live in
`resources/GOOGLE-OAUTH-VERIFICATION.md`.

Public project pages:

- Product: https://inboxisland.jpop.cloud/
- Privacy: https://inboxisland.jpop.cloud/privacy/
- Source and support: https://github.com/clawSean/inbox-island

## Canonical references

- Current truth: `STATUS.md`
- Sequencing: `ROADMAP.md`
- Architecture: `resources/ARCHITECTURE.md`
- Google verification: `resources/GOOGLE-OAUTH-VERIFICATION.md`
- Publication controls: `resources/PUBLICATION-TRUST-PLAN.md`
- Store kit: `webstore/README.md`

Updated: 2026-11-03 by Sean
