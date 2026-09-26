---
title: EdgePress 2026 年 9 月更新：第 7 次需求
author: toewpq
date: 2026-09-26
lang: zh-CN
slug: edgepress-release-2026-9-7
tags:
  - 发布
  - 性能
  - 隐私

---

这是 EdgePress 在 2026 年 9 月针对第 7 次需求的更新。

## 同意管理和隐私披露

Cloudflare Web Analytics 已作为统计服务接入，并继续等待访客明确同意后才会加载。`config.yml` 中的浏览器服务组现在统一放在 `plugins.consent` 下。每次构建时，隐私政策都会列出已启用服务的供应商、类别、用途和保留期限。

## 图片和文章列表

首页现在使用较小的自适应吉祥物图片。文章归档会跨语言按发布时间从新到旧排列；首页最新文章列表仍按当前语言显示。文章摘要在显示前会去除 Markdown 标记。

## 移动端控件和维护

同意面板改进了移动端布局和服务说明，并扩大了按钮触控区域。未使用的 integrations 空目录和已废弃审计文件清理路径也已移除。
