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
---
