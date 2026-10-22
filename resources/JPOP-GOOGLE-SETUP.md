# JPop Google setup — current handoff

Use a JPop-controlled browser on JPop's device. Do not sign in, enter
credentials, approve consent, or expose cookies in any browser on ClawPop.

## Existing testing project

GCP project `inbox-island` already has:

- Gmail API enabled;
- Google Auth Platform External / Testing;
- JPop as the sole test user;
- only `https://www.googleapis.com/auth/gmail.readonly` configured;
- canonical extension ID `jeemdbgakejlmmmbngpihndfkjiddbhl`;
- active Web application client `Inbox Island Browser OAuth` with exact
  redirect
  `https://jeemdbgakejlmmmbngpihndfkjiddbhl.chromiumapp.org/oauth2`.

The public client ID is pinned in source and independently hashed. Its issued
client secret is unused and must never be sent, saved in this repository, or
bundled in the extension.

## Private-pilot action

No GCP configuration change is required for JPop's next `0.4.9` pilot. Install
the exact delivered build, choose the existing test-user account in Google's
own window, approve only read-only Gmail access, confirm the selected address,
then start the bounded sync.

## Public-release work

Do not switch the testing project to production by improvisation. First freeze
the supported public auth architecture. Then, on JPop's device:

1. create/use a separate production deployment project if required by Google's
   current deployment-tier policy;
2. verify the product domains and publisher/support contacts;
3. configure only the approved production client and `gmail.readonly` scope;
4. submit branding plus restricted-scope verification with the public privacy
   policy, scope justification, data-flow explanation, and consent/use video;
5. follow Google's assessment determination for the exact no-server design.

Return only non-secret public identifiers or review status. Never send a client
secret, password, 2FA code, token, cookie, consent screenshot containing account
data, or mailbox content.
