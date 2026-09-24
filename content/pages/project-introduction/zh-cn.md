---
title: 项目介绍
lang: zh-CN
slug: project-introduction
description: EdgePress 的架构、发布政策、功能成熟度和支持的运行环境基线。
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: 项目概览
          title: 页面可编辑、文章用 Markdown 的静态网站构建器。
          text: EdgePress 将内容、展示、可信构建插件和 Worker 请求处理分开放置，让每个部分都有清晰的修改位置。
  - columns: 1
    cells:
      -
        - type: feature-grid
          title: 项目边界
          items:
            - title: Pages 页面
              text: 每个本地化页面都在 Markdown 前置数据中保存有序行布局、栏数、元素类型和元素内容。
            - title: Posts 文章
              text: 每篇文章都是 Markdown 文档，并由内置安全渲染流程输出。
            - title: Themes 主题
              text: HTML 布局、共享局部模板和主题内硬编码的 CSS 配色负责网站展示。
  - columns: 1
    cells:
      -
        - type: section
          title: 支持基线
          tone: soft
          blocks:
            - type: data-table
              title: 本版本的运行环境与功能状态
              headers:
                - 范围
                - 基线
                - 状态
              rows:
                - - 构建命令行
                  - Node.js 22.12 或更新版本
                  - 稳定
                - - Worker 运行环境
                  - 使用 Request、Response 和 Web API 的 Module Worker
                  - 稳定
                - - 静态发布
                  - 通过 Wrangler 发布 Workers Static Assets
                  - 稳定
                - - Worker 中的 Node.js API
                  - src/worker.js 不需要 Node.js API
                  - 稳定
                - - 插件 API
                  - 主版本 1
                  - 实验性
                - - 页面元素构建器
                  - 有序行、1 至 4 栏、经过验证的元素
                  - 实验性
                - - 后端转发
                  - 可选 Service Binding 或 URL 加 Worker 密钥
                  - 实验性
            - type: text
              text: 兼容性清单位于 project-compatibility.json。Worker 兼容日期固定在 wrangler.jsonc 中。静态页面服务不需要 nodejs_compat。
  - columns: 1
    cells:
      -
        - type: section
          title: 发布与功能生命周期
          blocks:
            - type: data-table
              title: 功能阶段
              headers:
                - 阶段
                - 含义
              rows:
                - - 实验性
                  - 可以使用，但配置或行为可能在次版本发布时调整。
                - - 稳定
                  - 遵循语义化版本；破坏性变更需要主版本更新。
                - - 弃用
                  - 通常至少保留两个次版本后再于主版本移除，紧急安全问题除外。
                - - 移除
                  - 不再随项目发布；兼容性清单记录移除版本。
            - type: text
              paragraphs:
                - 月度版本使用“年.月.请求序号”格式。本次版本为 2026.9.1，即 2026 年 9 月针对本次需求的第一次更新。
                - 月度审核就绪后发布次版本；缺陷、安全修复和依赖更新使用修订版本。新主版本发布后，前一主版本继续获得 12 个月的安全修复支持。
                - 发布前应同步更新 project-compatibility.json 和此功能清单。运行 edgepress doctor 可检查本机 Node.js 版本、Worker 入口和兼容日期。
---
