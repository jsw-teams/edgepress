---
title: Quick start
lang: en
slug: quick-start
description: Install EdgePress, create Markdown posts, edit page elements, build the site, and preview it locally.
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: Start here
          title: Set up the project and open the live preview.
          text: Use the edgepress command after installing project dependencies. Local preview rebuilds changed source files and refreshes the accessibility and agent-friendliness report.
  - columns: 1
    cells:
      -
        - type: section
          title: Requirements and first commands
          tone: soft
          blocks:
            - type: data-table
              title: Supported baseline
              headers:
                - Requirement
                - Minimum
              rows:
                - - Node.js
                  - "22.12"
                - - npm
                  - Current supported release
                - - Cloudflare account
                  - Only needed to deploy
            - type: code
              title: Install dependencies and run EdgePress
              language: sh
              code: |
                npm ci
                edgepress build
                edgepress server
  - columns: 2
    cells:
      -
        - type: section
          title: Create content
          blocks:
            - type: steps
              items:
                - title: Create an article
                  text: Posts use Markdown and are written in content/posts/<post-id>/en.md or a localized file such as zh-cn.md.
                  command: edgepress new "A project update"
                - title: Create a page folder
                  text: Add content/pages/<page-id>/en.md. Each configured locale gets its own lowercase locale filename.
                - title: Set the language
                  text: Match the front matter lang value to the filename and enable optional locales in edgepress.config.mjs.
      -
        - type: section
          title: Edit a page layout
          blocks:
            - type: text
              paragraphs:
                - Pages have no Markdown article body. Put the page layout in the blocks front matter of each localized page file.
                - At the top of each row, choose columns from 1 to 4. Add one cells entry for each column. Inside a cell, add an element type, then its content fields.
                - Supported content elements include hero, section, text, heading, display-text, media-text, links, lists, steps, code, tables, notices, latest-posts, and configured privacy or integration widgets.
            - type: notice
              title: Accessibility for video
              text: A media-text video element requires a captions WebVTT file, a language code, a track label, and an accessible media label. Use locally hosted files when possible.
              tone: info
  - columns: 1
    cells:
      -
        - type: section
          title: Configure and preview
          blocks:
            - type: text
              paragraphs:
                - Edit site title, description, canonical URL, agent SEO, site navigation, footer text, and privacy controller details in config.yml. Theme colors live in theme CSS.
                - Change the selected theme with edgepress theme list and edgepress theme use <theme-name>. Theme paths are stored in edgepress.config.mjs.
                - edgepress server starts a local Wrangler server, watches source files, rebuilds changed pages, reloads the browser, and rewrites tools/page-check.md and tools/page-check.json.
            - type: code
              title: Build, inspect, and deploy
              language: sh
              code: |
                edgepress check
                edgepress doctor
                edgepress deploy
            - type: text
              text: Compatibility checks read the Node.js baseline, Worker entry, and compatibility date from project-compatibility.json and wrangler.jsonc. Check the generated report before deploying.
---
