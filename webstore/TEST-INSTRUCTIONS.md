# Chrome Web Store reviewer instructions

No credentials or Google account are required to review the packaged UI and
classifier.

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

The production feature begins only after the in-product disclosure and a user
click on **Choose Google account**, followed by Google's account selection and
read-only consent. The current Google project is in Testing with an explicit
test-user list. Do not place a shared Google password, token, or mailbox in the
Store's test-instructions fields. If Google or Chrome review requires a live
Gmail account, add the reviewer's Google identity as a temporary test user
through the official review channel and remove it afterward.
