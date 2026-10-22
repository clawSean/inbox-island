# JPop Google setup — portable Arc/Dia pilot

Use a JPop-controlled browser on JPop's device. Arc or Dia is fine. Do not sign
in, enter credentials, approve consent, or expose cookies in any browser on
ClawPop.

## Existing project state

GCP project `inbox-island` already has:

- Gmail API enabled;
- Google Auth Platform External / Testing;
- JPop as the sole test user;
- only `https://www.googleapis.com/auth/gmail.readonly` configured;
- canonical extension ID `jeemdbgakejlmmmbngpihndfkjiddbhl`.

The old `Inbox Island Chrome Extension` OAuth client is historical. It cannot
authorize the portable Arc/Dia callback and must not be used by 0.4.0. Leave it
intact until the replacement proof passes; then retire it deliberately.

## One required addition

1. Open **Google Auth Platform → Clients** in project `inbox-island`.
2. Choose **Create client** / **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Inbox Island Browser OAuth`.
5. Under **Authorized redirect URIs**, add exactly:

   `https://jeemdbgakejlmmmbngpihndfkjiddbhl.chromiumapp.org/oauth2`

6. Do not add a JavaScript origin, another redirect, API key, scope, test user,
   or production publishing change.
7. Create the client.

## Return only

Send Sean only the public Client ID ending in:

`apps.googleusercontent.com`

Do **not** send or save the client secret. Web clients are issued a secret, but
this extension deliberately uses the private-pilot implicit flow and must never
contain that secret. Do not send screenshots that include credentials, cookies,
account lists, or mailbox content.

## What happens next

Sean records the public ID in source and the canonical identity record, runs
the fail-closed validator, builds once, and proves the exact bytes in fresh
disposable Arc and Dia profiles. The proof opens Google's chooser only far
enough to validate the client/redirect and then cancels; it does not select an
account or access Gmail.

JPop performs the actual account selection, read-only consent, and first
bounded sync later on his own device.
