---
title: Project introduction
lang: en
slug: project-introduction
description: EdgePress architecture, release policy, feature maturity, and supported runtime baseline.
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: Project overview
          title: A static site builder with editable pages and Markdown articles.
          text: EdgePress separates content, presentation, trusted build-time plugins, and Worker request handling so each part has a clear place to change.
  - columns: 1
    cells:
      -
        - type: feature-grid
          title: Project boundaries
          items:
            - title: Pages
              text: Each localized page stores its ordered row layout, column count, element types, and element content in Markdown front matter.
            - title: Posts
              text: Each article is a Markdown document rendered with the built-in sanitizing pipeline.
            - title: Themes
              text: HTML layouts, shared partials, and hard-coded CSS palettes control site presentation.
  - columns: 1
    cells:
      -
        - type: section
          title: Supported baseline
          tone: soft
          blocks:
            - type: data-table
              title: Runtime and capability status for this release
              headers:
                - Area
                - Baseline
                - Status
              rows:
                - - Build CLI
                  - Node.js 22.12 or newer
                  - Stable
                - - Worker runtime
                  - Module Worker with Request, Response, and Web APIs
                  - Stable
                - - Static publishing
                  - Workers Static Assets through Wrangler
                  - Stable
                - - Node.js APIs in Worker
                  - Not required by src/worker.js
                  - Stable
                - - Plugin API
                  - Major version 1
                  - Experimental
                - - Page block builder
                  - Ordered rows, 1 to 4 columns, validated elements
                  - Experimental
                - - Backend forwarding
                  - Optional Service Binding or URL plus Worker token
                  - Experimental
            - type: text
              text: The compatibility manifest is project-compatibility.json. The Worker compatibility date is pinned in wrangler.jsonc. Static page delivery does not require nodejs_compat.
  - columns: 1
    cells:
      -
        - type: section
          title: Release and feature lifecycle
          blocks:
            - type: data-table
              title: Feature stages
              headers:
                - Stage
                - Meaning
              rows:
                - - Experimental
                  - Usable, with configuration or behavior that may change in a minor release.
                - - Stable
                  - Follows semantic versioning; breaking changes require a major release.
                - - Deprecated
                  - Remains available for at least two minor releases and is removed in a major release, except for urgent security issues.
                - - Removed
                  - No longer shipped; the compatibility manifest records the removal release.
            - type: text
              paragraphs:
                - "Monthly releases use the year.month.request format. This release is 2026.9.1: the first requested release update for September 2026."
                - Ship a minor release when the monthly review is ready, and use patch releases for defects, security fixes, and dependency updates. Support the previous major release with security fixes for 12 months after a new major line begins.
                - Before a release, update project-compatibility.json and this feature matrix together. Run edgepress doctor to review the local Node.js version, Worker entry, and configured compatibility date.
---
