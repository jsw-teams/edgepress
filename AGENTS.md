# Repository development instructions

## Open collaboration

- Welcome curiosity, Vibe Coding and AI-assisted contributions without tool restrictions. Review understandable changes and actual verification, not how code was produced. Follow CONTRIBUTING.md and report vulnerabilities privately via SECURITY.md.
- Keep PRs focused, add relevant regression coverage, preserve public/legacy contracts and third-party attribution, and report unrun checks honestly. Never deploy or change production data/routes/storage as contribution verification. Untrusted PR CI must not receive deployment secrets.


## Cloud synchronization and document previews

- External-link prompts are optional local UI, based on site.url and exact trusted origins. Keep original anchor semantics, native modified/context-menu gestures, keyboard/focus restoration, language dictionaries and theme tokens. Trust never bypasses CSP/consent; do not add redirect endpoints or fetch destinations before confirmation.
- Group immutable cache rules only when every matching published asset is hashed. Never cache unversioned metadata immutably; validate the 100-rule static-host budget during build.

- Pages document elements use continuous separated pages; Pages media-viewer elements reuse the shared gallery and lazily imported player. Never copy either engine, preload nonselected attachments or enable scripts in document frames.
- Render each document title once in the reusable viewer, not again in its surrounding block. Preserve read-only controls and complete windowed worksheet access; never reintroduce arbitrary row/column truncation.

- Native WebMCP is progressive enhancement: detect document.modelContext, register only real page capabilities, silently skip unsupported browsers and remove tools on pagehide. Keep tools top-level, same-origin navigation bounded to existing links, document controls behind their current consent gates, no downloads or iframe injection. Do not fake browser APIs, enable sandbox scripts, or modify Cloudflare security settings to silence logs.

- Before editing or pushing, fetch origin and inspect incoming commits. Preserve local-only changes in a backup outside the checkout before resolving conflicts. Fast-forward clean checkouts; never force-push or overwrite another contributor's work.
- Keep document preview code in the canonical document-viewer repository. Pin a published full GitHub commit and synchronize package-lock.json; do not copy the engine or rely on sibling checkouts or conversion software.
- Document previews open automatically without moving focus. External document URLs still require current per-service consent and CORS before requests. Do not expose original-download links or legacy PPT warning notes in the UI. Preserve script-disabled isolation, local workers, immutable dependency hashes and technical renderer boundaries in source documentation.
- Run document regression tests and a build before pushing. Browser document tests use isolated Playwright Chromium with extensions disabled, never the user's system Edge or Chrome.
- tools/recordings/capture-document-demo.mjs records actual DOC/DOCX, PDF, PPT/PPTX and XLS/XLSX renderers in the isolated WSL2 desktop. It reads the published examples from web/js.gripe/content/assets/documents/doc-views (DOCUMENT_DEMO_ROOT may select another source directory), preserving operator-supplied Office files and attribution. Never overwrite them with synthetic Office fixtures, use production documents or capture host desktop input. Inspect visible PDF ink and Word geometry before publishing recordings. Controls adapt to arbitrary host palettes, not just the default theme.

EdgePress builds static websites from Markdown and YAML source. Follow these rules when changing the project.

## Source files

- Put published project guides and site copy in `content/**/*.md`.
- Put page media and other content-owned files under `content/assets/`; the builder publishes them at matching site-root paths.
- Keep root Markdown limited to `README.md`, `AGENTS.md`, `CONTRIBUTING.md` and `SECURITY.md`; retain the project `LICENSE` and third-party notices.
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

- Data-saving variants are optional theme-owned assets declared in theme.json. Optional layoutStyles compiles shared published layout CSS with fonts and URL declarations removed; use the small variant for real text-only component layouts, not global grid/nav/footer resets. Framework detection offers text view only after a slow first screen; browser explicit saveData is a separate operator switch. No permanent three-way selector, probes or automatic reloads; explicit visitor choices override hints. Verify actual requests, screenshots, per-page navigation/footer boundaries, Firefox speculative loading and consent. Never reveal noscript raw markup in a JavaScript-enabled page.
- Keep loading-screen choices stable after late resource completion; do not reveal a competing full page under focused controls. Full-only stylesheet preloads must never leak into text view. Current consent and explicit per-service demand are separate: text-view widget requests can resume after consent, but accepting all never downloads every widget. The config.yml debug switch controls the empty data-save query entry; disabled entries use the localized static 404 page, not a false claim of server-side HTTP rejection. Preserve legitimate OAuth/search parameters and validated visitor-choice fallback URLs.

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
