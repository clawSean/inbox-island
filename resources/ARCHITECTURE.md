# Reference Architecture — Inbox Island

Status: versions `0.3.0` through `0.4.8` are withdrawn. `0.4.9` is the current
unpackaged source candidate; live consent, real-mail calibration, and exact
Arc/Dia native proof remain pending.

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

There is no Inbox Island backend in the mailbox path. The official Gmail API,
not a Gmail tab or page DOM, is canonical.

## Trust zones

1. **Google:** OAuth and Gmail API, the only remote systems allowed to receive
   account or mailbox data.
2. **Extension shell:** coordinates explicit auth/sync and renders validated
   plain text. Mail cannot become code or commands.
3. **Inference worker:** receives bounded normalized text, has no network,
   token, storage, or tool access, and emits one versioned schema.
4. **Local store:** derived categories, flags, IDs, versions, and evidence
   offsets only; no raw bodies, summaries, active URLs, or OAuth material.
5. **Untrusted input:** every message/header/link/MIME part, attachment, quoted
   chain, model result, and migration record.

## Browser surfaces

- A manifest-owned action popup is the reliable launcher and quick dashboard.
- **Open full triage** is the only persistent workspace.
- **Try demo** runs bundled synthetic messages with no OAuth or network access.
- Native side panels are excluded because Arc can report API success while
  displaying nothing. Compact extension windows are excluded because Arc
  clamps them to a large browser-controlled minimum.
- The service worker verifies the popup configuration and opens the full page
  if popup restoration fails. It has no side-panel or network authority.

## Manifest boundary

- Manifest V3, fixed development identity
  `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- Permission: `identity` only.
- Host: `https://gmail.googleapis.com/*` only.
- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- No content scripts, optional permissions, broad hosts, remote code, API key,
  client secret, refresh token, Gmail mutation endpoint, or telemetry.
- The Chrome Web Store upload removes only the development `key`; the existing
  Store item supplies the canonical production identity.

## Private-pilot OAuth

The visible page starts `chrome.identity.launchWebAuthFlow()` synchronously from
a user click. It sends Google a public Web application client ID, the exact
fixed-ID callback ending in `/oauth2`, explicit account choice, the sole
read-only Gmail scope, and one-use random state.

The callback parser requires exact origin/path/state, bearer token type, sane
expiry, and the sole scope when returned. It rejects duplicated security
fields, code/ID/refresh-token confusion, stale callbacks, and account changes.

The access token is wrapped in an in-memory lease. Every request pins and
rechecks the lease immediately before dispatch. Disconnect, expiry, newer
selection, stale 401, late chooser, or cross-view cancellation cannot issue a
request from invalid ownership. The lease is forgotten after the bounded run.

This Web-client implicit flow preserves the no-backend private pilot, but it is
not the frozen public architecture. Google documents Chrome Extension clients
with `getAuthToken()` and treats `gmail.readonly` as restricted.

## Gmail synchronization

1. The user chooses an account in Google's browser-owned UI.
2. Inbox Island calls only `users/me/profile`, displays the actual address, and
   waits for explicit confirmation.
3. Confirmation rechecks that profile under the same lease.
4. It discovers `newer_than:30d {in:inbox in:sent}`: 100 messages by default,
   200 maximum, four pages maximum.
5. It fetches selected messages, normalizes MIME defensively, and turns unsafe
   individual messages into source-bound Review placeholders.
6. Deterministic local triage runs; optional inference may refine only clean
   non-safety uncertainty.
7. A derived-only generation is stored atomically and the lease is forgotten.

Auth, mismatch, network, permission, server, and abort failures stop the run.
A malformed/disappeared message fails safely without hiding the rest of its
batch.

## Persistence and concurrency

- Persisted: account label, Gmail IDs, timestamps, categories, flags, exact
  evidence offsets, schema/engine versions, and generation metadata.
- Ephemeral: raw bodies, HTML, attachments, quotes, prompts, summaries, OAuth
  state, tokens, credentials, and reconstructed cards.
- Clear/disconnect invalidates pending selection and token ownership.
- Cross-view disconnect aborts active sync before disconnected UI is painted.
- Single-use storage generations prevent stale work from replacing or
  resurrecting cleared state.

## Proof boundary

Source tests and browser/UI proofs use controlled synthetic data. Disposable
Arc/Dia proof can establish exact build identity, visible launcher behavior,
redirect/chooser entry, safe cancellation, and zero pre-consent Gmail access.
It cannot establish real-mail quality. That requires the separate screened
read-only sample and JPop's own-device pilot.
