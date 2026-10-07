---
title: 快速入门
lang: zh-CN
slug: quick-start
description: 安装 EdgePress、创建 Markdown 文章、编辑页面元素、本地构建并打开实时预览。
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: 从这里开始
          title: 配置项目并打开实时预览。
          text: 安装项目依赖后使用 edgepress 命令。本地预览会在源文件变更后自动构建，并刷新无障碍化和 agent 友好度 PDF 报告。
  - columns: 1
    cells:
      - - type: section
          title: 环境要求与初始命令
          tone: soft
          blocks:
            - type: data-table
              title: 支持基线
              headers:
                - 要求
                - 最低版本
              rows:
                - - Node.js
                  - "22.12"
                - - npm
                  - 当前受支持版本
                - - Cloudflare 账户
                  - 仅部署时需要
            - type: code
              title: 安装依赖并运行 EdgePress
              language: sh
              code: |
                npm ci
                npm run build
                npm run dev
  - columns: 1
    cells:
      - - type: section
          title: 只用 Markdown 写第一篇文章
          tone: soft
          blocks:
            - type: text
              text: 完成一次性配置后，日常写作只需 Markdown。EdgePress 会自动填写标题、日期和语言。打开命令输出的文件路径，在第二个 --- 后写正文。主题会处理文章标题、列表、目录、搜索和订阅。
            - type: steps
              items:
                - title: 新建文章
                  text: 命令会输出新文件的路径，不会覆盖已有文章。
                  command: npm run new -- post "我的第一篇文章"
                - title: 写 Markdown 正文
                  text: 替换示例段落。使用
                - title: 预览并发布
                  text: 写作时保持预览运行，保存文件即可刷新。发布前运行 npm run build，再使用已有部署流程。
                  command: npm run dev
            - type: code
              title: 简单的文章正文
              language: markdown
              code: |
                这是我的第一篇文章。使用 **Markdown** 排版。

                ## 学到的内容

                - 记录问题现象。
                - 说明解决方法。

                [项目源码](https://github.com/jsw-teams/edgepress)
            - type: text
              text: 站点配置在初次设置时完成。想调整页面设计时，再阅读下面的页面布局与主题说明；日常发文无需掌握这些开发内容。
  - columns: 2
    cells:
      - - type: section
          title: 创建内容
          blocks:
            - type: steps
              items:
                - title: 创建文章
                  text: 文章使用 Markdown，保存在 content/posts/<post-id>/en.md 或 zh-cn.md 等本地化文件中。
                  command: edgepress new post "A project update"
                - title: 创建页面目录
                  text: 新建 content/pages/<page-id>/en.md。每种已配置语言都有一个小写语言文件名。
                - title: 设置语言
                  text: front matter 的 lang 值需与文件名匹配；在 edgepress.config.mjs 中启用可选语言。
      - - type: section
          title: 编辑页面布局
          blocks:
            - type: text
              paragraphs:
                - 页面没有 Markdown 文章正文。请将布局写在每个本地化页面文件的 blocks 前置数据中。
                - 每行先选择 1 至 4 栏，并为每栏添加一个 cells 项。然后在栏内选择元素类型，再填写该元素的内容字段。
                - 可用元素包括 hero、section、text、heading、display-text、media-text、链接、列表、步骤、代码、表格、提示、最新文章，以及已配置的隐私或集成组件。
            - type: notice
              title: 视频无障碍要求
              text: media-text 视频元素需要 WebVTT 字幕文件、语言代码、字幕轨道名称和可访问的媒体描述。尽量使用本地托管的视频文件。
              tone: info
  - columns: 1
    cells:
      - - type: section
          title: 配置与预览
          blocks:
            - type: text
              paragraphs:
                - 在 config.yml 中编辑站点标题、简介、规范 URL、agent SEO、导航、页脚文字和隐私运营者信息。主题配色保存在各自主题的 CSS 中。
                - 使用 edgepress theme list 查看主题，使用 edgepress theme use <主题名称> 切换主题。主题路径保存在 edgepress.config.mjs 中。
                - 使用 edgepress theme install <npm-package> 安装主题包，或使用 edgepress theme create <名称> 创建空白主题。
                - edgepress server 会启动本地 Wrangler 服务、监视源文件、重新构建变更页面、刷新浏览器，并更新 tools/reports/page-check.pdf。截图会嵌入 PDF，生成后会清理临时文件。
            - type: code
              title: 构建、检查和部署
              language: sh
              code: |
                edgepress check
                edgepress doctor
                edgepress deploy
            - type: text
              text: 兼容性检查会读取 project-compatibility.json 和 wrangler.jsonc 中的 Node.js 基线、Worker 入口和兼容日期。部署前请查看 PDF 报告。
            - type: text
              paragraphs:
                - 第一篇文章尚未创建时，也可以运行 edgepress check。Markdown 检查使用内置的内存样例，无需发布教程文章或创建 posts 目录。Worker 兼容性检查读取 Wrangler 的实际 main 入口。
                - 安装 Edge、Chrome 或 Chromium 后，报告会包含无窗口的桌面、手机和平板深浅模式模拟、浏览器无障碍树检查，以及 Tab、Shift+Tab 和 Enter 键盘操作抽样。不会启动可见浏览器或桌面屏幕阅读器。模拟不能代替实体设备与辅助技术测试；浏览器检查不可用时会明确标注。
            - type: section
              title: 将源代码上传到 GitHub
              blocks:
                - type: text
                  paragraphs:
                    - 在 GitHub 创建空仓库并推送 EdgePress 源代码。然后在 Cloudflare 控制台创建 Worker，并通过 Workers Builds 连接该仓库，选择 main 作为生产分支。部署前请在 wrangler.jsonc 中设置唯一的 Worker 名称。
                    - 此仓库的 Workers Builds 设置为：根目录 /、构建命令 npm run build、部署命令 npx wrangler deploy。无需添加构建变量。构建命令会先生成 dist/，再由 Wrangler 发布 Worker；dist/ 不会提交到 Git。
                    - GitHub README 中的一键部署按钮会在你的 GitHub 账户创建一份新仓库副本，并在 Cloudflare 创建一个新 Worker。设置时请为目标仓库和 Worker 选择未占用的名称。如果 `edgepress` 已存在，请改用其他名称。要更新已有 Worker，请继续使用它已连接的仓库和 Workers Builds；按钮不会连接或更新已有项目。
                    - 如果日志在克隆仓库或运行命令前一直停留在 Initializing build environment，请检查 Cloudflare Workers and Pages GitHub App 是否仍有此仓库的访问权限。重新连接仓库，或重新安装并授权该 App 后再试。还需确认所选 Cloudflare API Token 仍有效；Workers Builds 可以自动创建 Token，如果已选 Token 失效，需要在 Build 设置中替换。此阶段尚未运行项目构建命令。
                - type: code
                  title: 推送源代码仓库
                  language: sh
                  code: |
                    git init
                    git add .
                    git commit -m "Initial EdgePress site"
                    git branch -M main
                    git remote add origin https://github.com/<owner>/<repository>.git
                    git push -u origin main
                - type: text
                  text: 本地部署时，先运行 npx wrangler login 完成 Cloudflare 身份验证，再运行 edgepress deploy。该命令会生成 dist/，并依据 wrangler.jsonc 部署 Worker。
                - type: link-list
                  title: 部署参考
                  items:
                    - label: 连接或重新授权 GitHub 集成
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
                    - label: 配置 Workers Builds 命令
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
                    - label: 排查 Workers Builds
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/
                    - label: 一键部署按钮的工作方式
                      url: https://developers.cloudflare.com/workers/platform/deploy-buttons/
            - type: section
              title: 为 OpenResty 或 Nginx 生成静态文件
              blocks:
                - type: text
                  paragraphs:
                    - edgepress build 和 edgepress generate 使用同一个生成流程，将静态网站写入 dist/。运行 edgepress generate 后，把 dist/ 目录内的文件上传到服务器网站根目录。如果不希望网址多出一层目录，不要把 dist/ 本身作为嵌套目录上传。
                    - OpenResty 使用 Nginx 配置语法托管静态文件。将 root 指向已上传的目录；try_files 会依次检查原始路径、目录首页和 .html 路由。生成的 403.html 与 404.html 可用于错误响应。
                - type: code
                  title: Nginx 或 OpenResty 基础站点配置
                  language: nginx
                  code: |
                    server {
                      listen 80;
                      server_name example.org;
                      root /var/www/edgepress;
                      index index.html;

                      location / {
                        try_files $uri $uri/ $uri.html =404;
                      }

                      error_page 403 /403.html;
                      error_page 404 /404.html;
                    }
                - type: code
                  title: 生成上传目录
                  language: sh
                  code: edgepress generate
                - type: notice
                  title: 仅 Worker 支持的集成
                  text: 各平台均托管静态产物。可选外部 API 和界面在 config.yml 的 plugins.consent.services 注册，独立后端管理凭据和安全验证。
                  tone: warning
  - columns: 1
    cells:
      - - type: text
          heading: 发表日期与时区
          text: 在 config.yml 设置 site.timeZone，默认 Asia/Taipei。新文章生成带明确时差的完整时间；没有写时差的具体时间按此配置解释，不依赖构建机器时区。仅有年月日的文章保留日历日期，不补午夜或随读者时区变更。完整时间按读者当前时区展示，遇到夏令时重复或不存在的时间需明确填写时差。
        - type: code
          title: config.yml
          language: yaml
          code: |
            site:
              timeZone: Asia/Taipei
---
