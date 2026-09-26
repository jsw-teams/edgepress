# Repository development instructions

EdgePress builds static websites from Markdown and YAML source. Follow these rules when changing the project.

## Source files

- Put published project guides and site copy in `content/**/*.md`.
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
- Keep CSS, scripts, and images in that theme's `assets/` directory. The builder fingerprints CSS and JavaScript files.
- Escape normal layout placeholders. Only generated page content, JSON-LD, and generated navigation may use the renderer's approved raw placeholders.
- Keep semantic landmarks, a skip link, one main landmark, labeled navigation, visible keyboard focus, and one page-level `h1`.
- Use a full-height vertical body layout and a growing main area so the footer reaches the bottom on short pages. Footer copy is configured with `site.footer` and has no hard-coded EdgePress attribution.

## Languages and privacy

- Store built-in UI text in `languages/base/<locale>.json`; each optional locale has its own `languages/packs/<locale>.json` file and is enabled in `edgepress.config.mjs`.
- Missing language-pack IDs fall back to the base dictionary. Do not inline translations in config.
- Build modules under `plugins/` run in Node during the build and are trusted code. Browser plugin settings live in root `config.yml` under `plugins.consent`, with `tracking`, `statistics`, `advertising`, and `captcha` nested inside it. Browser integrations must remain behind the explicit consent manager before any vendor request.
- Never place CAPTCHA secret keys in generated client configuration. CAPTCHA responses must be verified by a trusted backend.

## Commands

- `npm ci`: install locked dependencies.
- `npm link`: expose the CLI when developing from this source checkout.
- `edgepress build`: generate the website in `dist/`.
- `edgepress server`: build, run Wrangler locally, watch sources, and refresh the audit report.
- `edgepress check`: build, generate accessibility and agent-friendliness reports, capture screenshots, and write the PDF under `tools/`.
- `edgepress doctor`: run Worker compatibility checks.

Read the guides in `content/pages/` before extending themes, page blocks, or plugins.

## 命令被策略拦截时

- 带 `-Force` 的检查命令（如 `Get-ChildItem -Force`）应与删除、修改、服务启停等操作分成独立工具调用；仅换行或用分号分隔无效。
- 遇到 `blocked by policy`，先检查完整脚本是否混用了上述命令和参数，不要直接归因于权限不足。
- 每步执行后核验实际结果；仍被拦截时如实记录命令和错误。
