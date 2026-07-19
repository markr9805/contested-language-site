# Vendored: cosmos.gl (@cosmos.gl/graph)

WebGL point/graph rendering engine behind the occurrence cloud
(`cloud.html`). Vendored deliberately per docs/occurrence-cloud-design.md
§2 — self-hosted, fully client-side, no CDN at runtime.

## Provenance

- Package: `@cosmos.gl/graph` 3.3.0
- Source: https://registry.npmjs.org/@cosmos.gl/graph/-/graph-3.3.0.tgz
  (project: https://github.com/cosmosgl/graph)
- Fetched: 2026-07-19
- License: MIT — verified at vendoring time from the `LICENCE` file
  inside the 3.3.0 tarball (committed alongside the bundle). Note: the
  surrounding `@cosmograph/*` suite is CC-BY-NC-4.0 and is deliberately
  NOT vendored; only the MIT engine is.
- SHA-256 (tarball `graph-3.3.0.tgz`):
  `22a4fd009bccbbf5d1ed81b202441a70c80d77a13d139e547f074013cb3b57d4`
- SHA-256 (`3.3.0/index.min.js`, byte-identical copy of the tarball's
  `dist/index.min.js`):
  `173cc273dfcd49adbf2b639ed5d96270c66b6202059101ecf67fcc9924fa5666`

## Contents

- `3.3.0/index.min.js` — the prebuilt, self-contained UMD bundle (no
  bare-module imports; exposes a `Cosmos` global). The design doc
  anticipated an ESM `<script type="module">` load, but the package's
  plain ESM build (`dist/index.js`) carries unbundled `d3-*` imports
  that a buildless site cannot resolve; the UMD bundle is the
  self-contained artifact, loaded as a classic `<script>`. No bundler
  enters the repo either way.
- `3.3.0/LICENCE` — MIT license text as shipped in the tarball.
- Source maps are not vendored (2.4 MB, not needed at runtime).

## Upgrading

Pin the new version in a new `<version>/` directory, re-verify the
license is still MIT, record new SHA-256 hashes here, and update the
`<script>` tag in `cloud.html`.
