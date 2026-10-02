---
title: EdgePress 202610.4：评论区与发表时区
date: 2026-10-03
lang: zh-CN
category: edgepress
tags:
  - EdgePress
  - RepoRelay
description: 显示经过验证的 GitHub 身份和头像，可从本地图片、GIF 图集中选择表情包，支持删除自己的评论。读者选中评论后才加载讨论。
---

评论显示发表用户的 GitHub 头像。新增独立表情包面板，内置两个本地图集、共 24 张图片，站长也可加入有使用权限的 GIF 或图片包。“上传图片”保留为单独操作。

登录后，本人评论提供删除按钮，确认后才删除。Worker 核验用户 ID、签名身份和实际讨论归属；关闭新评论后仍可删除自己的评论。删除不会自动清理已上传图片及历史副本。

EdgePress 202610.4 新增页面 comments 区块，修正同一页置顶文章与最新文章重复出现的问题。未启用评论的站点不显示评论区域；js.gripe 和 connect.js.gripe 明确显示，加载仍由读者的隐私选择控制。

文章发表时区在 config.yml 使用 `site.timeZone: Asia/Taipei` 配置。完整时间根据读者时区展示，只有年月日的文章保留日历日期。正式评论沿用原格式，不冒充原作者重新发表。

[安装及 EdgePress 接入](https://github.com/jsw-teams/RepoRelay/blob/main/docs/edgepress.md) · [独立更新日志](https://github.com/jsw-teams/RepoRelay/blob/main/CHANGELOG.md)
