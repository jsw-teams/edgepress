---
title: EdgePress 2026 年 9 月更新：第 3 次需求
author: toewpq
date: 2026-09-25
lang: zh-CN
slug: edgepress-release-2026-9-3
tags:
  - 发布
  - npm
  - 主题

---

这是 EdgePress 在 2026 年 9 月针对第 3 次需求的更新。

## 从 npm 安装 EdgePress

EdgePress 已发布为 `edgepress` 包。安装包后，在空目录中初始化项目，再安装生成的网站依赖并启动本地预览：

```sh
npm install edgepress
edgepress init
npm install
edgepress server
```

初始化器会保留现有 `package.json` 中的项目名称和脚本，并补入 EdgePress 命令与运行依赖。

## 安装或创建主题

使用 `edgepress theme install <npm-package>[@version]` 安装 npm 主题包。EdgePress 会将主题复制到 `themes/`，且不会运行包的安装脚本。使用 `edgepress theme list` 查看已安装主题，再用 `edgepress theme use <name>` 切换。

运行 `edgepress theme create my-theme` 可生成可发布到 npm 的空白自定义主题包，包含共享 HTML 外壳、可编辑的 head、header、导航和 footer 局部模板、必要的无障碍结构，以及用于自定义配色和响应式设计的空白样式表。

## 从 GitHub 部署或上传静态文件

快速入门指南现已说明如何将源代码推送到 GitHub 并连接 Cloudflare Workers Builds。Cloudflare 会使用项目的 build 与 deploy 脚本，在推送到生产分支时生成静态文件并发布 Worker。本地部署可运行 `edgepress deploy`。

GitHub 仓库 README 现已加入 Cloudflare 官方的一键 Worker 部署按钮。

`edgepress build` 与 `edgepress generate` 使用同一生成器。将 `dist/` 内的文件上传到 OpenResty 或 Nginx 网站根目录即可托管静态页面。Worker API 路由和 Service Binding 仍需部署 Worker，或在当前服务器配置等效服务端路由。
