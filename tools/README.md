# Development tools

Tests and fixtures live in `../tests/`. The `.mjs` extension identifies Node ES modules.

| Directory | Purpose |
| --- | --- |
| `assets/` | Icons, licensed font subsets, and page JSON formatter |
| `maintenance/` | Zero-dependency audit helper |
| `release/` | Monthly release version helper |
| `reports/` | Current generated review evidence (`page-check.pdf` comes from `npm run check`) |

Run commands from the project root. `npm run fonts:sync` vendors pinned Noto WOFF2 Unicode subsets under `static/edgepress/fonts/`. Normal builds subset those files automatically to the characters your site uses.
