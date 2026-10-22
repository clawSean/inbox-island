# JPop private Gmail pilot — 0.4.8 Arc/Dia handoff

## Withdrawn pilot artifact

Versions 0.3.0 through 0.4.5 are withdrawn; remove them and do not reinstall.

- Archive: `inbox-island-private-pilot-0.4.8.zip`
- Archive SHA-256: `f73fea64daa1eea66de6290be9c47ce396633c552f7b7e54c4ccf8c72791f93b`
- Extracted files: `39`, byte-matched to the validated build tree
- Arc compact-window proof: 440×760; zero Gmail requests
- Dia compact-window proof: 440×768; zero Gmail requests

## Install

1. Unzip the delivered 0.4.8 archive.
2. Open the extension manager:
   - Arc: `arc://extensions`
   - Dia: `dia://extensions`
3. Enable Developer mode.
4. Choose **Load unpacked** and select the inner folder containing
   `manifest.json` directly.
5. Confirm:
   - name `Inbox Island`;
   - version `0.4.8`;
   - ID `jeemdbgakejlmmmbngpihndfkjiddbhl`;
   - no extension-card errors.
6. Pin or expose the Inbox Island action in that browser.

## Launcher acceptance

Click the action once. It must show a small browser-owned popup with:

- **Open compact window** — persistent narrow triage window;
- **Open full page** — larger review surface.

Open the full page first. If the popup is blank or no page opens, stop and send
only a screenshot of the extension card/version/errors. Do not send browsing,
account, or mailbox content.

## Account selection and sync

1. Click **Choose Google account**.
2. Google's own window must show an account chooser. Inbox Island must not
   infer or require the browser's profile account.
3. Choose the intended pilot test-user account.
4. Approve only read-only Gmail access.
5. Inbox Island displays the selected Gmail address after reading only the
   Gmail profile endpoint. Confirm that address before proceeding.
6. Click **Sync selected account** to run the bounded recent-mail sync.
7. Verify cards appear and ordinary Gmail still contains every message.

Expected network boundary: Google Accounts during selection, then
`gmail.googleapis.com` during the confirmed foreground sync. No Inbox Island
server, telemetry, or other origin is expected.

## Disconnect and account switching

- **Disconnect Gmail** forgets the in-memory lease and clears local derived
  triage. It does not claim to revoke Google Account permission.
- To use another account, choose **Choose another account**; Google must show
  its chooser again. Switching Arc/Dia profiles is not required.
- A canceled, expired, mismatched, or stale selection must stop before message
  discovery and require a fresh chooser.

## Report failures safely

Send the visible error code, browser/version, extension version/ID, and the
extension card's Errors section. Never send credentials, consent tokens,
account lists, raw email, or mailbox screenshots unless intentionally redacted
and explicitly needed.
