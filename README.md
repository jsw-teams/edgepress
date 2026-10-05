# EdgePress

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jsw-teams/edgepress)
[![Deploy to EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fjsw-teams%2Fedgepress&build-command=npm%20run%20build&install-command=npm%20ci&output-directory=dist)
[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjsw-teams%2Fedgepress)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jsw-teams/edgepress)
[![Import into ESA Pages](content/assets/edgepress/brand/deploy-esa.svg)](https://esa.console.aliyun.com/edge/pages/creation)

The Cloudflare button creates a copy of this repository in your GitHub account and a new Worker in your Cloudflare account. It is for creating a separate site, not updating an existing one. Choose unused destination repository and Worker names during setup. If `edgepress` already exists, choose a different name such as `my-edgepress-site`; to update an existing deployment, use that repository's connected Workers Builds integration instead of clicking the button again.

EdgePress builds static websites for Cloudflare, Vercel, Netlify, Tencent EdgeOne Pages and Alibaba Cloud ESA Pages.

Content images open a zoomable, closable viewer. The [media-viewer component](https://github.com/jsw-teams/media-viewer) is bundled locally; original images load on click when an original URL is provided.

Enable `showChanges: true` in an article's front matter to explain the latest edit. Readers see formatted **Previously / Now** passages and clear additions or removals, with responsive cards that inherit the theme palette. Git remains a build-time source of history; patch markers and repository metadata are not published in the change view.

![An article update rendered as readable before-and-after cards](content/assets/images/previews/edgepress-revisions-en.png)

[中文说明：写文建站](content/guides/zh-cn.md) | [Free-tier comparison](content/guides/platforms.md)

![EdgePress website preview](content/assets/images/previews/edgepress-en.webp)

Buttons open repository setup. Cloudflare, Vercel, Netlify and EdgeOne support repository templates; ESA opens its official import screen, where you authorize GitHub and select the repository. Every static platform uses `npm run build` and `dist/`; no database or website Function is required. Write posts in Markdown, compose pages from editable rows and elements, choose a shared theme, and build the site into dist/.

## Quick start

The commands below install the published npm release and initialize a new project directory. For the latest GitHub changes, use the deployment buttons or clone this repository, then run `npm ci` and `npm run dev` from its root:

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

The shared project identity uses a giant panda and Taiwanese black bear. All content media and saved masters live in `content/assets/`. UI icons use 28 licensed Lucide SVGs, with the pinned source version and license in `content/assets/edgepress/icons/`.

Brand image derivatives can be exported from the saved masters with `tools/generate-brand-assets.py` and Pillow. Keep generated UI icons separate: install dependencies and run `npm run icons:sync`. Verify assets with `python tools/verify-brand-assets.py .` and `node tools/verify-brand.mjs .`.

- content/posts/<post-id>/: Markdown articles with one file per locale.
- content/pages/<page-id>/: page layouts and all page element content.
- content/assets/: page images and other content media, copied to the output root with matching paths.
- themes/default/, themes/atelier/, themes/signal/: shared HTML layouts, partials, and theme styles. Themes installed from npm or created as a blank scaffold live here too.
- config.yml: site metadata, navigation, privacy settings, and consent-gated browser services.
- edgepress.config.mjs: paths, permalink, locales, and trusted build-time plugins.
- languages/base/ and languages/packs/: interface dictionaries.
- src/: CLI, builder, Markdown renderer, element renderer, page auditor, and platform deployment helpers.
- dist/: generated output. Never edit generated files by hand.

## Commands

- edgepress init: scaffold a new site in a project directory.
- edgepress new "Article title": create a Markdown post.
- edgepress build and edgepress generate: run the same generator and write static files to dist/ for Cloudflare Workers or static hosting.
- edgepress server: start live local preview, rebuild on source changes, and refresh the PDF audit report.
- edgepress check: build, audit page structure, agent-friendliness, and Markdown rendering, simulate device profiles, inspect the browser accessibility tree and sample keyboard navigation, capture screenshots temporarily, and write only the PDF report under tools/.
- edgepress doctor: verify static publishing configuration; a pure static project requires no Worker entry or backend bindings.
- edgepress theme list and edgepress theme use <name>: inspect or select an installed theme.
- edgepress theme install <npm-package>[@version]: install a theme package from npm without running its install scripts.
- edgepress theme create <name>: make an empty, accessible HTML theme skeleton with editable partials and a blank stylesheet.
- edgepress deploy [cloudflare|vercel|edgeone|esa]: build and deploy static output using the chosen platform CLI.
- Connect a GitHub repository to Cloudflare Workers Builds to deploy on pushes to main. Set root directory `/`, build command `npm run build`, deploy command `npx wrangler deploy`, and leave build variables empty. See the [Cloudflare build troubleshooting guide](content/pages/quick-start/) if initialization stalls before commands run.
- edgepress clean: remove generated site and report files.
- edgepress iterate: create a report-only maintenance plan.
- edgepress security: check dependency advisories.

The only persisted page-audit report is the accessible PDF at tools/page-check.pdf. Desktop and mobile screenshots are embedded in the PDF and removed from temporary storage afterward. Automated checks do not replace manual accessibility or legal review.

`edgepress check` supports page-only sites, an absent `content/posts/` directory, and ordinary articles without a tutorial slug. Markdown self-checks render a built-in fixture in memory and never add articles to your site. Actual generated pages still receive structural and resource-link checks.

When Edge, Chrome or Chromium is installed, the audit runs desktop (1440px), phone (390px) and tablet (820px) profiles in light and dark modes. Phone/tablet profiles emulate pixel density and touch capability. It checks main/heading semantics and accessible names through the [Chromium DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/), and sends real Tab, Shift+Tab and Enter events to the isolated headless browser. Keyboard checks sample at most 12 focus stops, verify focus visibility and backward navigation, and activate the skip-to-main link. Browser failures affect the check result; missing browser support is reported as unavailable, never as a pass.

These are browser simulations, not physical-device or screen-reader tests. The tool launches no visible browser window, mutes its own browser audio and disables notifications, does not send keyboard input to your desktop, and never starts Narrator, NVDA, VoiceOver or TalkBack. Physical devices and actual assistive technology require a separate, authorized test environment. The PDF labels this limitation explicitly.

The main navigation includes a Posts entry to the localized article archive. The header search page filters Markdown posts from the generated local search index; it does not send search queries to an external service. Long articles show a floating, scroll-aware table of contents, and code blocks have accessible copy buttons. Markdown verification runs independently of published content.

Project guides are published from content/pages/: project introduction, quick start, theme development, plugin development, and privacy policy. The public project page and release notes are hosted at [js.gripe/edgepress/](https://js.gripe/edgepress/). This repository remains the framework and reusable demo source. The starter config uses the placeholder `https://example.org` and credits `toewpq`. Before production use, confirm that the configured operator name identifies the responsible person or organization and complete any applicable representative or data protection officer details.

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

Navigation `children` turns an item into a native select with localized options and accessible labels. A disabled display placeholder keeps the parent label visible; the parent page is the first selectable option, so selecting it always opens the overview. The placeholder resets on navigation, including from a child page. Without JavaScript, all options appear as links. Only one child level is supported, and child URLs use the same validation as normal navigation.

Use `category: edgepress` or `categories: [blog, uncategorized]` on a `post-list` block. `latest-posts` without an explicit filter inherits `site.archive.categories`. Homepage pagination must use that same category set. To change only the number shown on a project page, edit its block's `count` (1–12); the full category archive remains paginated and available.

## Optional external services

The website has no comment backend or comment-specific browser code. Register external-api or external-widget under plugins.consent.services in config.yml. Each service declares its purpose, data, recipient, retention and privacy URL, and waits for explicit visitor consent. Address changes require a new choice. Service API credentials belong only to the separately deployed service.

iask owns its complete interface, CSS, languages, identity and storage. Register its widget with backendUrl, moduleUrl and placement: posts; pages use a generic service block. See the [independent integration guide](https://github.com/jsw-teams/iask/blob/main/docs/edgepress.md).

## Publication times and article changes

Set `site.timeZone` in `config.yml`, default `Asia/Taipei`. The CLI writes complete publication timestamps with that zone’s offset and names the folder using its calendar date. Timestamps without an offset are interpreted in that configured zone; an explicit offset is respected. No build-host timezone is used. Readers see complete times in their current zone. Date-only articles retain their calendar date in displayed text, HTML, search and structured data, without a fabricated midnight. Ambiguous or nonexistent daylight-saving times need an explicit offset.

An article shows the latest content update time from Git history. Only title and Markdown body changes count; metadata edits do not. Add `showChanges: true` to its front matter to display the actual latest content diff in an expandable panel. This is disabled by default and requires no hand-written revision note. Build from a full Git checkout (`fetch-depth: 0` in GitHub Actions); unavailable history produces no invented update. The latest 20 file commits are inspected.

Set `pinned: true` in the selected article translations to place them first in `post-list`. Category and locale selection happen before pinning and limiting. Feeds, archives and `latest-posts` remain chronological.

Multiple post lists on the same page share a displayed-article set: an article already shown in a pinned list is omitted from the following recent list, which fills its remaining slots with other articles. Each new page starts a fresh set.


## Static platform deployment

Run npm run deploy:cloudflare, npm run deploy:vercel, npm run deploy:netlify, npm run deploy:edgeone -- -n my-site, or npm run deploy:esa -- --name my-site. Platform authentication is required. GitHub Actions also provides a manual Deploy static website workflow using repository Secrets.


All platforms build dist/. CSS and JS are fingerprinted, with one-year immutable cache policies for Cloudflare, Vercel, Netlify and EdgeOne. ESA uses the same assets; set its browser and edge cache rules for hashed CSS/JS while leaving HTML short-lived. See the [deployment guide](content/pages/deployment/en.md) and [ESA build configuration](https://help.aliyun.com/en/edge-security-acceleration/esa/user-guide/build-pages).

Optional API requests use one fixed endpoint: backendUrl itself when it has a path, otherwise /api on its origin. callService(id, action, options) puts the operation in X-Service-Action; context belongs in request headers and payloads in the body. The independent API must implement this contract and allow the required CORS request headers. Third-party vendor integrations retain their vendor-defined protocols.


Page blocks support `type: oembed` with an `integration` service ID and share `url`. Register `provider: oembed` under the flat consent services list. Media loads only after current consent and a click. ishare uses fixed `/api` metadata requests; public third-party oEmbed metadata is cached at build time. Fourteen common media services are enabled in `config.yml`, each with its own visitor choice and `enabled` switch. Add a custom `oembedEndpoint`, source/media origins and optional vendor scripts. Navigation and footer links support `_self` and `_blank` targets. See the [plugin guide](content/pages/plugin-development/en.md) and [ishare](https://github.com/jsw-teams/ishare).
