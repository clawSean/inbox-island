# Chrome live pilot — 0.5.0

This runbook is for the exact public-release candidate in Google Chrome. Arc
and Dia are not supported for `0.5.0`. Never reuse the public `0.4.9` ZIP: it is
a historical deferred-review artifact with a different OAuth architecture.

## Preconditions

- The candidate source commit, Store ZIP SHA-256, and package receipt agree.
- The installed extension ID is `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- The pilot Google account is authorized for the `inbox-island` project while
  the app remains in Testing, or the app is already In Production.
- The pilot occurs in the dedicated disposable Chrome profile opened by
  `npm run proof:live:chrome`, with no unrelated tabs or extensions and with
  screen recording disabled unless recording the approved Google verification
  video.
- Do not use JPop's personal Google account on ClawPop. A Sean-owned Google
  account may be used there after JPop adds it as a test user.

## Install the exact candidate

1. Extract the final Store ZIP into an empty temporary directory.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select the extracted directory containing `manifest.json`.
3. Confirm name `Inbox Island`, version `0.5.0`, extension ID
   `jeemdbgakejlmmmbngpihndfkjiddbhl`, and no extension-card errors.
4. Open the action popup, then choose **Open full triage**.

## Disconnected acceptance

1. Choose **Try demo**.
2. Confirm the page says **Synthetic demo** and **Gmail not connected**.
3. Confirm every card is synthetic and no Gmail link is offered.
4. Clear local data and confirm the demo disappears.

No Google, Gmail, Inbox Island server, telemetry, or other network request is
allowed during the disconnected path.

## Authorization and bounded sync

1. Read the disclosure beside **Connect Google in Chrome**.
2. Click the button once. Google's own chooser or consent page must open.
3. Select only the authorized pilot account and approve only read-only Gmail
   access. Stop if any broader permission appears.
4. Confirm Inbox Island displays the returned Gmail address and has not yet
   listed messages.
5. Choose **Sync selected account**.
6. Confirm the bounded run completes, categories render, and Gmail still
   contains every message unchanged.
7. Open one result in Gmail and confirm it targets the intended thread without
   mutating it.

Expected network boundary: Google Accounts during authorization, then
`gmail.googleapis.com` during the confirmed foreground sync. No Inbox Island
server, cloud model, analytics, telemetry, or other origin is expected.

## Cleanup and account switching

1. Choose **Disconnect Gmail** and confirm derived triage clears.
2. Choose **Clear local data** and confirm no account-scoped derived state
   remains.
3. Reconnect once and confirm a new Chrome authorization request begins and the
   returned account must be confirmed again. Google may reuse an existing grant;
   the extension must not reuse a stale in-memory token or selected address.
4. Disconnect again. Inbox Island clears Chrome's cached access token; the
   Google-side grant can be revoked separately in Google Account settings.

## Evidence to record

- Chrome version; source commit; Store ZIP filename, size, and SHA-256.
- Extension version and ID.
- Consent screen shows only read-only Gmail access.
- Returned-address confirmation occurs before the first message-list request.
- Bounded sync, one exact Gmail thread link, Disconnect, and clear-local-data
  all pass.
- No Gmail mutation request, third-party origin, extension error, page error,
  or console error occurs.

Record only sanitized pass/fail facts and hashes. Never save or send passwords,
cookies, tokens, account lists, raw email, or mailbox screenshots.

## Failure handling

Stop on any broader scope, wrong extension ID, unexpected origin, Gmail
mutation, account mismatch, stale-token reuse, unhandled extension error, or
package/hash mismatch. Capture only the visible error code, Chrome/version,
extension version/ID, and sanitized network origin/counts.
