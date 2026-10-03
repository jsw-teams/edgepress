---
title: 写文建站 网站构建器
lang: zh-CN
slug: home
homepage: true
description: 使用 Markdown、可编辑页面与按需服务，将静态网站部署到五个平台。
keywords:
  - 网站构建器
  - Cloudflare Workers
  - 页面元素
  - 网站插件
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: 为边缘网络构建
          title: 用清晰、可编辑的源文件构建快速网站。
          text: 写文建站将 Markdown 文章、页面布局、主题与可选服务构建为静态网站，支持 Cloudflare、Vercel、Netlify、腾讯 EdgeOne Pages 和阿里云 ESA Pages。
          mascotSrc: /edgepress/brand/home-hero.png
          mascotAlt: 大熊猫与台湾黑熊友好并肩站立，黑熊胸前的浅色 V 形胸斑清晰可见。
          mascotWidth: 1536
          mascotHeight: 1024
          mascotSizes: "(max-width: 620px) calc(100vw - 64px), 320px"
          mascotWebpSrcset:
            - src: /edgepress/brand/home-hero-768.webp
              width: 768
            - src: /edgepress/brand/home-hero.webp
              width: 1536
          cta:
            label: 从快速入门开始
            url: /[launge]/quick-start/
          highlights:
            - 在本地化 Markdown 前置数据中编辑页面
            - 使用 Markdown 撰写文章
            - 复用布局，配色由主题定义
  - columns: 1
    cells:
      - - type: feature-grid
          title: 网站各部分各有清晰位置
          items:
            - title: 页面使用可编辑元素
              icon: layout-grid
              text: 先设置栏数，再选择元素类型，并在各页面文件中编辑对应内容。
              url: /[launge]/theme-development/
            - title: 文章使用 Markdown
              icon: file-text
              text: 使用 Markdown 撰写长文，由内置渲染器进行清理和排版。
              url: /[launge]/project-introduction/
            - title: 主题负责视觉设计
              icon: palette
              text: 使用 HTML 局部模板构建布局，并将各主题的配色保留在样式表中。
              url: /[launge]/theme-development/
            - title: 集成遵循用户同意
              icon: shield-check
              text: 配置跟踪、统计、广告或人机验证服务及其供应商信息。
              url: /[launge]/plugin-development/
  - columns: 2
    cells:
      - - type: section
          title: 了解项目
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - 从项目介绍和快速入门开始。指南涵盖功能生命周期、支持的运行环境和建议的发布流程。
            - type: link-list
              title: 项目指南
              items:
                - label: 项目介绍
                  url: /[launge]/project-introduction/
                - label: 快速入门
                  url: /[launge]/quick-start/
      - - type: section
          title: 扩展项目
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - 使用主题局部模板复用 head 元数据、导航、页脚和错误页布局。每个页面的行布局和元素内容保存在本地化页面文件中。
                - 构建插件在 Node 中运行。浏览器服务会等到访客明确同意后才请求供应商代码。
            - type: link-list
              title: 开发指南
              items:
                - label: 主题开发
                  url: /[launge]/theme-development/
                - label: 插件开发
                  url: /[launge]/plugin-development/
  - columns: 1
    cells:
      - - type: latest-posts
          title: 最新项目动态
          count: 3
          paginate: true
  - columns: 1
    cells:
      - - type: media-text
          mediaType: image
          src: /images/previews/edgepress-zh.webp
          alt: 写文建站本地网站界面实拍。
          caption: 本地构建的界面截图。
          placement: left
          title: 看见源文件生成的网站
          text: 文章、导航、搜索与语言路由一起发布。选择主题，日常写作只需要 Markdown。
  - columns: 1
    cells:
      - - type: data-table
          title: 免费部署优先级（2026-10-04）
          headers:
            - 优先级
            - 平台
            - 额度与条件
          rows:
            - - "1"
              - Cloudflare
              - 静态请求免费不限量；每月 3,000 分钟构建。
            - - "2"
              - 腾讯 EdgeOne Pages
              - 当前网站流量与请求不限量；每月 500 次构建。免费阶段额度可能调整。
            - - "3"
              - Vercel Hobby
              - 每月 100 GB 与 100 万次 CDN 请求；限个人非商业用途。
            - - "4"
              - Netlify Free
              - 每月 300 共享积分；部署 15，流量每 GB 20，请求每万次 2；用尽暂停。
            - - 待核实
              - 阿里云 ESA Pages
              - 流量使用站点套餐额度；每天 10 万次函数额度不是静态流量。
  - columns: 1
    cells:
      - - type: link-list
          title: 部署说明与额度来源
          items:
            - label: 中文说明
              url: https://github.com/jsw-teams/edgepress/blob/main/content/guides/zh-cn.md
            - label: 官方额度来源
              url: https://github.com/jsw-teams/edgepress/blob/main/content/guides/platforms.md
---
