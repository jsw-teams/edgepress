---
title: "EdgePress October 2026 update"
author: toewpq
date: 2026-10-01
lang: en
slug: edgepress-release-2026-10-1
tags:
  - release
  - assets
  - security
description: Publish page media from content/assets, update Wrangler, and add automated dependency and release security checks.
---

This release starts the October 2026 update series.

## Publish page media from content/assets

Files under `content/assets/` are now published at matching site-root paths. For example, `content/assets/images/diagram.svg` becomes `/images/diagram.svg`. Shared theme CSS and JavaScript remain in each theme's `assets/` directory.

## Update build dependencies

Wrangler is updated to 4.144.0 along with its Cloudflare runtime dependencies. Dependabot now checks npm packages and GitHub Actions weekly, and a scheduled workflow runs `npm audit` and the project build.

## Scan version builds

The Codex Security workflow can scan a version build when manually started or when an enabled version tag is pushed. Completed findings are uploaded to GitHub Code Scanning. Tag scans require the `CODEX_SECURITY_ENABLED` repository variable, and every scan requires the `OPENAI_API_KEY` Actions secret.
