# Inbox Island

Inbox Island is a private, local-first Gmail triage pilot for Chromium-family
browsers, including **Arc and Dia**. It reads a bounded mailbox slice through
the official Gmail API, classifies it locally, and stores only minimal derived
state. It cannot send, modify, label, archive, delete, or mark mail as read.

> Versions 0.3.0–0.4.7 are withdrawn. Do not install or resend them. Version
> 0.4.8 is the current private-pilot candidate. It fixes triage false positives
> and gives every result a direct, account-bound **Open in Gmail** action.

## Product contract

- Categories are advisory shortcuts, not completeness guarantees.
- Uncertain mail stays visible in Review and every triaged thread stays in All.
- Gmail remains authoritative.
- No mailbox data or token flows through an Inbox Island server.
- Raw bodies, HTML, attachments, summaries, active links, and OAuth material
  are not persisted.

## 0.4.9 architecture

The Manifest V3 shell uses an expanded browser-owned action popup for a quick
category summary. **Open full triage** launches the persistent workspace. A
separate compact companion window is not a product surface because Arc 1.167
clamps extension popup windows to a large browser-controlled minimum size.
Native side panels are likewise excluded because Arc can report API success
without displaying one.

The manifest requests exactly:

- `identity` plus temporary `sidePanel` migration permission used only to clear
  the withdrawn builds' persisted toolbar preference;
- `https://gmail.googleapis.com/*` host access;
- Google scope `https://www.googleapis.com/auth/gmail.readonly`.

Authentication is explicit and browser-neutral:

```text
Choose Google account
  -> browser-owned launchWebAuthFlow window
  -> Google's account chooser (`prompt=select_account`)
  -> exact chromiumapp.org callback + one-use state validation
  -> users/me/profile only
  -> display selected address
Confirm selected account
  -> bounded Gmail profile/list/message reads with one pinned token lease
  -> deterministic local triage
  -> derived-only local snapshot
  -> token lease forgotten
```

The extension does **not** use Chrome-profile identity, `identity.email`,
`getProfileUserInfo()`, `getAuthToken()`, a client secret, or a refresh token.
Disconnect forgets the in-memory lease and local derived state; Google Account
grant revocation remains a separate Google setting.

The backendless direct token flow is limited to this private pilot. A public
release must reassess Google's modern authorization architecture and
restricted-scope review requirements.

## Gmail and classifier bounds

- Query: recent Inbox/Sent mail from the last 30 days.
- Default: 100 messages; hard maximum: 200; maximum: four pages.
- Gmail responses and MIME structure are byte/complexity bounded.
- Unsafe individual messages become Review placeholders; account, auth,
  network, permission, server, and abort failures stop the sync.
- The deterministic engine is authoritative. Optional local inference may only
  refine clean non-safety `uncertain` results and cannot override risk,
  deadline, or direction conclusions.

## Development proof

Requires Node.js 22 or newer:

```sh
npm test
npm run check
node extension/scripts/validate.mjs
```

The source/unit gate currently passes **152/152 tests**. The native Arc/Dia
proof runner's focused gate passes 19/19, and independent review found no P0-P2
issues. The validator is
uses the active public Web OAuth client recorded in `extension/identity.json`
and `app/gmail-auth.mjs`.

The build command also fails closed before replacing `extension/build`:

```sh
npm run build:extension
```

After the client is frozen, the release gate adds coverage, exact source/build
byte parity, synthetic UI proof, then native disposable-profile proof in both
Arc and Dia. No package is a release candidate until the exact extracted ZIP
passes the same validator and tree hash.

The native proof also requires an independently source-pinned SHA-256 of the
public client ID. It fails closed before launching either browser while the
client, hash, or build is pending.

## Google setup still required

In GCP project `inbox-island`, add one OAuth client:

- type: `Web application`
- name: `Inbox Island Browser OAuth`
- redirect:
  `https://jeemdbgakejlmmmbngpihndfkjiddbhl.chromiumapp.org/oauth2`

Record only its public Client ID. Never place the issued client secret in this
repository, the extension, a receipt, or chat.

## Current proof boundary

No personal Google account, Gmail consent, token, cookie, or mailbox has been
used on ClawPop. Disposable Arc/Dia runs may prove installation, launcher,
redirect construction, Google's chooser entry, cancellation, and zero Gmail
access before consent. Account selection, consent, token issuance, and bounded
live sync remain JPop-owned-device gates.

Current truth: `STATUS.md`
Sequencing: `ROADMAP.md`
Architecture: `resources/ARCHITECTURE.md`
GCP handoff: `resources/JPOP-GOOGLE-SETUP.md`
Pilot install/runbook: `resources/JPOP-PILOT-INSTALL.md`

Historical 0.3.x receipts remain under `artifacts/` for audit only. None is a
supported install.
