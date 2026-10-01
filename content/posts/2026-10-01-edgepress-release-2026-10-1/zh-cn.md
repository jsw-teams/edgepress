---
title: EdgePress 2026 年 10 月更新
author: toewpq
date: 2026-10-01
lang: zh-cn
slug: edgepress-release-2026-10-1
tags:
  - 发布
  - 资源
  - 安全
description: 发布 content/assets 中的页面资源，更新 Wrangler，并加入自动依赖检查和版本安全扫描。
---

本次更新开启 EdgePress 2026 年 10 月更新系列。

## 从 content/assets 发布页面资源

现在，`content/assets/` 中的文件会按相同路径发布到站点根目录。例如，`content/assets/images/diagram.svg` 会生成 `/images/diagram.svg`。共享主题 CSS 和 JavaScript 仍放在各主题的 `assets/` 目录中。

## 更新构建依赖

Wrangler 更新至 4.144.0，并同步更新 Cloudflare 运行时依赖。Dependabot 现在每周检查 npm 包和 GitHub Actions；定时工作流会运行 `npm audit` 和项目构建。

## 扫描版本构建

手动启动或推送已启用的版本标签时，Codex Security 工作流可以扫描版本构建，并将完成的发现上传到 GitHub Code Scanning。标签扫描需要仓库变量 `CODEX_SECURITY_ENABLED`，所有扫描都需要 Actions 密钥 `OPENAI_API_KEY`。
