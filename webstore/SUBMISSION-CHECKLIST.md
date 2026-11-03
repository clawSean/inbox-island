# Chrome Web Store submission checklist

Submit the existing draft with **deferred publishing** after the exact package
gate. Chrome review, Arc/Dia pilot work, and Google restricted-scope
verification continue on separate timelines; none authorizes manual public
publication by itself.

## Automated/source gates

- [x] Canonical Web Store item ID and manifest key are pinned.
- [x] Manifest V3 package uses only `identity` plus the Gmail API host.
- [x] No side-panel, content-script, remote-code, telemetry, or broad-host
      permission remains.
- [x] Disconnected synthetic demo exists in the packaged extension.
- [x] Required 128px icon and two 1280×800 synthetic screenshots exist with
      hashes and zero external requests.
- [x] Listing, privacy-form, policy, and reviewer-instruction copy are drafted.
- [x] Public Git provenance, build instructions, release status, candidate
      artifact hashes, SBOM, support Issues, and private vulnerability reporting
      are live at `https://github.com/clawSean/inbox-island`.
- [x] Final privacy/support URLs are public, byte-matched to committed website
      source, and browser-proved at phone and desktop widths.
- [x] Exact 0.4.9 source/unit/browser/build/validator/UI gate passes with
      `162/162` tests after the release repairs.
- [x] Blind release-risk and exact-head technical reviews completed; their
      OAuth-contract, optional callback-scope, and clean-checkout validation
      findings were repaired and regression-tested.
- [x] Superseded October 22 upload ZIP was root-manifest, extracted,
      byte-diffed, revalidated, hashed, scanned, and tied to source commit
      `c83aca30dfa1129c5e6788643191ea448683d8c7`.
- [x] Replacement candidate rebuilt and validated from October 29 source
      `39c6b69a078828d3eb0d9f56a783d4d3cb419d01`; the 39-file ZIP hash is
      `876f3df6a6644870fc0afac3135c7206394b53c2fa55cf24aefe160e045c9138`.
- [ ] Regenerate the final upload ZIP from the clean reviewed source and tie
      its exact bytes to the package receipt and release tag.

## Product/quality gates

- [x] Mailreef's read-only grant was renewed on JPop's own device and passed
      bounded list/body canaries.
- [x] A bounded screened-summary sample informed source regressions; it is not
      an exact live-extension real-mail accuracy score.
- [ ] Exact native Arc and Dia live-account proof passes before those browser
      targets are advertised as release-proved. Current Arc automation exposes
      the Google chooser only as a hidden browser-owned target.
- [ ] JPop performs the visible 0.4.9 Arc/Dia pilot and confirms the popup,
      full page, demo, direct Gmail links, account selection, and fresh sync.
- [ ] Decide whether to retain **Inbox Island** publicly. An active paid
      privacy-email training product uses the exact name; no current Chrome Web
      Store listing or verified exact USPTO result was found, but that is not a
      clearance opinion.

## Google OAuth gates

- [ ] Freeze the public auth architecture. Current `launchWebAuthFlow` with a
      Web client works for the private Arc/Dia pilot but is Google's discouraged
      legacy implicit flow; Google's documented extension path is a Chrome
      Extension client with `getAuthToken()`.
- [ ] Create/use the production Google Cloud project, verify domains, finalize
      branding/support contacts, and switch the audience to In Production.
- [ ] Submit brand + restricted `gmail.readonly` verification with scope
      justification, privacy policy, architecture/data-flow explanation, and a
      complete consent/use demonstration video.
- [ ] Obtain Google's assessment determination. A client-only path with no
      restricted data transmitted through developer servers should be described
      exactly; Google decides whether any CASA/security assessment applies.

Google's current published estimate for restricted-scope verification is about
six weeks and is not guaranteed.

## Authenticated JPop dashboard steps

- [ ] Confirm Chrome Web Store developer account 2-Step Verification and
      publisher contact details.
- [ ] Upload the exact proven ZIP to the existing item.
- [ ] Paste `LISTING.md`, upload `assets/`, choose Productivity/English, and set
      the verified official/homepage/support URLs.
- [ ] Paste `PRIVACY-PRACTICES.md`, link the live privacy policy, and complete
      all Limited Use certifications truthfully.
- [ ] Paste `TEST-INSTRUCTIONS.md`; provide no shared Google credentials.
- [ ] Choose distribution and **deferred publishing**, then submit for review.
- [ ] After approval, validate the approved package and public OAuth state
      before manually publishing.
- [ ] Opt into Verified CRX Uploads only after generating and securely backing
      up its separate signing key; losing that key blocks future updates.

Authenticated Google/Store actions must occur in JPop's own browser, not on
ClawPop.
