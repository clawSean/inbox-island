# ROADMAP — Inbox Island

Future sequencing only. Current truth and blockers live in `STATUS.md`.

## 1. Freeze the Chrome-first 0.5.0 candidate

- Use Google's documented Chrome Extension OAuth client and
  `chrome.identity.getAuthToken()` with only `gmail.readonly`.
- Keep access tokens in memory only and remove them from Chrome's Identity
  cache after each bounded run and on Disconnect.
- Remove Arc/Dia from initial public support claims; retain their provider-error
  receipts as the reason for the boundary.
- Run the complete source, unit, classifier, synthetic, browser, build,
  validator, UI, and disposable exact-build Chrome OAuth gates.
- Build, extract, byte-compare, scan, hash, and independently revalidate the
  exact Store ZIP.

**Advance when:** the exact `0.5.0` package is clean, reproducible, and tied to
the Chrome chooser proof with zero pre-consent Gmail requests.

## 2. Complete the live-account pilot and verification video

- Add a dedicated test account through Google Auth Platform on JPop's device.
- Run the submitted build in Google Chrome: disclosure, authorization,
  returned-address confirmation, bounded sync, Gmail thread open, token cleanup,
  Disconnect, and local-data clear.
- Record one continuous English verification video using the script in
  `resources/GOOGLE-OAUTH-VERIFICATION.md`.
- Add regressions only for repeatable product failures; rebuild if bytes change.

**Advance when:** the exact package completes a visible authorized-account run
without raw-data persistence, unexpected network traffic, or account drift.

## 3. Submit Chrome and Google reviews

- Finalize the public name and use it consistently in the manifest, Store,
  website, OAuth branding, privacy policy, and video.
- On JPop's authenticated device, upload the exact ZIP to Store item
  `jeemdbgakejlmmmbngpihndfkjiddbhl`, complete listing/privacy/test fields,
  choose deferred publishing, and submit.
- In the dedicated `inbox-island` GCP project, remove the unused Web OAuth
  client, finalize Branding/Data Access, switch to In Production, and submit the
  restricted-scope verification packet and video.
- Follow Google's official channel for assessment determination and questions.

**Advance when:** Chrome review and Google's branding/data-access review are
both submitted with receipts and no paused follow-up.

## 4. Publish deliberately

- After approvals, download or inspect the Store-approved package and verify it
  against the frozen receipt.
- Repeat the visible live-account smoke on the approved version.
- Enable Verified CRX Uploads only after the separate signing key is generated,
  backed up, and recovery-owned.
- Manually publish, preferably with partial rollout if available, then verify
  the listing, install, auth, sync, privacy, support, and source links.

**Advance when:** the public listing and installed extension are live, exact,
usable, and supported by the approved Google OAuth project.

## 5. Post-launch quality

- Collect explicit user corrections; never silently capture mailbox content.
- Measure Needs-you capture, false-important rate, uncertainty, and latency on
  natural cases.
- Add incremental `history.list`, storage stress, multi-account, update,
  downgrade, and uninstall proof after the core release is stable.
- Revisit Arc/Dia only through a Google-approved cross-browser authorization
  architecture; do not restore direct legacy implicit OAuth by convenience.
