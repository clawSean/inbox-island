# Build and verify

Requirements: Node.js 22+, a Chromium browser, `zip`, `unzip`, and standard
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

`npm run verify` checks browser-core source policy, 157 unit/integration
contracts, development-quality invariants, synthetic triage, browser behavior,
the exact extension build, manifest/OAuth boundaries, and network-isolated UI
proof.

Native Arc/Dia proof is deliberately separate because it needs an unlocked
macOS desktop and a closed personal target browser:

```sh
export PLAYWRIGHT_CORE_PACKAGE=/absolute/path/to/playwright-core
npm run native:proof:portable -- --browser arc
npm run native:proof:portable -- --browser dia
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

Do not treat a package as releasable until its exact source commit, native proof
receipts, archive SHA-256, public tag, and Store submission record agree.
