# Reference Architecture — Inbox Island

Status: 0.3.0–0.4.4 are withdrawn. Version 0.4.5 uses browser-neutral
identity with explicit browser-neutral Google account selection for Arc, Dia,
and compatible Chromium browsers. Live consent and Gmail proof remain pending.

## Product shape

```text
Google chooser + Gmail API
        ↓
visible extension shell
        ↓ bounded normalized mail
deterministic triage → optional guarded local inference
        ↓ validated derived result
minimal account-scoped IndexedDB + advisory UI
```

There is no Inbox Island application backend in the mailbox path. The visible
Gmail tab and DOM are irrelevant; the official Gmail API is canonical.

## Trust zones

1. **Google:** OAuth and Gmail API, the only remote systems allowed to receive
   account or mailbox data.
2. **Extension shell:** coordinates explicit auth/sync and renders validated
   results. It cannot reinterpret mail or model prose as commands.
3. **Inference worker:** receives bounded normalized text, has no network,
   token, storage, or tool access, and emits one versioned schema.
4. **Local store:** derived categories, flags, IDs, versions, and evidence
   offsets only. No raw bodies, summaries, active URLs, or OAuth material.
5. **Untrusted inputs:** every message/header/link/MIME part, attachment,
   quoted chain, model output, downloaded model asset, and migration record.

## Browser surfaces

- A manifest-owned action popup is the reliable launcher.
- **Open compact window** opens a persistent 440px companion window and reuses
  the existing one on later clicks.
- **Open full page** is a separate explicit path for deeper review.
- Native side panels are excluded because browser API success and document
  creation do not prove visible UI in Chromium-family browsers such as Arc.
- The service worker repairs the withdrawn 0.3.1 direct-panel preference but
  does not require side-panel APIs to keep the popup functional.
- Arc and Dia must each pass native disposable-profile proof before delivery.

## Manifest boundary

- Manifest V3, fixed extension ID
  `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- Permissions: `identity`, `sidePanel`.
- Host: `https://gmail.googleapis.com/*` only.
- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- No `identity.email`, manifest `oauth2`, content scripts, optional permissions,
  externally connectable pages, remote code, API key, client secret, or Gmail
  mutation endpoint.

## Private-pilot OAuth

The visible page starts `chrome.identity.launchWebAuthFlow()` synchronously from
a user click. It sends Google:

- a Web application client ID;
- the exact fixed-ID callback ending in `/oauth2`;
- `prompt=select_account`;
- `response_type=token`;
- online access and `include_granted_scopes=false`;
- the sole read-only Gmail scope;
- 32 random bytes encoded as one-use base64url state.

The callback parser requires the exact origin/path/state, bearer token type,
sane expiry, and—when returned—the exact sole scope. It rejects duplicate
security fields and code/ID/refresh-token confusion. Harmless unknown OAuth
extension fields are ignored per OAuth response rules.

The token is wrapped in an in-memory acquisition lease. Every request in one
selection or sync pins that lease and rechecks ownership immediately before
dispatch. Disconnect, expiry, newer selection, stale 401, late chooser, or
cross-view cancellation cannot substitute another account's token or issue new
requests from an invalidated lease. Expiry also clears the memory reference.

This direct implicit flow avoids bundling a Web-client secret and preserves the
no-backend pilot. It is a limited private-pilot compatibility choice, not the
production OAuth decision. Public distribution must revisit Google's current
GIS/code guidance and restricted-scope obligations.

## Gmail synchronization

1. The user chooses a Google account in Google's browser-owned UI.
2. Inbox Island calls only `users/me/profile`, displays the actual address, and
   waits for explicit confirmation.
3. Confirmation rechecks that same profile using the same lease.
4. It discovers `newer_than:30d {in:inbox in:sent}`, default 100 messages,
   maximum 200 and four pages.
5. It fetches selected full messages, normalizes MIME defensively, and turns
   unsafe individual messages into source-bound Review placeholders.
6. Deterministic local triage runs; optional inference can refine only clean
   non-safety uncertainty.
7. A derived-only generation is stored atomically and the lease is forgotten.

Auth, account mismatch, network, permission, server, and abort failures stop
the run. A single malformed/disappeared message does not kill its safe batch.

## Cancellation and concurrency

- Chooser and profile preparation have their own AbortController.
- Sync has a separate controller and timeout.
- Clear/disconnect invalidates pending selection and token ownership.
- Cross-view disconnect aborts an active sync before painting disconnected UI.
- Single-use storage generations prevent stale work from replacing or
  resurrecting cleared state across independent pages/database connections.

## Persistence

Persisted: account label, message/thread IDs, timestamps, derived categories,
flags, exact evidence offsets, schema/engine versions, and generation metadata.

Ephemeral: raw bodies, HTML, attachments, quotes, model prompts, summaries,
OAuth state, tokens, credentials, and message cards reconstructed after sync.

Clearing local data does not claim to revoke Google permission. Revocation is a
separate Google Account action.

## Triage authority

Results are advisory views, never mailbox actions. Deterministic risk,
deadline, and direction rules are authoritative. Optional local inference may
only refine a clean `uncertain` thread and must return schema-bound,
source-evidenced data. All mail remains available in Gmail; ordinary Gmail
review remains authoritative.

## Proof boundary

Source tests and loopback UI proof use controlled/synthetic data. Disposable
Arc/Dia proof may verify exact build identity, launcher behavior, redirect and
real chooser entry, safe cancel, and zero pre-consent Gmail access. It cannot
prove account selection, consent, token issuance, Gmail responses, or real-mail
quality without a dedicated test-user run.
