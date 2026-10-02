---
title: EdgePress October update 3
lang: en
date: 2026-10-03T10:00:00+08:00
slug: edgepress-release-2026-10-3
category: edgepress
pinned: true
description: Optional GitHub App comments, pinned article lists, local publication times and automatic article change history.
---
This update adds optional RepoRelay discussions. Readers choose whether to load GitHub comments; App credentials stay in the Worker. Repository installation and persistent signing keys are configured automatically.

Article lists support pinned entries. Publication timestamps follow the reader’s timezone. The latest article update is detected from content history, and authors can enable an actual content diff with `showChanges: true`; it is hidden by default.

Consent services follow the existing YAML configuration. Disabled integrations retain their settings without loading. UI icons now use licensed Lucide SVGs, and all content image sources live under `content/assets`.

See the README for Worker configuration and the required full Git checkout for article history.
