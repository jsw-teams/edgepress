---
title: "EdgePress September 2026 update: request 4"
author: toewpq
date: 2026-09-25
lang: en
slug: edgepress-release-2026-9-4
tags:
  - release
  - reports
  - cloudflare

---

This is the fourth requested EdgePress update for September 2026.

## Keep the audit report in one PDF

`edgepress check` and `edgepress server` now persist only `tools/page-check.pdf`. Desktop and mobile screenshots are embedded in the PDF; temporary HTML and screenshot files are removed after generation.

## Remove the templates directory

`edgepress init` now writes its generated README and `.gitignore` directly from the CLI package. The source and npm package no longer include a `templates/` directory.

## Cloudflare Workers Builds setup

The quick-start guide records the repository settings: root directory `/`, build command `npm run build`, deploy command `npx wrangler deploy`, and no required build variables. It also explains that a build stuck at `Initializing build environment` has not run the project build command yet; reconnect the GitHub integration or replace a stale Cloudflare build API token before retrying.

Wrangler requires `compatibility_date` for this Worker, so the project pins it to the first day of the month: `2026-09-01`.
