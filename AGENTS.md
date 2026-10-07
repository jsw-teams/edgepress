# Repository development instructions

EdgePress builds static websites from Markdown and YAML source. Follow these rules when changing the project.

## Source files

- Put published project guides and site copy in `content/**/*.md`.
- Put page media and other content-owned files under `content/assets/`; the builder publishes them at matching site-root paths.
- Keep root Markdown limited to `README.md` and this `AGENTS.md`.
- Edit site-wide title, description, URL, agent SEO (GEO), SEO, and privacy settings in root `config.yml`.
- Keep build paths, permalink settings, locale packs, and trusted build-time plugin paths in `edgepress.config.mjs`.
- `dist/` is generated output. Never hand-edit files under `dist/`, including HTML, XML, JSON, or text output.
- Generate the audit PDF only through `edgepress check`; keep it and its screenshots under `tools/`.

## Pages and posts

- Store each post and page in its own directory. Language versions use lowercase locale filenames (`en.md`, `zh-cn.md`) and front matter `lang` must match the filename.
- Posts under `content/posts/<post-id>/` use the Markdown renderer.
- Pages under `content/pages/<page-id>/` are Markdown documents whose ordered `blocks` in YAML front matter contain all page content. The body after front matter stays empty. Each row defines its column count before its cells; element types and editable content live inside each cell. Homepages use `homepage: true` and are generated at the localized site root.
- Keep block rendering validated and escaped. Page text, media captions, and URLs must be escaped or validated. Only posts use the Markdown renderer.
- Generated feeds, search indexes, sitemaps, robots rules, and optional `llms.txt` belong in source generators, never as hand-edited output files.

## Themes

- Themes use HTML layouts at `themes/<name>/layouts/layout.html` and `.html` partials under `layouts/partials/`; they do not use TSX renderers.
- Keep shared theme CSS and scripts in that theme's `assets/` directory. The builder fingerprints CSS and JavaScript files.
- Escape normal layout placeholders. Only generated page content, JSON-LD, and generated navigation may use the renderer's approved raw placeholders.
- Keep semantic landmarks, a skip link, one main landmark, labeled navigation, visible keyboard focus, and one page-level `h1`.
- Use a full-height vertical body layout and a growing main area so the footer reaches the bottom on short pages. Footer copy is configured with `site.footer` and has no hard-coded EdgePress attribution.

## Languages and privacy

- Store built-in UI text in `languages/base/<locale>.json`; each optional locale has its own `languages/packs/<locale>.json` file and is enabled in `edgepress.config.mjs`.
- Missing language-pack IDs fall back to the base dictionary. Do not inline translations in config.
- Build modules under `plugins/` run in Node during the build and are trusted code. Browser plugin settings live in root `config.yml` under `plugins.consent`, with individual entries in `services`. Browser integrations must remain behind the explicit consent manager before any vendor request.
- Never place CAPTCHA secret keys in generated client configuration. CAPTCHA responses must be verified by a trusted backend.

## Commands

- `npm ci`: install locked dependencies.
- `npm link`: expose the CLI when developing from this source checkout.
- `edgepress build`: generate the website in `dist/`.
- `edgepress server`: build, preview static assets with Wrangler locally, watch sources, and refresh the audit report.
- `edgepress check`: build, generate accessibility and agent-friendliness reports, capture screenshots, and write the PDF under `tools/`.
- `edgepress doctor`: run Worker compatibility checks.

Read the guides in `content/pages/` before extending themes, page blocks, or plugins.

## 命令被策略拦截时

- 带 `-Force` 的检查命令（如 `Get-ChildItem -Force`）应与删除、修改、服务启停等操作分成独立工具调用；仅换行或用分号分隔无效。
- 遇到 `blocked by policy`，先检查完整脚本是否混用了上述命令和参数，不要直接归因于权限不足。
- 每步执行后核验实际结果；仍被拦截时如实记录命令和错误。

## Static architecture

- The website output is static HTML and local JavaScript. Do not introduce website API handlers, service bindings, comment storage or operator Secrets.
- Register optional external APIs and widgets in config.yml under plugins.consent.services. Every external request waits for explicit service consent and visitor demand.
- iask owns the complete comment UI, languages, styles, media and backend. Use only generic service slots here.
- Cloudflare, Vercel, Netlify, EdgeOne Pages and ESA Pages serve dist/. Preserve hashed CSS/JS URLs and the configured immutable cache policy. HTML and unversioned metadata must remain refreshable.

- Optional service configuration is flat: plugins.consent.services. Do not restore preset consent categories, category tags, group toggles or unused category translations. Show each configured service name and localized purpose directly; retain explicit per-service consent and disclosure validation.

- Optional APIs use fixed endpoints and X-Service-Action headers. Do not encode operation names, discussion identifiers or submitted content in API URL paths or queries. Third-party providers follow their native protocols.

- The Chinese official project name is 写文建站; the English official name remains EdgePress. Use one localized name in page titles and public copy. Homepage pages do not contain discussion slots.

- Generic media-platform consent presets are limited to X and YouTube. Operator share.js.gripe enables none. Preserve custom oEmbed support without enabling other platforms as defaults. Dependency-based sites must receive package browser runtime and built-in navigation icons without copying framework source.

- Article, image-block and media-text pictures use the shared media-viewer lightbox. Do not distinguish pictures by provider or attach the viewer to navigation icons or branding. Default to the displayed resource; explicit originalSrc/data-original or an image-file link supplies the original only on click. Preserve consent-gated embeds, meaningful navigation links, CSP, focus restoration and close behavior. Bundle the image-only component locally with immutable hashes; do not copy its implementation or ship video dependencies into the image runtime.

- Reserve published local image dimensions during build; never fetch remote images to determine size. Keep the media viewport stable before player initialization and while switching attachments. Date/time placeholders must reserve the complete localized timestamp.
- Media controls use the locally bundled Lucide SVGs. Keep at least 44 px controls and keyboard focus inside the open image dialog; close restores focus to its trigger. Remove unused controls and translation keys.

- Product recordings use manual playback and an accessible seek bar, retaining the chosen playhead without autoplay. Record the real standalone CLI and editor, then edgepress server and homepage-to-article navigation. Reusable recording tools belong in tools; temporary frames/manifests belong in ignored tools/.recordings rather than .edgepress. Do not record deployment as a substitute for local preview.

- Keep regression tests and media fixtures under tests/. Group asset maintenance, recording and browser verification scripts under tools/assets/, tools/recordings/ and tools/verification/. Only current generated evidence belongs under tools/reports/; edgepress check generates tools/reports/page-check.pdf. Archive replaced evidence outside the checkout.
- Product captures use a private VM desktop with real terminal, editor and browser. Do not automate or capture host input. Unset inherited Wayland/WSLg display variables and force guest X11 display :99. Use mature FFmpeg/Playwright/xdotool tools; no manual frame capture loop or web terminal simulation.
- Embed content uses standalone !embed[service](URL) lines in article Markdown and Pages text blocks, with the same validation and consent renderer. Do not restore article front-matter embeds.
