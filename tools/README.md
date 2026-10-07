# Development tools

Tests and their media fixtures live in `../tests/`. The `.mjs` extension identifies Node ES modules; it does not make a script temporary.

| Directory | Purpose |
| --- | --- |
| `assets/` | Icons, licensed font subsets and source asset derivatives |
| `recordings/` | Real guest desktop demonstrations using FFmpeg, Playwright and guest X11 tools |
| `verification/` | Browser and asset verification commands |
| `reports/` | Current generated review evidence; `page-check.pdf` comes from `npm run check` |

Run commands from the project root. Raw recordings and temporary manifests use ignored `tools/.recordings/`; intermediate verification output uses ignored `tools/.verification/`. Replaced historical reports are archived outside the checkout.

`npm run fonts:sync` vendors pinned Noto WOFF2 Unicode subsets from Fontsource, verifies archive integrity, preserves OFL licenses and records file hashes under `static/edgepress/fonts/`. Normal builds use these committed files offline. The operator site's existing framework checkout also carries these assets; synchronize that directory when deliberately updating the font release.
