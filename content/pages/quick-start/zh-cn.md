---
title: 快速入门
lang: zh-CN
slug: quick-start
description: 安装 EdgePress、创建 Markdown 文章、编辑页面元素、本地构建并打开实时预览。
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: 从这里开始
          title: 配置项目并打开实时预览。
          text: 安装项目依赖后使用 edgepress 命令。本地预览会在源文件变更后自动构建，并刷新无障碍化和 agent 友好度报告。
  - columns: 1
    cells:
      -
        - type: section
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
                edgepress build
                edgepress server
  - columns: 2
    cells:
      -
        - type: section
          title: 创建内容
          blocks:
            - type: steps
              items:
                - title: 创建文章
                  text: 文章使用 Markdown，保存在 content/posts/<post-id>/en.md 或 zh-cn.md 等本地化文件中。
                  command: edgepress new "A project update"
                - title: 创建页面目录
                  text: 新建 content/pages/<page-id>/en.md。每种已配置语言都有一个小写语言文件名。
                - title: 设置语言
                  text: front matter 的 lang 值需与文件名匹配；在 edgepress.config.mjs 中启用可选语言。
      -
        - type: section
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
      -
        - type: section
          title: 配置与预览
          blocks:
            - type: text
              paragraphs:
                - 在 config.yml 中编辑站点标题、简介、规范 URL、agent SEO、导航、页脚文字和隐私运营者信息。主题配色保存在各自主题的 CSS 中。
                - 使用 edgepress theme list 查看主题，使用 edgepress theme use <主题名称> 切换主题。主题路径保存在 edgepress.config.mjs 中。
                - 使用 edgepress theme install <npm-package> 安装主题包，或使用 edgepress theme create <名称> 创建空白主题。
                - edgepress server 会启动本地 Wrangler 服务、监视源文件、重新构建变更页面、刷新浏览器，并更新 tools/page-check.md 和 tools/page-check.json。
            - type: code
              title: 构建、检查和部署
              language: sh
              code: |
                edgepress check
                edgepress doctor
                edgepress deploy
            - type: text
              text: 兼容性检查会读取 project-compatibility.json 和 wrangler.jsonc 中的 Node.js 基线、Worker 入口和兼容日期。部署前请查看生成的报告。
            - type: section
              title: 将源代码上传到 GitHub
              blocks:
                - type: text
                  paragraphs:
                    - 在 GitHub 创建空仓库并推送 EdgePress 源代码。然后在 Cloudflare 控制台创建 Worker，并通过 Workers Builds 连接该仓库，选择 main 作为生产分支。部署前请在 wrangler.jsonc 中设置唯一的 Worker 名称。
                    - Workers Builds 会读取 package.json 中的 build 和 deploy 脚本，先运行 npm run build 生成 dist/，再运行 npm run deploy 发布 Worker。dist/ 不会提交到 Git；Cloudflare 会管理此连接的构建授权。
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
                    - label: 将 GitHub 连接到 Cloudflare Workers Builds
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
                    - label: 配置 Workers Builds 命令
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
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
                  text: 静态托管不会运行 src/worker.js。内置 /api/ 代理和 Cloudflare Service Binding 需要部署 EdgePress Worker；否则需在当前服务器配置等效的服务端路由。不要把后端 Token 写入浏览器设置。
                  tone: warning
---
