---
title: EdgePress 2026 年 9 月更新：第 4 次需求
author: toewpq
date: 2026-09-25
lang: zh-CN
slug: edgepress-release-2026-9-4
tags:
  - 发布
  - 报告
  - Cloudflare

---

这是 EdgePress 在 2026 年 9 月针对第 4 次需求的更新。

## 审核报告只保留 PDF

`edgepress check` 和 `edgepress server` 现在只在 `tools/page-check.pdf` 保存报告。桌面和移动端截图会嵌入 PDF，临时 HTML 和截图文件会在生成后清理。

## 移除 templates 目录

`edgepress init` 现在由 CLI 包直接写入新项目的 README 和 `.gitignore`。源码与 npm 包不再包含 `templates/` 目录。

## Cloudflare Workers Builds 设置

快速入门指南现已记录本仓库设置：根目录 `/`、构建命令 `npm run build`、部署命令 `npx wrangler deploy`，且无需配置构建变量。指南也说明，构建若停留在 `Initializing build environment`，表示项目构建命令还未运行；应重新连接 GitHub 集成，或替换失效的 Cloudflare 构建 API Token 后再试。

Wrangler 要求此 Worker 设置 `compatibility_date`，因此项目将其固定为本月第一天：`2026-09-01`。
