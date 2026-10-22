# JPop private Gmail pilot — 0.4.9 handoff

## Release state

`0.4.9` is not delivered yet. Versions `0.3.0` through `0.4.8` are withdrawn;
remove them and do not reinstall. Fill in the exact archive name, SHA-256, file
count, and native-proof hashes here only after the final package passes.

## Install

1. Unzip the delivered `0.4.9` archive.
2. Open the extension manager:
   - Arc: `arc://extensions`
   - Dia: `dia://extensions`
3. Enable Developer mode.
4. Choose **Load unpacked** and select the inner folder containing
   `manifest.json` directly.
5. Confirm:
   - name `Inbox Island`;
   - version `0.4.9`;
   - ID `jeemdbgakejlmmmbngpihndfkjiddbhl`;
   - no extension-card errors.
6. Pin or expose the Inbox Island toolbar action.

## Launcher and demo acceptance

Click the action once. It must show a browser-owned popup with category counts
and one **Open full triage** action. There is no compact-window or side-panel
control.

1. Choose **Open full triage**.
2. Choose **Try demo**.
3. Confirm the page says **Synthetic demo** and **Gmail not connected**.
4. Synthetic cards must say **Synthetic example · no Gmail connection** rather
   than offering an Open in Gmail link.
5. Choose **Clear local data** and confirm the demo clears.

If the popup is blank or no page opens, stop and send only a screenshot of the
extension card/version/errors. Do not send browsing, account, or mailbox
content.

## Account selection and sync

1. Read the disclosure beside **Choose Google account**.
2. Click **Choose Google account**. Google's own window must show an account
   chooser; Inbox Island must not infer or require the browser-profile account.
3. Choose the intended pilot test-user account and approve only read-only Gmail
   access.
4. Inbox Island reads only `users/me/profile`, displays the selected Gmail
   address, and waits.
5. Confirm the address, then click **Sync selected account**.
6. Verify cards appear and ordinary Gmail still contains every message.
7. Open one real result in Gmail and confirm it targets the exact thread.

Expected network boundary: Google Accounts during selection, then
`gmail.googleapis.com` during the confirmed foreground sync. No Inbox Island
server, cloud model, telemetry, or other origin is expected.

## Disconnect and account switching

- **Disconnect Gmail** forgets the in-memory lease and clears derived local
  triage. It does not claim to revoke Google Account permission.
- **Choose another account** must reopen Google's chooser; switching Arc/Dia
  profiles is not required.
- Cancellation, expiry, mismatch, or stale selection must stop before message
  discovery and require a fresh chooser.

## Report failures safely

Send the visible error code, browser/version, extension version/ID, and the
extension card's Errors section. Never send credentials, consent tokens,
account lists, raw email, or mailbox screenshots unless deliberately redacted
and explicitly needed.
