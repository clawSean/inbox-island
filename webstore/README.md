# Chrome Web Store submission kit

Updated 2026-11-03 for canonical item ID
`jeemdbgakejlmmmbngpihndfkjiddbhl`.

This directory contains copy and synthetic-only assets for the existing Web
Store draft. It is not proof that the extension or Google OAuth app has been
approved.

The public source/support repository and final privacy endpoints are live:

- https://github.com/clawSean/inbox-island
- https://inboxisland.jpop.cloud/
- https://inboxisland.jpop.cloud/privacy/

## Contents

- `LISTING.md` — Store Listing form copy and URLs.
- `PRIVACY-PRACTICES.md` — Privacy tab answers and prominent disclosure.
- `PRIVACY-POLICY.md` — canonical public policy source.
- `TEST-INSTRUCTIONS.md` — reviewer steps requiring no account or credentials.
- `SUBMISSION-CHECKLIST.md` — exact gates, human dashboard steps, and deadline.
- `SBOM.spdx.json` — SPDX 2.3 package inventory; the extension has no npm
  dependencies.
- `assets/` — 128px icon, two 1280×800 screenshots, and SHA-256 receipt.
- `PACKAGE-RECEIPT.json` — candidate package hash and proof generated from a
  clean committed tree by the reproducible Store packager.

Regenerate the synthetic-only assets after building:

```sh
npm run webstore:assets
```

After the exact release source is committed and the working tree is clean:

```sh
npm run webstore:package
```

The Store ZIP has `manifest.json` at its root. The packager removes only the
development-only manifest `key` and internal build marker, then extracts,
byte-compares, revalidates, scans, and hashes the result.

## Current boundary

The published `0.4.9` ZIP is a historical deferred-review artifact and must not
be made public. `0.5.0` replaces its private Web OAuth flow with the documented
Chrome Extension client and is the only public-release candidate. Its final
source, package-tree, and ZIP receipt will replace `PACKAGE-RECEIPT.json` only
after the complete clean-tree release gate passes.

Public Gmail authorization remains a separate Google review:
`gmail.readonly` is restricted. The first release supports Google Chrome only;
Arc and Dia are excluded from the support claim because their fresh-profile
OAuth probes reach Google's provider-error page. Brand approval, live-account
Chrome proof, Store submission, Google verification, and Google's assessment
determination remain before manual publication.

## Primary sources checked 2026-11-03

- Package preparation: https://developer.chrome.com/docs/webstore/prepare
- Listing fields/assets: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User-data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Publishing: https://developer.chrome.com/docs/webstore/publish
- Review timing: https://developer.chrome.com/docs/webstore/review-process
- Verified uploads: https://developer.chrome.com/blog/verified-uploads-cws
- Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Restricted-scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- OAuth timing FAQ: https://support.google.com/cloud/answer/13463817
