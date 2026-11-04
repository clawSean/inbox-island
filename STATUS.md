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
- Chrome Web Store item ID: `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- Public source: `https://github.com/clawSean/inbox-island`.

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

The final clean-tree Store package is still in progress. No `0.5.0` public
package hash is claimed until source is committed and
`webstore/PACKAGE-RECEIPT.json` is regenerated.

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

1. Pass the complete `0.5.0` release suite, commit and push exact source, build
   the clean-tree Store ZIP, regenerate the receipt, and verify exact bytes.
2. Run the exact-package live-account Chrome pilot: consent, returned-address
   confirmation, bounded sync, Gmail thread link, token cleanup, Disconnect,
   and local-data clear.
3. Approve the final public brand. “Inbox Island” overlaps an active paid
   email-privacy training product; no legal clearance is claimed.
4. In JPop's own authenticated Google browser: remove the unused Web client,
   finalize branding/domain/contact fields, promote Audience to Production,
   record the demonstration video, and submit restricted-scope verification.
5. In JPop's own Chrome Web Store dashboard: upload the exact final ZIP, apply
   the prepared listing/privacy/reviewer copy, select deferred publishing, and
   submit for review.
6. Resolve every Google/Store follow-up, revalidate the approved package, rerun
   the live pilot, then manually publish.

Personal Google authentication, consent, and Store/GCP owner actions must occur
on a JPop-controlled device/browser, never in JPop's personal Google session on
ClawPop. Sean's own Google account may be used for the live pilot after it is
authorized as a test user.

Sequencing: `ROADMAP.md`
