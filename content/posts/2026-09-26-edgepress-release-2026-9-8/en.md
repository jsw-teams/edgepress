---
title: "EdgePress September 2026 update: request 8"
author: toewpq
date: 2026-09-26
lang: en
slug: edgepress-release-2026-9-8
tags:
  - release
  - privacy
  - Markdown

---

This is the eighth requested EdgePress update for September 2026.

## Date-based consent and localized disclosures

Consent settings use a required `proposedDate` and an optional `effectiveDate` instead of a version counter. The generated privacy policy displays these dates and lists configured services with localized names, purposes, data categories, recipients, and retention details. Accept and reject controls have equal prominence, optional services start unchecked, and visitors can expand the panel to make a granular choice. The consent component has scoped theme styles and its own viewport checks and screenshots, separate from page-content layout checks.

## Video in Markdown posts

Posts can insert direct MP4, WebM, OGV, and OGG files using image-shaped Markdown syntax. The renderer creates an accessible native player with controls and `preload="none"`.

## Post lists and summaries

Archives now choose one language version per post and sort equal-date release notes by their numeric sequence. The homepage continues to show the latest posts in the current language. Archive, tag, and homepage cards render Markdown formatting in summaries.
