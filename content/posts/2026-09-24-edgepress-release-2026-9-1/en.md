---
title: EdgePress September 2026 update
author: toewpq
date: 2026-09-24
lang: en
tags:
  - release
  - page builder
  - accessibility

---
This is the first requested release update for September 2026.

## Editable page layouts

Pages now use an outside-in layout model. Set a row's column count, add one cell for each column, choose element types inside each cell, and write the element content in that page's localized Markdown front matter. Posts continue to use Markdown rendering.

New elements pair images or captioned video with text, and provide display typography styles. Theme stylesheets own colors and visual treatment.

## Shared site components

All pages use the selected theme's shared head, navigation, and footer partials. The same layout generates localized 403 and 404 pages. Site metadata, component visibility, navigation labels, and footer copy are configured in config.yml. Theme selection uses edgepress theme.

## Plugins and backend requests

The guides now cover consent-gated tracking, statistics, advertising, and human-verification providers, alongside trusted build-time plugins. A generic Worker proxy can forward /api/v1/* requests through a Service Binding or an HTTPS URL and a Worker secret. The backend must still validate and authorize every request.

## Live preview and review report

edgepress server watches source files, rebuilds the site, refreshes the browser, and updates the accessibility and agent-friendliness report. edgepress check also captures desktop and mobile screenshots and writes tools/page-check.pdf with Markdown and JSON summaries.

The automated report checks generated markup and metadata. It does not establish legal compliance or replace manual keyboard, contrast, or assistive-technology review.
