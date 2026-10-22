# Publication Trust Plan

Status: accepted product direction plus documented platform constraints.
Updated: 2026-10-22.

## Goal

Get JPop's Arc/Dia pilot working quickly, then publish as soon as the OAuth,
privacy, package, and evidence paths are defensible. Preserve the core promise:
no Inbox Island server receives a Gmail token or mailbox content.

## Trust statement

Inbox Island is local-first and trust-minimized, not trustless. Users still
trust Google, their browser and operating system, the installed package, and
the extension publisher/update channel.

The accurate public claims are:

- Each user authorizes their own Google account. The publisher's Google account
  is not part of the user's mailbox or token path.
- Google grants the product broad read-only Gmail visibility through the
  restricted `gmail.readonly` scope. Inbox Island cannot send, modify, label,
  archive, delete, or mark mail read.
- The implementation voluntarily limits discovery to recent Inbox/Sent mail,
  with 100 messages by default and 200 maximum, but the OAuth grant itself is
  broader than that runtime limit.
- Tokens are short-lived, memory-only, never refreshed or persisted, and are
  discarded after the bounded run.
- Mail is fetched directly from Google into the user's browser. No developer
  server, analytics service, or cloud model receives it.
- Only account-scoped derived triage state is persisted locally; raw bodies,
  HTML, attachments, summaries, and OAuth material are not persisted.
- Account selection, selected-address confirmation, sync, disconnect, local
  deletion, and Google-side revocation remain distinct user actions.

Do not advertise "extremely limited access" without qualification. The app's
actions are tightly limited, but Google correctly classifies whole-mailbox
read-only scope as restricted.

## Updates and malicious-update risk

Product decision (2026-10-12): keep ordinary Chrome Web Store publishing and
automatic updates straightforward. Do not add a custom opt-in update workflow.
Users who want manual control can install the exact tagged build from GitHub.

Chrome Web Store extensions update automatically. Ordinary users do not have a
per-extension opt-in switch. Enterprise administrators can pin versions, and
advanced users can install an unpacked/manual build, but neither is normal
consumer Store behavior.

Mitigate the update trust point with all of the following:

1. Opt in to Chrome Web Store Verified CRX Uploads and keep the signing private
   key outside browser/account credentials. Every package update then requires
   that additional signature even if a publisher account is compromised.
2. Publish source before or with each release: exact version tag, commit,
   deterministic build instructions, source/build tree hashes, artifact hash,
   SBOM, dependency/model inventory, and release notes.
3. Keep permissions and OAuth scope stable. Treat any expansion as a separate,
   prominently disclosed product decision and review gate.
4. Use deferred publication after Store review, exact-byte validation, and a
   clean release proof. Use partial rollout when the Store makes it available.
5. Show the installed version, source tag, build hash, and changelog in-product.
   After an update, require an explicit acknowledgment before the next Connect
   or Sync action.
6. Preserve explicit user-initiated authorization and no persistent/refresh
   token. An honest updated build has no standing mailbox credential and cannot
   sync until the user reconnects.
7. Offer a manual, pinned, source-built/unpacked lane for auditors and an
   enterprise-pinned lane for managed organizations.

An in-product approval gate cannot defend against a deliberately malicious
publisher update, because malicious code could remove the gate. Verified CRX
signing, independently auditable source/artifacts, least-privilege publisher
roles, and the optional manual lane are the real controls against blind update
trust.

## Source and listing discoverability

The Store listing and verified product site should expose, near the top:

- a plain-language data-flow statement;
- the exact `gmail.readonly` permission and what it can and cannot do;
- the bounded runtime behavior versus the broader Google grant;
- the source repository, current release tag, build instructions, hashes, SBOM,
  privacy policy, deletion/revocation guide, vulnerability contact, and audit
  receipts;
- screenshots plus a short public demonstration video.

Use the Store's verified Official URL, Homepage URL, and Support URL fields.
Do not rely on a raw repository URL in description text being prominent or
clickable. The verified homepage should have an obvious **View source** link.

Prefer verifiable statements over calling the product "trustworthy." The proof
should let users decide that for themselves.

## Website

Use `https://inboxisland.jpop.cloud/` as the canonical product homepage. The
pilot page and draft policy are live. Before Store submission, publish the
final policy plus obvious links to the public source, support, current release,
hashes, and install path; verify the live bytes after deployment.

## Disconnected demo

The `0.4.9` candidate now includes the built-in disconnected synthetic demo.
It requests no OAuth grant, makes no Gmail request, labels the surface
**Synthetic demo / Gmail not connected**, and replaces real-mail links with a
non-action synthetic label. The Store screenshots use that same packaged
surface and contain `.example.test` data only.

Local MBOX/Takeout import remains a later no-live-OAuth evaluation lane; it
needs its own parser, deletion, hostile-content, and storage proof.

## Arc/Dia OAuth decision

The browser-neutral private pilot now uses a Web application client with
`launchWebAuthFlow()`. Exact prior Arc/Dia builds reached Google's account
chooser without a browser-profile account, but the OAuth 2 implicit grant is a
discouraged legacy flow and is not the public architecture by default.

Before public Gmail authorization:

1. Reconcile the documented Chrome Extension client / `getAuthToken()` path
   with Arc and Dia without `getProfileUserInfo()`, `identity.email`, or a
   profile-bound account.
2. If that path cannot support the target browsers, obtain explicit Google
   guidance before publishing the Web-client flow.
3. Preserve explicit account choice, least privilege, memory-only access, no
   refresh token, and no developer-server restricted-data path.
4. If no compliant pure-extension route works, prefer a local installed-app
   companion with PKCE over a hosted token broker. A broker would materially
   expand breach, outage, and restricted-scope assessment exposure.

This is a public OAuth blocker, not a blocker to the bounded one-person pilot
or submitting the disconnected Store package for Chrome review.

## Projects and ownership

- Keep the current `inbox-island` GCP project as testing/staging.
- Create the production project only when the production auth path is frozen
  and verification submission begins. Google requires separate deployment-tier
  projects; deferring the second project avoids present-day busywork without
  creating verification debt.
- JPop can remain the sole owner during the private pilot. Do not add Sean as an
  owner by default; agent-controlled ownership adds another privileged account
  and unclear governance without solving the human recovery problem.
- Before public launch, add one deliberate backup under JPop's control or a
  trusted human/product identity, keep reachable OAuth contacts current, and
  use least-privilege Store publisher roles.
- Protect the Store and GCP identities with passkeys/2FA, recovery material,
  alerts, and documented recovery. Keep the Verified CRX signing key separate.

## Primary sources

- Extension update lifecycle:
  https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle
- Store updates and Verified CRX Uploads:
  https://developer.chrome.com/docs/webstore/update
- Store listing URL fields:
  https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Shared publisher roles:
  https://developer.chrome.com/docs/webstore/share-ownership
- Google OAuth client/platform policy:
  https://developers.google.com/identity/protocols/oauth2/policies
- Google extension OAuth path:
  https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- Google testing/production project policy:
  https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Restricted-scope review:
  https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
