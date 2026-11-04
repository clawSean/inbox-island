# Google OAuth verification packet

Updated: 2026-11-03

This is the canonical submission copy for Inbox Island's public Google OAuth
review. It describes the Chrome-first `0.5.0` architecture exactly. Do not use
the withdrawn Web-client/private-pilot language from `0.4.9`.

## Frozen production boundary

- Google Cloud project: `inbox-island` (dedicated to this product).
- Chrome Web Store item / extension ID:
  `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- OAuth client type: **Chrome Extension**.
- OAuth client ID:
  `270655843779-4gktio587oago4rsgh3609te7h4eoe6r.apps.googleusercontent.com`.
- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- Runtime: Google Chrome only for the first public release. Arc and Dia are not
  advertised as supported because fresh-profile proof reaches Google's
  provider-error page in both browsers.
- Auth API: `chrome.identity.getAuthToken()` after an explicit user click.
- Token handling: short-lived access token only; no refresh token, client
  secret, authorization code, application backend, or token persistence.
- Data flow: Google → the user's Chrome extension → local deterministic triage.
  No Inbox Island server, analytics system, cloud model, or third party receives
  Google user data.

The existing dedicated project should be promoted from Testing to Production
instead of creating a second project and changing the already-pinned client.
Google recommends separate development and production projects, but does not
require them. This project has no unrelated app or OAuth client that belongs in
the production review. Remove the unused Web application client before
submission so every remaining client is production-ready.

## Scope justification

> Inbox Island uses `gmail.readonly` to read a user-initiated, bounded slice of
> recent Inbox and Sent messages and classify those threads locally into
> advisory triage categories such as Needs me, Waiting, Records, and Low
> signal. Message bodies are required to determine whether a thread asks for a
> reply, records a completed action, contains a near-term state change, or is
> ordinary bulk mail. `gmail.metadata` is insufficient because it excludes the
> message content needed for that feature. Gmail add-on current-message scopes
> are also insufficient because Inbox Island compares a bounded set of recent
> threads rather than only the message currently open in Gmail. The extension
> cannot send, edit, label, archive, delete, or mark messages read.

## Data-use explanation

> Gmail data is fetched directly from Google's Gmail API into the user's Google
> Chrome extension after an explicit Connect action and consent. Processing is
> local and deterministic. The extension does not transmit Gmail data or OAuth
> tokens to an Inbox Island server, remote model, analytics service, crash
> reporter, or other third party. Raw bodies, HTML, attachments, summaries, and
> OAuth material are not persisted. Only minimal account-scoped derived triage
> state is stored locally. The browser token cache is cleared after the bounded
> run and again on Disconnect. The Google-side grant may remain until the user
> revokes it in Google Account settings.

## Security-assessment statement

> Inbox Island does not store or transmit restricted Google user data on or
> through developer-controlled or third-party servers. All restricted data is
> processed only in the user's local Chrome extension. We are requesting
> Google's determination of whether a security assessment is required for this
> exact no-server architecture; we are not claiming an exemption ourselves.

## Public URLs

- Homepage: `https://inboxisland.jpop.cloud/`
- Privacy policy: `https://inboxisland.jpop.cloud/privacy/`
- Source: `https://github.com/clawSean/inbox-island`
- Support: `https://github.com/clawSean/inbox-island/issues`
- Security contact: GitHub private vulnerability reporting in the source repo.

All public pages must use the same product name, logo, Chrome-only support
boundary, scope, and data-flow claims before submission. The homepage domain
must be verified in the submitting Google account.

## Demonstration video script

Record one continuous video in English from the Chrome build that is submitted
for verification. Do not show passwords, recovery codes, unrelated tabs, or
real message prose beyond what is necessary to prove the feature.

1. Show the Chrome Web Store item ID and the matching installed extension ID.
2. Show the Google Auth Platform client record and its public Chrome Extension
   client ID.
3. Open Inbox Island and show the disclosure beside **Connect Google in
   Chrome** before any authorization request.
4. Click Connect and show Google's account/consent screen with the Inbox Island
   name and only read-only Gmail access.
5. Approve the request, return to Inbox Island, and show the selected Gmail
   address confirmation step. State that no messages have been listed yet.
6. Click **Sync selected account** and show the bounded local triage results.
7. Open one result in Gmail to prove thread navigation; do not modify Gmail.
8. Show **Disconnect Gmail**, clear local data, and explain that Chrome's token
   cache is cleared while Google-side revocation remains available in Google
   Account settings.
9. Show the public privacy policy, source repository, release tag, and exact
   package hash.

Upload the video as unlisted and place its URL only in Google's verification
form or official review correspondence.

## Authenticated console checklist

These steps must be completed in JPop's own authenticated browser, never in a
personal Google session on ClawPop.

1. Confirm the dedicated `inbox-island` project is selected and Gmail API is
   enabled.
2. Remove the unused Web application OAuth client. Keep the exact Chrome
   Extension client above.
3. Update Branding with the final public name, support email, logo, homepage,
   privacy policy, and authorized domain `jpop.cloud`.
4. Confirm Data Access contains only `gmail.readonly` and paste the scope
   justification above.
5. Confirm developer contact email and domain verification.
6. Change Audience from Testing to In Production.
7. Open Verification Center, prepare the data-access request, add the video,
   paste the data-use and assessment statements, and submit.
8. Save the submission receipt/status and forward only non-secret status or
   Google review questions back to the project.

## Completion criteria

- Google accepts the branding and restricted-scope submission.
- Any requested follow-up is answered before its deadline.
- Google records its assessment determination for the no-server data flow.
- The exact Store package is live-piloted with an authorized account and
  revalidated before manual Chrome Web Store publication.
