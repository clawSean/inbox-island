# STATUS

Updated: 2026-11-03 by Sean

## Current decision

- `0.5.0` is the active **Google Chrome-only public-release candidate**.
- It uses Google's documented Chrome Extension OAuth client through
  `chrome.identity.getAuthToken()` with only `gmail.readonly`.
- Arc and Dia are not supported or advertised for the first public release.
  Fresh-profile probes on both reach Google's provider-error page for the
  Chrome Extension OAuth client.
- The published `0.4.9` ZIP and GitHub release are historical deferred-review
  evidence only. They use a private-pilot Web OAuth architecture and must not
  be uploaded or made public.
- `0.5.0` source commit:
  `6387e10574919ead47585313ddd3497483b1a03b` (pushed to `origin/main`).
- Chrome Web Store item ID: `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- Public source: `https://github.com/clawSean/inbox-island`.
- The public name is frozen as **Inbox Island** for the `0.5.0` submission.
  An adjacent paid email-privacy training product uses the same words; no legal
  clearance or exclusivity claim is made, but that overlap is not treated as a
  technical launch blocker.

## Candidate verification state

Completed on the current `0.5.0` source candidate:

- complete source/unit/development/synthetic/browser/build/validator/UI gate:
  `163/163` tests pass;
- exact unpacked build and manifest/OAuth validation pass;
- a trusted click in a fresh disposable Google Chrome 156 profile reaches
  Google's real account chooser with zero Gmail API requests;
- the manifest contains only `identity`, the Gmail API host, the exact Chrome
  Extension client, and `gmail.readonly`;
- tokens are never written to extension storage or refreshed; the returned
  token is removed from Chrome's cache after each bounded run, and Disconnect
  clears all cached extension tokens;
- no Inbox Island backend, cloud model, analytics, telemetry, remote code,
  client secret, authorization code, refresh token, or Gmail mutation
  permission exists.

The clean-tree Store package was regenerated from that exact source commit and
reproved against Google's real chooser in Chrome 156:

- file: `extension/dist/inbox-island-web-store-0.5.0.zip`;
- 39 files, 81,486 bytes;
- ZIP SHA-256:
  `7dd54e1586f35c59d93a0dfdbaf171c3287a33a0f9d26d1d9ff6a1123dcd464c`;
- package-tree SHA-256:
  `8216688301890ba32e7d48f28111c8b80b159ee6a1fd713e0e5c8c48d414ed28`;
- root manifest, development key removed, extraction byte parity, exact package
  revalidation, zero private-key files, and zero secret-shaped files.

Canonical receipt: `webstore/PACKAGE-RECEIPT.json`.

An automated sign-in attempt using Sean's own 1Password-backed Google login
was rejected by Google at the provider boundary before the password step. No
consent was granted and no Gmail request occurred. The production-safe
`proof:live:chrome` harness now opens the same disposable exact-build path
without Chrome's automation-identifying launch flag and waits for a human to
complete sign-in/read-only consent. It then verifies only the expected account
hash, sanitized counts, GET-only Gmail traffic, thread navigation, Disconnect,
and local-data cleanup before deleting the temporary authenticated profile.

## Public OAuth configuration

The dedicated Google Cloud project `inbox-island` already has:

- Gmail API enabled;
- External / Testing audience;
- scope `https://www.googleapis.com/auth/gmail.readonly` only;
- Chrome Extension OAuth client
  `270655843779-4gktio587oago4rsgh3609te7h4eoe6r.apps.googleusercontent.com`;
- the canonical Store extension ID above.

The existing dedicated project will be promoted to Production. Before Google
submission, the unused Web application client should be removed. The full
scope justification, data-flow statement, assessment posture, public URLs,
video script, and authenticated console checklist are frozen in
`resources/GOOGLE-OAUTH-VERIFICATION.md`.

`gmail.readonly` is a restricted scope. Chrome Web Store approval does not
replace Google OAuth verification. Google, not this project, determines whether
the local-only/no-server architecture requires a security assessment.

## Real-mail quality state

- Mailreef `0.11.5` read-only grants for JPop and Sean passed their 22-check
  preflights and bounded list/body canaries on 2026-10-24.
- A screened 40-summary development slice informed conservative classifier
  regressions. It is not the extension's exact raw-body input and is not
  presented as a live-mail accuracy score.
- The last 42-case development corpus result was `40/42` exact, `12/14`
  reply-or-attention capture, zero false-important, zero unsafe-to-noise, and 9
  uncertain. This is in-sample calibration, not generalization proof.

## Store and privacy kit

Prepared under `webstore/`:

- Chrome-first listing, privacy answers/policy, reviewer instructions, and
  submission checklist;
- a disconnected synthetic reviewer path requiring no Google account;
- synthetic-only 128px icon and two 1280×800 screenshots with hash receipts;
- public homepage, privacy policy, source, support, SBOM, and security contact;
- a reproducible packager that removes only the development manifest key and
  internal build marker, then extracts, byte-compares, revalidates, scans, and
  hashes the exact Store ZIP.

## Remaining public-launch gates

1. Add Sean's Google identity as a project test user while the app remains in
   Testing, then run the exact-package human-completed Chrome pilot: consent,
   returned-address
   confirmation, bounded sync, Gmail thread link, token cleanup, Disconnect,
   and local-data clear.
2. In JPop's own authenticated Google browser: remove the unused Web client,
   finalize branding/domain/contact fields, promote Audience to Production,
   record the demonstration video, and submit restricted-scope verification.
3. In JPop's own Chrome Web Store dashboard: upload the exact final ZIP, apply
   the prepared listing/privacy/reviewer copy, select deferred publishing, and
   submit for review.
4. Resolve every Google/Store follow-up, revalidate the approved package, rerun
   the live pilot, then manually publish.

Personal Google authentication, consent, and Store/GCP owner actions must occur
on a JPop-controlled device/browser, never in JPop's personal Google session on
ClawPop. Sean's own Google account may be used for the live pilot after it is
authorized as a test user.

Sequencing: `ROADMAP.md`
