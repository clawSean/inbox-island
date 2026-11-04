# Chrome Web Store and Google submission checklist

The first public release is Google Chrome-only. Chrome Web Store review and
Google restricted-scope verification are separate processes; both must finish
before manual public publication.

## Automated/source gates

- [x] Canonical Store item ID and manifest key are pinned.
- [x] Manifest V3 package uses only `identity`, the Gmail API host, the Chrome
      Extension OAuth client, and `gmail.readonly`.
- [x] No side panel, content script, remote code, telemetry, broad host,
      refresh token, client secret, or Gmail mutation permission exists.
- [x] Disconnected synthetic demo and synthetic Store assets exist.
- [x] Public source, support, privacy, SBOM, and reproducible package tooling
      exist.
- [x] Public auth architecture is frozen on `getAuthToken()` for Google Chrome.
- [x] Fresh Arc and Dia probes record Google provider errors, so neither browser
      is advertised as supported.
- [x] Complete `0.5.0` verification gate passes after the public-auth change:
      `163/163` tests plus quality, synthetic, browser, build, validator, and UI
      proofs.
- [ ] Final Store ZIP is built from clean committed source, extracted,
      byte-compared, revalidated, scanned, hashed, and recorded.
- [ ] Final independent release review has no unresolved P0–P2 finding.

## Product/quality gates

- [x] Screened Mailreef summaries informed conservative classifier regressions;
      they are not presented as exact live-extension accuracy.
- [x] Exact `0.5.0` disposable Chrome proof reaches Google's real chooser from
      a trusted click with zero Gmail requests.
- [ ] An authorized live-account Chrome pilot proves disclosure, consent,
      returned-address confirmation, bounded sync, Gmail link, token cleanup,
      Disconnect, and local-data clear on the exact package.
- [ ] Final public brand is approved. The current Inbox Island name overlaps an
      active paid email-privacy training product; no legal clearance is claimed.

## Google OAuth gates

- [x] Verification packet, scope justification, no-server data-flow statement,
      assessment posture, and video script are complete in
      `resources/GOOGLE-OAUTH-VERIFICATION.md`.
- [ ] Remove the unused Web application OAuth client from the dedicated
      `inbox-island` project.
- [ ] Finalize branding/support contacts and verify `jpop.cloud`.
- [ ] Confirm Data Access contains only `gmail.readonly` and switch Audience to
      In Production.
- [ ] Record the complete consent/use video with the exact candidate.
- [ ] Submit Branding and restricted-scope verification.
- [ ] Obtain Google's security-assessment determination and resolve every
      review follow-up.

## Authenticated Chrome Web Store steps

- [ ] Confirm developer-account 2-Step Verification and publisher contacts.
- [ ] Upload the final exact ZIP to existing item
      `jeemdbgakejlmmmbngpihndfkjiddbhl`.
- [ ] Paste `LISTING.md`, upload `assets/`, select Productivity/English, and set
      the verified homepage/support URLs.
- [ ] Paste `PRIVACY-PRACTICES.md`, link the privacy policy, and complete all
      User Data/Limited Use certifications truthfully.
- [ ] Paste `TEST-INSTRUCTIONS.md`; provide no shared Google credentials.
- [ ] Choose distribution and **deferred publishing**, then submit for review.
- [ ] After both approvals, verify the approved package and repeat the live
      Chrome pilot before manual publication.
- [ ] Opt into Verified CRX Uploads only after its separate signing key is
      generated, securely backed up, and recovery-owned.

Authenticated Google and Store actions must occur in JPop's own browser, not in
a personal Google session on ClawPop.

Do not manually publish until Google verification, Store approval, exact-byte
revalidation, and the final live-account Chrome pilot all pass.
