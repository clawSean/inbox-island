# Build and verify

Requirements: Node.js 22+, Google Chrome, `zip`, `unzip`, and standard
macOS/Linux command-line tools. The extension has no npm package dependencies,
package lock, remote build step, or generated runtime code. Browser proof uses
an existing `playwright-core` installation supplied explicitly so this
repository never installs or downloads a browser during verification.

```sh
export PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs
export CHROME_PATH=/absolute/path/to/Chromium-or-Chrome
```

```sh
npm run verify
npm run webstore:assets
```

`npm run verify` checks browser-core source policy, unit/integration
contracts, development-quality invariants, synthetic triage, browser behavior,
the exact extension build, manifest/OAuth boundaries, and network-isolated UI
proof.

The public OAuth proof is deliberately separate because it opens Google's real
account chooser in a fresh disposable Chrome profile. It requires an unlocked
macOS desktop, stops before account selection, and asserts zero Gmail requests:

```sh
export PLAYWRIGHT_CORE_PACKAGE=/absolute/path/to/playwright-core
npm run proof:oauth:chrome
```

After all release changes are committed and the working tree is clean:

```sh
npm run webstore:package
```

The packager rebuilds the extension, removes only the development-only manifest
`key` and internal build marker, places `manifest.json` at the ZIP root,
normalizes timestamps, extracts and byte-compares the archive, revalidates the
Store transform, scans for private-key/secret-shaped content, and writes
`webstore/PACKAGE-RECEIPT.json`. The Store item supplies the canonical extension
identity.

For public release, require the exact source commit, archive SHA-256, public
tag, reviewer instructions, Store submission record, Chrome OAuth proof, Google
restricted-scope verification, and a Chrome live-account pilot to agree. Do not
advertise Arc or Dia support for `0.5.0`; their fresh-profile probes reach
Google's provider-error page for the Chrome Extension OAuth client.
