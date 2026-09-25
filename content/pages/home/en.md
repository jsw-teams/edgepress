---
title: EdgePress website builder
lang: en
slug: home
homepage: true
description: Build fast, secure websites on Cloudflare Workers with Markdown posts and editable page elements.
keywords:
  - website builder
  - Cloudflare Workers
  - page elements
  - website plugins
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: A project built for the edge
          title: Build a fast website from clear, editable source files.
          text: EdgePress turns Markdown posts, page layouts, themes, and consent-aware integrations into a static site served by Cloudflare Workers.
          mascotSrc: /edgepress/brand/mascot.png
          mascotAlt: A curious sparrow folded from layered paper pages, EdgePress's project mascot.
          cta:
            label: Start with the quick guide
            url: /quick-start/
          highlights:
            - Editable pages in localized Markdown front matter
            - Articles written in Markdown
            - Shared layouts and theme-defined palettes
  - columns: 1
    cells:
      -
        - type: feature-grid
          title: A clear place for each part of a site
          items:
            - title: Pages use editable elements
              icon: layout-grid
              text: Set the number of columns first, then choose elements and edit their content in each page file.
              url: /theme-development/
            - title: Posts use Markdown
              icon: file-text
              text: Write long-form articles in Markdown and let the built-in renderer sanitize and format them.
              url: /project-introduction/
            - title: Themes own the design
              icon: palette
              text: Build layouts with HTML partials and keep each theme's color palette in its stylesheet.
              url: /theme-development/
            - title: Integrations wait for consent
              icon: shield-check
              text: Add tracking, statistics, advertising, or CAPTCHA services with provider details in configuration.
              url: /plugin-development/
  - columns: 2
    cells:
      -
        - type: section
          title: Learn the project
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Start with the project introduction and quick start. The guides cover the feature lifecycle, supported runtimes, and the recommended publishing workflow.
            - type: link-list
              title: Project guides
              items:
                - label: Project introduction
                  url: /project-introduction/
                - label: Quick start
                  url: /quick-start/
      -
        - type: section
          title: Extend the project
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Use theme partials for shared head metadata, navigation, footer, and error-page layout. Page-specific rows and element content stay in localized page files.
                - Build plugins run in Node. Browser services wait for explicit consent before requesting vendor code.
            - type: link-list
              title: Development guides
              items:
                - label: Theme development
                  url: /theme-development/
                - label: Plugin development
                  url: /plugin-development/
  - columns: 1
    cells:
      -
        - type: latest-posts
          title: Latest project updates
          count: 3
          paginate: true
---
