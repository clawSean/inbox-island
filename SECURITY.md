# Security policy

## Supported version

Only the latest published release is supported. Versions `0.3.0` through
`0.4.8` are withdrawn. `0.4.9` is not supported until it is explicitly tagged
and published.

## Report a vulnerability privately

Use GitHub private vulnerability reporting:

https://github.com/clawSean/inbox-island/security/advisories/new

Do not open a public issue for an unpatched vulnerability. Do not include real
email, OAuth tokens, cookies, passwords, client secrets, account lists, or other
personal data. A minimal synthetic reproduction is preferred.

Useful reports identify the affected version/commit, browser/version, expected
boundary, observed behavior, and reproducible synthetic steps.

## Security boundary

Inbox Island has read-only Gmail scope, but a stolen live token could expose
mailbox content until expiry. The extension therefore keeps access tokens only
in memory, does not refresh them, renders untrusted mail as text, loads no
remote code, and limits network access to Google OAuth/Gmail. Read-only does not
make confidentiality bugs harmless.
