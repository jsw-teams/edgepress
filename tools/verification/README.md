# Theme verification

Run these optional development tools from a built EdgePress site's root. They use isolated Playwright Chromium with extensions disabled and local static fixtures. Install Playwright in the site's development dependencies and run `npx playwright install chromium` first. No live service accounts or deployments are verified.

For a theme that declares `dataSaver` in `theme.json`, create `tests/data-saver-site.test.mjs`:

```js
import {fileURLToPath} from 'node:url';
import {registerDataSaverTests} from 'edgepress/tools/verification/data-saver-site.mjs';

registerDataSaverTests(fileURLToPath(new URL('../', import.meta.url)), {
  locales: ['en', 'zh-CN'],
  paths: ['/', '/about/'],
  noJsPaths: ['/'],
  coldPaths: ['/'],
});
```

The suite checks full/text layouts, readable no-JavaScript output, real throttled transfers, early keyboard switching, stable waiting-screen choices, localized controls, disabled production debug entry, and absence of premature third-party requests. Use actual paths and enabled locales from your site. It expects the operator's explicit full-view defaults:

```yaml
site:
  dataSaver:
    enabled: true
    debug: false
    mode: auto
    detectSlowConnection: true
    respectBrowserPreference: false
```

Full and text views retain prose by default. A dynamic application can explicitly set `compareProse: false` if its anonymous fixture differs, while keeping headings, navigation, captions, cards and geometry checks. API fixtures contain anonymous synthetic responses; application-specific interactions and consent checks belong in the site's own tests.

Run `node --test tests/data-saver-site.test.mjs`. `DATA_SAVER_SCREENSHOTS=tools/reports/data-saver` optionally retains screenshots and JSON measurements. The test does not enable data-saving support in themes that do not declare it.

For a cold-cache benchmark, add `tools/verification/page-performance.mjs`:

```js
process.env.PERFORMANCE_PATHS ||= JSON.stringify(['/', '/about/']);
await import('edgepress/tools/verification/page-performance.mjs');
```

Run it from the site root. Transfers use gzip, 100 KB/s and 150 ms latency. `PERFORMANCE_DIST` can select built output; `PERFORMANCE_OUTPUT=tools/reports/performance` retains evidence. Content-ready time, FCP and the observed LCP candidate are reported separately.

For Pages readability, import `formatPages` from `edgepress/tools/assets/format-pages.mjs`. `await formatPages(process.cwd())` lists proposed changes; `{write: true}` applies them. It converts legacy Markdown/YAML Pages to real, formatted `.json` files and sets a local `$schema` reference. Conversion verifies parsed field values and element order, checks all files before writing, refuses duplicate locale formats, and rejects nonempty Markdown bodies. VS Code's JSON outline and folding work on the actual page → row → cell → element hierarchy. From the framework checkout, `node tools/assets/format-pages.mjs --write` formats the example site.
