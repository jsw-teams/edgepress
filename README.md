# EdgePress

[中文说明](#中文说明)

EdgePress builds static websites from Markdown posts, JSON pages, and HTML themes. You keep your files in Git and publish the generated `dist/` folder to Cloudflare Workers, Vercel, Netlify, Tencent EdgeOne Pages, Alibaba Cloud ESA Pages, or your own VPS.

- **Zero runtime dependencies**: EdgePress runs directly on Node.js 22.12+. It includes built-in YAML, Markdown, HTML sanitization, CSS/JS minification, image-dimension inspection, diffing, and a local preview server. Cloud platforms skip heavy `npm install` steps.
- **Fast static output**: The builder subsets local Noto fonts to the characters your site uses, minifies and fingerprints CSS and JS, preloads critical assets, and loads optional scripts only on pages that need them.
- **Simple commands**: Use `edgepress new "Title"` to start a post, `edgepress s` to preview and edit pages locally, `edgepress g` to build `dist/`, and `edgepress d` to publish over SSH/SFTP.
- **Four built-in themes**: `default`, `atelier`, `signal`, and `folio`, each supporting light/dark modes and optional text-only data-saving mode.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jsw-teams/edgepress)
[![Deploy to EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fjsw-teams%2Fedgepress&build-command=npm%20run%20build&install-command=npm%20install%20--omit%3Ddev&output-directory=dist)
[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjsw-teams%2Fedgepress)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jsw-teams/edgepress)
[![Import into ESA Pages](content/assets/edgepress/brand/deploy-esa.svg)](https://esa.console.aliyun.com/edge/pages/creation)

## Quick start

Install Node.js 22.12 or newer. Create a new site and open the local preview:

```sh
mkdir my-edgepress-site
cd my-edgepress-site
npm install edgepress
npx edgepress init
npx edgepress s
```

Open `http://127.0.0.1:8787/` to view your site. Click **Edit Pages** to arrange rows, columns, and blocks at `http://127.0.0.1:8787/__edgepress/`.

Before you publish, update `site.url` and `privacy.controller` in `config.yml`.

## Everyday commands

| Command | Shortcut | What it does |
| --- | --- | --- |
| `edgepress status` | — | Show site title, theme, locales, and document counts. |
| `edgepress new "Title"` | `edgepress new post "Title"` | Create a Markdown post in `content/posts/`. |
| `edgepress new page "Title"` | `edgepress new pages "Title"` | Create a JSON page in `content/pages/`. |
| `edgepress server` | `edgepress s` | Start the built-in preview server and visual Pages editor. |
| `edgepress generate` | `edgepress g` / `edgepress build` | Generate the static site in `dist/`. |
| `edgepress theme list` | — | List installed themes. |
| `edgepress theme use <name>` | — | Switch the active theme. |
| `edgepress theme create <name>` | — | Create a blank theme scaffold in `themes/<name>/`. |
| `edgepress deploy [platform]` | — | Build and deploy to `cloudflare`, `vercel`, `netlify`, `edgeone`, or `esa`. |
| `edgepress d [--target name]` | `edgepress deploy vps` | Build and upload `dist/` to one or more VPS nodes via SFTP. |
| `edgepress doctor` | — | Check Node.js version and static publishing settings. |
| `edgepress check` | — | Run structural, Markdown, and headless browser audits (`tools/reports/page-check.pdf`). |
| `edgepress clean` | — | Remove `dist/` and temporary report files. |

## Writing posts and editing pages

- **Posts (`content/posts/<slug>/<locale>.md`)**: Write standard Markdown below the YAML front matter (`title`, `date`, `category`, `tags`, `pinned`). Put local images in `content/assets/images/` and link them as `/images/photo.webp`.
- **Pages (`content/pages/<slug>/<locale>.json`)**: Compose pages from ordered rows (`columns: 1..4`) and `cells`. Each file references `schemas/pages.schema.json` for editor validation, and you can also edit pages visually from `edgepress s`.
- **Automatic article updates**: When you edit a post in Git, EdgePress generates a **Previously / Now** comparison card for the latest content change. Set `showChanges: false` in front matter if you want to hide it.
- **Built-in viewers**: Article images open in a lightweight `<dialog>` lightbox. Local videos (`!video[Caption](/media/clip.mp4)`) and documents (`!document[Report](/docs/report.pdf)`) use built-in zero-dependency players without pulling large external bundles.

## Themes, performance, and data-saving mode

Built-in themes live in `themes/default/`, `themes/atelier/`, `themes/signal/`, and `themes/folio/`.

- **Automatic font subsetting**: EdgePress scans the characters in your built HTML and keeps only the Noto `.woff2` subsets your site actually uses.
- **Conditional scripts**: Copy buttons, image viewers, and language selectors load only on pages that need them.
- **Data-saving mode**: Enable `site.dataSaver.enabled: true` in `config.yml` so visitors on slow links can switch to a lightweight text view that keeps your theme layout while deferring fonts and media.

## Deploying

Every static platform runs `npm run build` and serves `dist/`. Because EdgePress has zero runtime dependencies, cloud installs finish in seconds.

- **Cloudflare Workers**: Connect your GitHub repository with build command `npm run build` and deploy command `npx wrangler deploy`, or run `npm run deploy:cloudflare` locally.
- **Vercel / Netlify / EdgeOne / ESA**: Use the deploy buttons above or run `npm run deploy:<platform>`.
- **VPS over SSH/SFTP**: Add `deploy.vps` (or `deploy.vpsTargets` for concurrent multi-node uploads) in a private, uncommitted `config.yml`. Install the optional `ssh2` package if you upload directly via SFTP, then run `edgepress d --dry-run` to check the output before running `edgepress d`. See [agent.md](agent.md) for deployment details.

## Privacy and external services

EdgePress ships with no tracking scripts. If you add analytics, comment widgets, or oEmbed providers (`youtube`, `x-posts`, `ishare`) under `plugins.consent.services` in `config.yml`, the browser loads them only after the visitor consents.

## Contributing and license

Bug reports, small pull requests, and AI-assisted edits are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before opening a PR. See [SECURITY.md](SECURITY.md) for security reporting and [LICENSE](LICENSE) for license terms.

---

## 中文说明

EdgePress（写文建站）把 Markdown 文章、JSON 页面和 HTML 主题直接生成静态网站。你把源文件放进 Git，再把生成的 `dist/` 目录发布到 Cloudflare Workers、Vercel、Netlify、腾讯 EdgeOne Pages、阿里云 ESA Pages 或自己的 VPS。

### 核心特点

- **零运行时依赖**：只需要 Node.js 22.12+。YAML 解析、Markdown 渲染、HTML 清理、CSS/JS 压缩、图片尺寸读取、版本对比和本地预览服务器全部内置，云平台构建不需要下载臃肿依赖。
- **加载更轻更快**：构建时自动按站点实际用到的字符裁剪本地 Noto 字体子集，压缩并指纹化 CSS/JS，按页面需要注入脚本，减少首屏阻塞。
- **命令更简单**：`edgepress new "标题"` 新建文章，`edgepress s` 启动本地预览和可视化页面编辑器，`edgepress g` 生成 `dist/`，`edgepress d` 发布到 VPS。
- **四套重写主题**：内置 `default`、`atelier`、`signal`、`folio` 四套精简主题，均支持浅色/深色模式和省流文本视图。

### 快速开始

```sh
mkdir my-edgepress-site
cd my-edgepress-site
npm install edgepress
npx edgepress init
npx edgepress s
```

在浏览器打开 `http://127.0.0.1:8787/` 就能看到站点；点击 **编辑 Pages** 可以直接在本地拖拽调整页面布局。发布前请在 `config.yml` 里填好你自己的站点网址和联系人信息。

更多中文文档见 [中文使用说明](content/guides/zh-cn.md) 和 [免费部署平台对比](content/guides/platforms.md)。
