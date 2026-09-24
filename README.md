# EdgePress

EdgePress builds static websites for Cloudflare Workers. Write posts in Markdown, compose pages from editable rows and elements, choose a shared theme, and build the site into dist/.

## Quick start

Install the locked dependencies once. When working from this source checkout, run npm link once to expose its CLI, then use the EdgePress command:

    npm ci
    npm link
    edgepress build
    edgepress server

Use Node.js 22.12 or newer. Set the real site URL and operator contact in config.yml before publishing. Deploy with edgepress deploy.

Run `edgepress init` in an empty directory to scaffold a site pinned to the matching stable EdgePress release.

## Page editing

Each page has a folder under content/pages/ and one lowercase locale Markdown file per language. Keep the file body empty after its YAML front matter. Edit the ordered blocks there:

- Choose a row column count first.
- Add one cell per column.
- Choose element types inside each cell.
- Edit each element's copy, media, links, and presentation options in that page file.

Posts under content/posts/ use the Markdown renderer. Themes own shared head, navigation, footer, error-page layout, and their CSS color palettes.

## Project files

- content/posts/<post-id>/: Markdown articles with one file per locale.
- content/pages/<page-id>/: page layouts and all page element content.
- themes/default/, themes/atelier/, themes/signal/: shared HTML layouts, partials, and theme styles.
- config.yml: site metadata, navigation, privacy settings, and consent-gated browser services.
- edgepress.config.mjs: paths, permalink, locales, and trusted build-time plugins.
- languages/base/ and languages/packs/: interface dictionaries.
- src/: CLI, builder, Markdown renderer, element renderer, page auditor, and Worker entry.
- dist/: generated output. Never edit generated files by hand.

## Commands

- edgepress init: scaffold a new site in an empty directory.
- edgepress new "Article title": create a Markdown post.
- edgepress build: build the static site.
- edgepress server: start live local preview, rebuild on source changes, and refresh the audit report.
- edgepress check: build, generate accessibility, agent-friendliness, and Markdown rendering findings, capture post/page desktop and mobile screenshots, and write the PDF report under tools/.
- edgepress doctor: inspect runtime and Worker compatibility.
- edgepress theme list and edgepress theme use <name>: inspect or select a theme.
- edgepress secret put BACKEND_TOKEN: store the backend token in Wrangler.
- edgepress deploy: build and deploy to Cloudflare Workers.
- edgepress clean: remove generated site and report files.
- edgepress iterate: create a report-only maintenance plan.
- edgepress security: check dependency advisories.

The generated report is written to tools/page-check.md and tools/page-check.json. The accessible HTML source is tools/page-check-visual.html; the tagged PDF report is tools/page-check.pdf, with desktop and mobile post/page screenshots in tools/page-check-screenshots/. The mobile entries include their measured viewport and document widths. These automated checks do not replace manual accessibility or legal review.

The header search page filters Markdown posts from the generated local search index; it does not send search queries to an external service. The first post, “EdgePress and Markdown: a complete writing guide,” documents and verifies the supported Markdown syntax in English and Chinese.

Project guides are published from content/pages/: project introduction, quick start, theme development, plugin development, and privacy policy. The privacy policy intentionally reports that the starter site still needs a real site URL, operator name, and privacy contact before publication.

Version 2026.9.2 records the second requested release update for September 2026. See the [request 1 notes](content/posts/2026-09-24-edgepress-release-2026-9-1/) and [request 2 notes](content/posts/2026-09-25-edgepress-release-2026-9-2/).
