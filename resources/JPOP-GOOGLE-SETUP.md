# JPop Google setup — public verification handoff

Use a JPop-controlled browser on JPop's device. Do not sign in, enter
credentials, approve consent, or expose cookies in any personal Google browser
on ClawPop.

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

## Authenticated actions

1. Open the `inbox-island` project and confirm Gmail API is enabled.
2. Delete the unused Web application client named **Inbox Island Browser
   OAuth**. Keep the exact Chrome Extension client above.
3. In Branding, use the final approved public name, support email, logo,
   homepage, privacy policy, and authorized domain `jpop.cloud`.
4. In Data Access, retain only `gmail.readonly` and use the justification in
   `GOOGLE-OAUTH-VERIFICATION.md`.
5. Confirm developer contact email and verify the homepage domain in the same
   Google account.
6. Change Audience from Testing to In Production.
7. Record the complete consent-and-use video described in the verification
   packet.
8. Submit Branding and restricted-scope Data Access through Verification
   Center, including the data-flow and security-assessment statements.

Return only non-secret public identifiers, receipt/status, or Google's review
questions. Never send a client secret, password, 2FA code, token, cookie,
callback URL, consent screenshot containing account data, or mailbox content.

Canonical submission copy: `resources/GOOGLE-OAUTH-VERIFICATION.md`.
