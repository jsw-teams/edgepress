# Pages Formatting and Verification Tools

For Pages readability, import `formatPages` from `edgepress/tools/assets/format-pages.mjs`. Run `await formatPages(process.cwd())` to preview proposed changes, or pass `{ write: true }` to apply them.

It converts legacy Markdown/YAML Pages to formatted `.json` files and links the local `$schema`. Conversion checks parsed field values and element order, verifies every file before writing, refuses duplicate locale formats, and rejects non-empty Markdown bodies.

From the framework checkout, run `node tools/assets/format-pages.mjs --write` to format the example site. To audit generated HTML structure and optional system-browser screenshots (`EDGEPRESS_BROWSER` or local Edge/Chrome/Chromium), run `edgepress check`.
