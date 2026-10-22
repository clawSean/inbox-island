# ROADMAP — Inbox Island

Future sequencing only. Current truth and blockers live in `STATUS.md`.

## Now — Prove the policy-preferred Arc/Dia auth path

- Use the existing Chrome Extension OAuth client in disposable Arc and Dia
  profiles.
- Remove the prior `getProfileUserInfo()`/`identity.email` precondition and do
  not pass a Chrome-profile account to interactive `getAuthToken()`.
- Stop after proving whether an account/sign-in flow opens; do not use a personal
  account, grant Gmail consent, or access mailbox data.

**Advance when:** the result establishes whether the supported Chrome Extension
client can remain browser-neutral. The withdrawn `0.3.2` profile-gated result
does not answer this question.

## Fallback — Freeze staging-only portable OAuth

- Create `Inbox Island Browser OAuth` as a GCP **Web application** client.
- Register exactly:
  `https://jeemdbgakejlmmmbngpihndfkjiddbhl.chromiumapp.org/oauth2`.
- Record only the public Client ID; never retain or bundle its secret.
- Replace `PENDING_WEB_OAUTH_CLIENT_ID` in the canonical identity record and
  compiled auth source, mark the client active, independently pin its SHA-256
  in the native proof runner, and rerun validator gates.

**Advance when:** the supported client probe failed, the source and identity
record agree on a non-placeholder staging Web client, Google accepts the exact
redirect, and no secret exists in source, build, artifacts, or logs. This does
not approve the direct flow for public release.

## Next — Exact 0.4.5 proof in Arc and Dia

- Run unit, coverage, source-policy, quality, and exact extension validation.
- Build once, freeze the exact tree, and record a deterministic tree digest.
- In fresh disposable Arc and Dia profiles, prove:
  - exact extension ID/version and Manifest V3 load;
  - browser-owned popup and full-page launch;
  - persistent compact companion window plus explicit full-page launch;
  - exact `getRedirectURL("oauth2")` value;
  - zero OAuth/Gmail activity before a Connect click;
  - one trusted click launches Google's real chooser URL;
  - safe cancellation with no token, Gmail API call, or stored account state;
  - no unexpected runtime/page/console/network errors.
- Keep personal Arc/Dia profiles untouched. Close and trash disposable profiles
  after receipts are written.

**Advance when:** identical frozen bytes pass both browsers. A Chrome-only proof
does not count.

## Next — Package and own-device pilot

- Archive the exact proven tree with one wrapper folder.
- Extract independently; require clean file list, byte parity, validator pass,
  and matching tree digest.
- Deliver only that 0.4.5 ZIP with Arc and Dia install steps.
- JPop performs on his own device:
  1. literal toolbar/popup click;
  2. compact-window and full-page launch;
  3. explicit Google account selection;
  4. visible selected-address confirmation;
  5. sole `gmail.readonly` consent;
  6. first bounded sync;
  7. disconnect, reconnect, and chooser reappearance.

**Advance when:** a live bounded run succeeds without exposing credentials,
mailbox content, or browser-profile data to ClawPop.

## Pilot calibration

- Collect user corrections as explicit feedback, not silent mail capture.
- Measure Needs-me capture, false-important rate, uncertainty, and latency on
  natural pilot cases.
- Preserve deterministic risk/deadline/direction authority.
- Add rules or local inference only when a repeatable gap has hard positive and
  negative examples.

**Advance when:** the pilot demonstrates useful prioritization without hiding
important mail or creating unacceptable review burden.

## Production OAuth decision

- Reassess the private pilot's direct implicit token flow before public use.
- Compare Google Identity Services / authorization-code designs, backend trust
  boundaries, restricted-scope verification, and security-assessment impact.
- Preserve explicit account choice, least privilege, short-lived access,
  no refresh token in the extension, and no restricted-data server path unless
  a reviewed architecture explicitly changes that contract.
- Keep the current GCP project as testing. Create a separate production project
  only when this decision is frozen and verification preparation begins.
- Prefer a compliant pure-extension path; if unavailable across Arc/Dia, prefer
  a local installed-app OAuth/PKCE companion over a hosted token broker.

**Advance when:** the chosen production flow is current-policy compliant and
its privacy/security claims map to reproducible evidence.

## Distribution and hardening

- Establish Git/repository provenance and clean release commits.
- Decide public brand clearance before publishing.
- Prepare Store disclosures, privacy policy, threat model, SBOM, license and
  model provenance, deletion/revocation guide, and admin FAQ.
- Test update/downgrade/uninstall, storage quota, crash recovery, concurrent
  clears, multi-account stress, and managed-browser policy.
- Keep Unlisted distribution and organizational review separate from the
  private unpacked pilot.
- Implement `resources/PUBLICATION-TRUST-PLAN.md`: standard Store automatic
  updates, Verified CRX Uploads, release-tag/source/build/hash/SBOM
  transparency, stable permissions, and a GitHub/manual install lane.
- Publish a verified homepage with prominent source/audit links and truthful
  wording that distinguishes the broad `gmail.readonly` grant from Inbox
  Island's bounded runtime behavior.
- Publish `https://inboxisland.jpop.cloud/` as the canonical product page with obvious
  source, privacy, release, and install links.

## Deferred

- Disconnected synthetic demo and MBOX/Takeout evaluation.

- Complete-thread and incremental `history.list` sync.
- Attachment parsing, each format separately isolated and qualified.
- Any Gmail mutation or automated outbound action.
- A production local model unless evidence shows deterministic rules are
  insufficient.
- Native-app fallback unless browser runtime/distribution proves inadequate.
