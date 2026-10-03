---
title: EdgePress website builder
lang: en
slug: home
homepage: true
description: Build static websites with Markdown, editable pages and consent-controlled services on five
  hosting platforms.
keywords:
  - website builder
  - Cloudflare Workers
  - page elements
  - website plugins
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: A project built for the edge
          title: Build a fast website from clear, editable source files.
          text: EdgePress turns Markdown articles, page layouts, themes and optional services into static websites for
            Cloudflare, Vercel, Netlify, Tencent EdgeOne Pages and Alibaba Cloud ESA Pages.
          mascotSrc: /edgepress/brand/home-hero.png
          mascotAlt: A giant panda and Taiwanese black bear standing together with friendly smiles; the bear has a clear
            pale V chest marking.
          mascotWidth: 1536
          mascotHeight: 1024
          mascotSizes: "(max-width: 620px) calc(100vw - 64px), 320px"
          mascotWebpSrcset:
            - src: /edgepress/brand/home-hero-768.webp
              width: 768
            - src: /edgepress/brand/home-hero.webp
              width: 1536
          cta:
            label: Start with the quick guide
            url: /quick-start/
          highlights:
            - Editable pages in localized Markdown front matter
            - Articles written in Markdown
            - Shared layouts and theme-defined palettes
  - columns: 1
    cells:
      - - type: feature-grid
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
      - - type: section
          title: Learn the project
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Start with the project introduction and quick start. The guides cover the feature lifecycle,
                  supported runtimes, and the recommended publishing workflow.
            - type: link-list
              title: Project guides
              items:
                - label: Project introduction
                  url: /project-introduction/
                - label: Quick start
                  url: /quick-start/
      - - type: section
          title: Extend the project
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Use theme partials for shared head metadata, navigation, footer, and error-page layout.
                  Page-specific rows and element content stay in localized page files.
                - Build plugins run in Node. Browser services wait for explicit consent before requesting
                  vendor code.
            - type: link-list
              title: Development guides
              items:
                - label: Theme development
                  url: /theme-development/
                - label: Plugin development
                  url: /plugin-development/
  - columns: 1
    cells:
      - - type: latest-posts
          title: Latest project updates
          count: 3
          paginate: true
  - columns: 1
    cells:
      - - type: media-text
          mediaType: image
          src: /images/previews/edgepress-en.webp
          alt: Actual local EdgePress website preview.
          caption: Interface preview captured locally.
          placement: left
          title: See what your source becomes
          text: Posts, navigation, search and language routes publish together. Choose a theme and keep everyday writing
            in Markdown.
  - columns: 1
    cells:
      - - type: data-table
          title: Free hosting priority (2026-10-04)
          headers:
            - Priority
            - Platform
            - Allowance and conditions
          rows:
            - - "1"
              - Cloudflare
              - Unlimited static requests; 3,000 build minutes/month.
            - - "2"
              - Tencent EdgeOne Pages
              - Currently unlimited website traffic/requests; 500 builds/month. Free-phase limits may change.
            - - "3"
              - Vercel Hobby
              - 100 GB/month and 1 million CDN requests; personal non-commercial use.
            - - "4"
              - Netlify Free
              - 300 shared credits/month. A deploy costs 15; traffic 20/GB; requests 2/10,000. Pauses when
                exhausted.
            - - Verify
              - Alibaba Cloud ESA Pages
              - Traffic uses the site package. Confirm its quota; 100,000/day functions is not static
                bandwidth.
  - columns: 1
    cells:
      - - type: link-list
          title: Deployment and quota sources
          items:
            - label: Chinese guide
              url: https://github.com/jsw-teams/edgepress/blob/main/content/guides/zh-cn.md
            - label: Official quota sources
              url: https://github.com/jsw-teams/edgepress/blob/main/content/guides/platforms.md
---
