# JPop Google setup — one-time public-verification handoff

JPop performs only the IAM grant below in a JPop-controlled browser on JPop's
device. Sean's follow-through uses Sean's own Google identity. Do not sign in,
enter credentials, approve consent, or expose cookies from JPop's personal
Google account on ClawPop.

## Frozen public architecture

The dedicated GCP project `inbox-island` already has:

- Gmail API enabled;
- Google Auth Platform External / Testing;
- only `https://www.googleapis.com/auth/gmail.readonly` configured;
- canonical extension ID `jeemdbgakejlmmmbngpihndfkjiddbhl`;
- Chrome Extension OAuth client
  `270655843779-4gktio587oago4rsgh3609te7h4eoe6r.apps.googleusercontent.com`.

The `0.5.0` public candidate uses that Chrome Extension client through
`chrome.identity.getAuthToken()`. It does not use a client secret, Web callback,
authorization code, refresh token, or Inbox Island backend. Arc and Dia are not
supported by the first public release.

## Why there is no test-user step

Google documents that an External app set to **In Production** is available to
any Google Account. Until restricted-scope verification succeeds, Google shows
an unverified-app warning and applies a 100-new-user lifetime cap. Inbox Island
will use only Sean's designated pilot identity before approval, so a temporary
tester list would create cleanup without improving the public release path.

## JPop's one authenticated action

1. Open **IAM & Admin → IAM** for the `inbox-island` project.
2. Choose **Grant access**, enter `seancrustacean@gmail.com`, select
   **Basic → Editor**, and save.
3. Confirm the principal appears on this project, then stop. Do not add Sean as
   a test user and do not share any Google credential, token, or cookie.

Editor is intentionally project-scoped: it lets Sean complete OAuth setup,
domain verification, production promotion, and verification follow-ups on this
dedicated project without granting ownership, billing, organization, or JPop
account access.

## Sean-owned follow-through

1. Open the `inbox-island` project and confirm Gmail API is enabled.
2. Delete the unused Web application client named **Inbox Island Browser
   OAuth**. Keep the exact Chrome Extension client above.
3. In Branding, use **Inbox Island**, the support email, logo,
   homepage, privacy policy, and authorized domain `jpop.cloud`.
4. In Data Access, retain only `gmail.readonly` and use the justification in
   `GOOGLE-OAUTH-VERIFICATION.md`.
5. Confirm developer contact email and verify the homepage domain in the same
   Google account.
6. Change Audience from Testing to In Production before the live pilot. Confirm
   there is no tester-list dependency.
7. Record the complete consent-and-use video described in the verification
   packet.
8. Submit Branding and restricted-scope Data Access through Verification
   Center, including the data-flow and security-assessment statements.

Sean records only non-secret public identifiers, receipt/status, or Google's
review questions. Never send a client secret, password, 2FA code, token, cookie,
callback URL, consent screenshot containing account data, or mailbox content.

Canonical submission copy: `resources/GOOGLE-OAUTH-VERIFICATION.md`.
