# Chrome Web Store reviewer instructions

No credentials or Google account are required to review the packaged UI and
classifier. The first public release supports Google Chrome only.

1. Install the submitted package.
2. Click the Inbox Island toolbar action.
3. Choose **Open full triage**.
4. Choose **Try demo**.
5. Confirm the page labels the data **Synthetic demo** and **Gmail not
   connected**.
6. Inspect Needs me, Review, Waiting, Records, Low signal, and All mail.
7. Confirm synthetic results have no functional **Open in Gmail** link.
8. Choose **Clear local data** and confirm the demo state clears.

The demo uses bundled `.example.test` fixtures, makes no Google/Gmail request,
and requires no test credentials.

## Gmail path

The Gmail feature begins only after the in-product disclosure and a user click
on **Connect Google in Chrome**, followed by Google's read-only authorization.
Inbox Island then displays the Gmail address returned by Google and requires a
second **Sync selected account** click before message discovery. The current
Google project remains in Testing until its restricted-scope submission. Do
not place a shared Google password, token, or mailbox in the Store's test-
instructions fields. If review requires a live Gmail account, add the
reviewer's Google identity as a temporary test user through the official review
channel and remove it afterward.
