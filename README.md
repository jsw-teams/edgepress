# EdgePress

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jsw-teams/edgepress)

The button creates a copy of this repository in your GitHub account and a new Worker in your Cloudflare account. It is for creating a separate site, not updating an existing one. Choose unused destination repository and Worker names during setup. If `edgepress` already exists, choose a different name such as `my-edgepress-site`; to update an existing deployment, use that repository's connected Workers Builds integration instead of clicking the button again.

EdgePress builds static websites for Cloudflare Workers. Write posts in Markdown, compose pages from editable rows and elements, choose a shared theme, and build the site into dist/.

## Quick start

Install EdgePress from npm and initialize a new project directory:

    mkdir my-edgepress-site
    cd my-edgepress-site
    npm install edgepress
    npx edgepress init
    npm install
    npm run dev

Use Node.js 22.12 or newer. Set the real site URL and operator contact in config.yml before publishing. Deploy with edgepress deploy. When developing EdgePress itself, use `npm ci`, then `npm link` to expose the local CLI.

Run `edgepress init` in a new project directory to scaffold a site pinned to the installed EdgePress release. The initializer keeps the existing package name and scripts.

## Everyday writing

After the one-time site setup, create an article with `npm run new -- "My first article"`. Open the printed file path and write Markdown below the second `---` line. The command fills the title, date, and language; the theme supplies the page title, article list, contents, search, and feed.

Use `##` for sections, lists, links, and fenced code blocks as needed. Put article images in `content/assets/images/` and link to `/images/filename.png`. Run `npm run dev` while writing, then `npm run build` before publishing through your existing deployment workflow. Page layouts and theme development are optional for everyday writing.

日常发文：运行 `npm run new -- "我的第一篇文章"`，打开输出的文件，在第二个 `---` 后写 Markdown 正文。标题、日期和语言自动填写。运行 `npm run dev` 预览，发布前运行 `npm run build`。页面布局和主题开发可以在需要调整设计时再了解。

## Page editing

Each page has a folder under content/pages/ and one lowercase locale Markdown file per language. Keep the file body empty after its YAML front matter. Edit the ordered blocks there:

- Choose a row column count first.
- Add one cell per column.
- Choose element types inside each cell.
- Edit each element's copy, media, links, and presentation options in that page file.

Put images and other page media in content/assets/, preserving their public URL path. For example, content/assets/images/diagram.svg is published as /images/diagram.svg. Posts under content/posts/ use the Markdown renderer. Themes own shared head, navigation, footer, error-page layout, and their CSS color palettes.

## Project files

The 2026.10.2 source uses a giant panda and Taiwanese black bear as its shared project identity, with 28 transparent local raster icons. Generated avatar masters and exact prompts are saved in `content/brand-sources/`; the original full-body and homepage masters are `mascot.png` and `home-hero.png` in `content/assets/edgepress/brand/`. Favicons and icons are in `content/assets/edgepress/favicon/` and `content/assets/edgepress/icons/`. Themes apply bitmap filters for dark backgrounds. The technical Markdown pipeline diagram keeps its editable SVG source.

To export the saved imagegen masters, install Pillow and run `python tools/generate-brand-assets.py --master content/assets/edgepress/brand/mascot.png --avatar-master content/brand-sources/edgepress-avatar-master.png --home-master content/assets/edgepress/brand/home-hero.png --output-dir content/assets/edgepress/brand --icons-dir content/assets/edgepress/icons --favicon-dir content/assets/edgepress/favicon --brand edgepress`. Functional icons are drawn directly as raster images; old SVGs are not rasterized. Run `python tools/verify-brand-assets.py .` and `node tools/verify-brand.mjs .` to check dimensions, transparency, resource paths, themes, mobile layout, and keyboard access. Browser verification uses an installed Microsoft Edge browser; screenshots and results are saved under `tools/brand-verification/`.

- content/posts/<post-id>/: Markdown articles with one file per locale.
- content/pages/<page-id>/: page layouts and all page element content.
- content/assets/: page images and other content media, copied to the output root with matching paths.
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
- edgepress server: start live local preview, rebuild on source changes, and refresh the PDF audit report.
- edgepress check: build, audit accessibility, agent-friendliness, and Markdown rendering, capture post/page desktop and mobile screenshots temporarily, and write only the PDF report under tools/.
- edgepress doctor: inspect runtime and Worker compatibility.
- edgepress theme list and edgepress theme use <name>: inspect or select an installed theme.
- edgepress theme install <npm-package>[@version]: install a theme package from npm without running its install scripts.
- edgepress theme create <name>: make an empty, accessible HTML theme skeleton with editable partials and a blank stylesheet.
- edgepress secret put BACKEND_TOKEN: store the backend token in Wrangler.
- edgepress deploy: build and deploy to Cloudflare Workers.
- Connect a GitHub repository to Cloudflare Workers Builds to deploy on pushes to main. Set root directory `/`, build command `npm run build`, deploy command `npx wrangler deploy`, and leave build variables empty. See the [Cloudflare build troubleshooting guide](content/pages/quick-start/) if initialization stalls before commands run.
- edgepress clean: remove generated site and report files.
- edgepress iterate: create a report-only maintenance plan.
- edgepress security: check dependency advisories.

The only persisted page-audit report is the accessible PDF at tools/page-check.pdf. Desktop and mobile screenshots are embedded in the PDF and removed from temporary storage afterward. Automated checks do not replace manual accessibility or legal review.

The main navigation includes a Posts entry to the localized article archive. The header search page filters Markdown posts from the generated local search index; it does not send search queries to an external service. Long articles show a floating, scroll-aware table of contents, and code blocks have accessible copy buttons. The first post, “EdgePress and Markdown: a complete writing guide,” documents and verifies the supported Markdown syntax in English and Chinese.

Project guides are published from content/pages/: project introduction, quick start, theme development, plugin development, and privacy policy. The public project page and release notes are hosted at [www.js.gripe/edgepress/](https://www.js.gripe/edgepress/). This repository remains the framework and reusable demo source. The starter config uses the placeholder `https://example.org` and credits `toewpq`. Before production use, confirm that the configured operator name identifies the responsible person or organization and complete any applicable representative or data protection officer details.

Version 2026.10.1 starts the October 2026 release series. Read the [October release notes](content/posts/2026-10-01-edgepress-release-2026-10-1/). The September updates are recorded in the [request 1 notes](content/posts/2026-09-24-edgepress-release-2026-9-1/), [request 2 notes](content/posts/2026-09-25-edgepress-release-2026-9-2/), [request 3 notes](content/posts/2026-09-25-edgepress-release-2026-9-3/), [request 4 notes](content/posts/2026-09-25-edgepress-release-2026-9-4/), [request 5 notes](content/posts/2026-09-25-edgepress-release-2026-9-5/), [request 6 notes](content/posts/2026-09-25-edgepress-release-2026-9-6/), [request 7 notes](content/posts/2026-09-26-edgepress-release-2026-9-7/), [request 8 notes](content/posts/2026-09-26-edgepress-release-2026-9-8/), [request 9 notes](content/posts/2026-09-26-edgepress-release-2026-9-9/), and [request 10 notes](content/posts/2026-09-27-edgepress-release-2026-9-10/).

This release publishes page media from content/assets/, updates Wrangler to 4.144.0, and adds scheduled dependency checks and version-scoped Codex Security scans. Optional services remain disabled until a visitor makes an explicit choice.

## Journal categories, navigation, and author profiles

In article front matter, set `category: blog` or `category: edgepress`. Omitted categories default to `uncategorized`; the CLI creates that default. Keep `tags: [Markdown, EdgePress]` for labels displayed on the article itself. Article pages show the author, optional avatar, publication date, and estimated reading time (200 words or 300 CJK characters per minute, combined, rounded up).

Configure the journal and default author in `config.yml`:

```yaml
site:
  archive:
    categories: [博客, 未分类]
  author:
    name: Your name
    avatar: /images/authors/me.png
  navigation:
    - key: projects
      url: /projects/
      labels:
        en: Projects
      children:
        - key: edgepress
          url: /edgepress/
          labels:
            en: EdgePress
```

Place your avatar in `content/assets/images/authors/me.png`. Avatars accept site-root paths or HTTPS URLs. To override one article, use `author: {name: Guest, avatar: /images/authors/guest.png}` or an author string with `authorAvatar: /images/authors/guest.png`. Unspecified authors fall back to `site.author.name`, then `site.seo.author`; unspecified avatars use the site default. Use your own portrait or omit the optional avatar.

Navigation `children` turns an item into a native select with localized options and accessible labels. The parent page remains the first option; without JavaScript, all options appear as links. Only one child level is supported, and child URLs use the same validation as normal navigation.

Use `category: edgepress` or `categories: [blog, uncategorized]` on a `post-list` block. `latest-posts` without an explicit filter inherits `site.archive.categories`. Homepage pagination must use that same category set. To change only the number shown on a project page, edit its block's `count` (1–12); the full category archive remains paginated and available.
