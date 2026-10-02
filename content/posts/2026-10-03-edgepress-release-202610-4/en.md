---
title: "EdgePress 202610.4: discussions and publication time"
date: 2026-10-03
lang: en
category: edgepress
tags:
  - EdgePress
  - RepoRelay
description: Verified GitHub identity and avatars, a local image/GIF sticker
  gallery, and deletion of your own comments. Discussions load only after you
  opt in.
---

Comment authors now show their GitHub avatars. A separate sticker panel offers 24 locally hosted images in two packs, and operators can add their own licensed GIF or image packs. Upload images remains a separate action.

After signing in, your own comments offer a delete action with confirmation. The Worker checks numeric identity, signed metadata and the actual discussion before deleting; this remains available when new comments are closed. Uploaded media and historical copies are not automatically removed.

EdgePress 202610.4 adds explicit comments blocks for pages and removes repeated articles across pinned and recent lists. Sites without comments enabled omit the area. Both JS.GRIPE and connect show it and keep loading behind your privacy choice.

Publication time is configured with `site.timeZone: Asia/Taipei`. Complete timestamps display in the reader’s zone, while date-only articles remain dates. No historical comment rewrite or author impersonation is required.

[Install and integrate with EdgePress](https://github.com/jsw-teams/RepoRelay/blob/main/docs/edgepress.md) · [Independent changelog](https://github.com/jsw-teams/RepoRelay/blob/main/CHANGELOG.md)
