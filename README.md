# EdgePress

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jsw-teams/edgepress)

The button deploys this repository's demo site to your Cloudflare account. To create a new site, follow the npm quick start below.

EdgePress builds static websites for Cloudflare Workers. Write posts in Markdown, compose pages from editable rows and elements, choose a shared theme, and build the site into dist/.

## Quick start

Install EdgePress from npm and initialize a new project directory:

    mkdir my-edgepress-site
    cd my-edgepress-site
    npm install edgepress
    edgepress init
    npm install
    edgepress server

Use Node.js 22.12 or newer. Set the real site URL and operator contact in config.yml before publishing. Deploy with edgepress deploy. When developing EdgePress itself, use `npm ci`, then `npm link` to expose the local CLI.

Run `edgepress init` in a new project directory to scaffold a site pinned to the installed EdgePress release. The initializer keeps the existing package name and scripts.

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
- themes/default/, themes/atelier/, themes/signal/: shared HTML layouts, partials, and theme styles. Themes installed from npm or created as a blank scaffold live here too.
- config.yml: site metadata, navigation, privacy settings, and consent-gated browser services.
- edgepress.config.mjs: paths, permalink, locales, and trusted build-time plugins.
- languages/base/ and languages/packs/: interface dictionaries.
- src/: CLI, builder, Markdown renderer, element renderer, page auditor, and Worker entry.
- dist/: generated output. Never edit generated files by hand.

## Commands

- edgepress init: scaffold a new site in a project directory.
- edgepress new "Article title": create a Markdown post.
- edgepress build and edgepress generate: run the same generator and write static files to dist/ for Cloudflare Workers or static hosting.
- edgepress server: start live local preview, rebuild on source changes, and refresh the audit report.
- edgepress check: build, generate accessibility, agent-friendliness, and Markdown rendering findings, capture post/page desktop and mobile screenshots, and write the PDF report under tools/.
- edgepress doctor: inspect runtime and Worker compatibility.
- edgepress theme list and edgepress theme use <name>: inspect or select an installed theme.
- edgepress theme install <npm-package>[@version]: install a theme package from npm without running its install scripts.
- edgepress theme create <name>: make an empty, accessible HTML theme skeleton with editable partials and a blank stylesheet.
- edgepress secret put BACKEND_TOKEN: store the backend token in Wrangler.
- edgepress deploy: build and deploy to Cloudflare Workers.
- Connect a GitHub repository to Cloudflare Workers Builds to deploy on pushes to main. The build and deploy scripts are detected from package.json.
- edgepress clean: remove generated site and report files.
- edgepress iterate: create a report-only maintenance plan.
- edgepress security: check dependency advisories.

The generated report is written to tools/page-check.md and tools/page-check.json. The accessible HTML source is tools/page-check-visual.html; the tagged PDF report is tools/page-check.pdf, with desktop and mobile post/page screenshots in tools/page-check-screenshots/. The mobile entries include their measured viewport and document widths. These automated checks do not replace manual accessibility or legal review.

The header search page filters Markdown posts from the generated local search index; it does not send search queries to an external service. The first post, “EdgePress and Markdown: a complete writing guide,” documents and verifies the supported Markdown syntax in English and Chinese.

Project guides are published from content/pages/: project introduction, quick start, theme development, plugin development, and privacy policy. The privacy policy intentionally reports that the starter site still needs a real site URL, operator name, and privacy contact before publication.

Version 2026.9.3 records the third requested release update for September 2026. It is available as the `edgepress` npm package. See the [request 1 notes](content/posts/2026-09-24-edgepress-release-2026-9-1/), [request 2 notes](content/posts/2026-09-25-edgepress-release-2026-9-2/), and [request 3 notes](content/posts/2026-09-25-edgepress-release-2026-9-3/).
