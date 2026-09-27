---
title: "EdgePress September 2026 update: request 10"
author: toewpq
date: 2026-09-27
lang: en
slug: edgepress-release-2026-9-10
tags:
  - release
  - internationalization
  - privacy
  - themes
description: Keep privacy choices across locales, localize page-block links, and improve article tags, search loading, and SVG icons.
---

This is the tenth requested EdgePress update for September 2026.

## Keep privacy choices when changing languages

Privacy choices now use a locale-independent configuration fingerprint, so switching page languages keeps the saved choice active. Existing choices from the previous locale-specific format migrate automatically. A change to notice dates or service configuration still asks visitors to choose again.

## Link to pages in the current language

Page-block links can use `/[launge]/quick-start/`. The build replaces the marker with the current locale path and omits the locale segment for the default language. Links from the Chinese homepage now open the matching Chinese guides.

## Improve article tags and search

Article pages show their tags as clear links to the matching tag pages. The search script loads only on search pages; tag navigation uses native links and works without JavaScript.

## Redraw icons and simplify privacy wording

The settings and plug SVG icons have been redrawn. The privacy policy now explains in plain language that a visitor's choice stays on their device, without exposing an internal storage key.
