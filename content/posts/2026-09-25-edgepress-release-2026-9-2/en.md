---
title: "EdgePress September 2026 update: request 2"
date: 2026-09-25
lang: en
slug: edgepress-release-2026-9-2
tags:
  - release
  - responsive design
  - Markdown
---

This is the second requested EdgePress update for September 2026.

## Mobile layouts and language selection

Themes now keep long article content, tables, code blocks, navigation, and page elements within narrow screens. The audit captures mobile views and compares the measured document width with the viewport. The header's language links are now a compact, keyboard-operable dropdown that opens the same route in the selected language.

## Markdown guide and local article search

The first post is now a bilingual, rendered guide to EdgePress posts and the supported CommonMark and GFM syntax. It covers nested lists and quotes, task markers, tables, code, links, images, sanitized inline HTML, and unsupported extensions. The report checks those rendered features in both language versions.

Visitors can search article titles and full post text using the generated local search index. Search runs in the browser and filters posts only.

## Accessible content report

The report now includes individual post results and screenshots for posts and pages. Its HTML uses headings, landmarks, labeled tables, linkable sections, image descriptions, and a tagged PDF with a document outline when the installed browser supports it. Mobile viewport and document widths appear beside each screenshot.

Run `edgepress check` to rebuild the site, review the report, and inspect the generated Markdown syntax checks and responsive evidence.
