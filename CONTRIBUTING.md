# Contributing to Inbox Island

Inbox Island is preparing for a public source release. Small, auditable changes
with synthetic tests are preferred.

## Before submitting a change

```sh
npm run verify
git diff --check
```

Node.js 22 or newer is required. The project intentionally has no npm runtime
or development dependencies.

## Privacy boundary

Never commit or post:

- real mailbox fixtures, subjects, bodies, addresses, attachments, summaries,
  screenshots, or derived user triage data;
- OAuth access/refresh tokens, cookies, client secrets, passwords, or 2FA;
- personal browser profiles or absolute private filesystem paths;
- internal firm policies or confidential client/workplace material.

Use fictional `.example.test` data. Treat all mail/model input as hostile and
keep executable code, network access, tokens, and persistence outside the
inference boundary.

## Product invariants

- `gmail.readonly` only; no Gmail mutation features.
- No Inbox Island server, cloud model, telemetry, remote code, or content
  scripts in the mailbox path.
- Raw email and OAuth material are not persisted.
- Deterministic safety/direction/deadline conclusions remain authoritative.
- Categories are advisory and Gmail remains the source of truth.
- Permission or OAuth expansion requires an explicit architecture and privacy
  decision, not a drive-by patch.

## Reporting issues

Ordinary bugs may use GitHub Issues. Security vulnerabilities belong in GitHub
private vulnerability reporting. Never include credentials or real email in
either channel; see `SECURITY.md` and `SUPPORT.md`.
