---
title: EdgePress 十月第 3 次更新
lang: zh-CN
date: 2026-10-03T10:00:00+08:00
slug: edgepress-release-2026-10-3
category: edgepress
pinned: true
description: 可选 GitHub App 评论、置顶文章、读者本地时间与自动内容变动记录。
---
本次更新接入可选的 RepoRelay 评论。读者选择后才加载 GitHub 评论，App 凭据保留在 Worker。仓库安装信息自动识别，签名密钥自动生成并持久保存。

文章列表支持置顶。发表时间按读者当前时区显示；最近更新时间根据内容历史自动识别。文章可通过 `showChanges: true` 开启最近一次实际内容变动的展示，默认隐藏，无需填写修正说明。

隐私服务读取现有 YAML 配置，禁用的集成保留设置而不加载。界面图标改用附带授权文件的 Lucide SVG，所有内容图像源统一存放于 `content/assets`。

Worker 配置与文章历史所需的完整 Git 检出方式见 README。
