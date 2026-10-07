---
title: Theme development
lang: en
slug: theme-development
description: Build EdgePress themes with shared HTML partials, CSS palettes, element layouts, and reusable error pages.
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: Theme guide
          title: Let themes own shared layout and visual design.
          text: Pages define row widths, element types, and content. Themes define the site shell, typography, spacing, colors, and responsive behavior.
  - columns: 2
    cells:
      -
        - type: section
          title: Theme structure
          tone: soft
          blocks:
            - type: code
              title: Theme files
              language: text
              code: |
                themes/your-theme/
                  theme.json
                  package.json
                  README.md
                  layouts/
                    layout.html
                    partials/
                      head.html
                      header.html
                      footer.html
                  assets/
                    style.css
            - type: text
              paragraphs:
                - The shared layout renders every page and post. The head, header, and footer partials provide common site components. Configure the page-title suffix and separator, site title, shared navigation, language links, footer text, and component visibility in config.yml.
                - Use double-brace placeholders for escaped values. The approved raw placeholders are generated page content, JSON-LD, and EdgePress-generated navigation markup. Keep the skip link, one main landmark, labeled navigation, visible focus, and one page-level h1.
                - Page-block links can use /[launge]/quick-start/. The generated page replaces [launge] with the current language path and removes the segment for the default language, so the same link works in both locales.
                - Keep the body as a full-height vertical layout and let main grow so the footer stays at the bottom on short pages.
                - Put page images and downloads in content/assets/. EdgePress publishes each file at its matching site-root path. For example, content/assets/images/diagram.svg becomes /images/diagram.svg. Keep themes/<name>/assets/ for shared CSS and JavaScript.
                - Style shared code blocks, copy buttons, and article contents in the theme. Code lines wrap on small viewports, copy controls have visible keyboard focus, and the generated post contents list links to heading anchors.
      -
        - type: section
          title: Choose a theme palette
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Keep colors, font choices, and component styling in the selected theme stylesheet. Do not put color values in config.yml. The site content stays the same when a theme changes.
                - List the available themes with edgepress theme list. Select one with edgepress theme use default, edgepress theme use atelier, or edgepress theme use signal.
                - Install a published theme with edgepress theme install <npm-package>[@version]. The package must include theme.json and layouts/layout.html. EdgePress copies it into themes/ and does not run npm install scripts.
                - Start a custom theme with edgepress theme create my-theme. This creates an npm-ready package manifest, a blank stylesheet, and accessible layout, head, header, navigation, and footer files. Edit the files, then select it with edgepress theme use my-theme. Publish from that directory with npm publish --access public.
            - type: notice
              title: Shared error layouts
              text: EdgePress generates localized 403 and 404 pages through the selected theme layout. The Worker serves the matching 403 page when static asset access is denied.
              tone: info
  - columns: 1
    cells:
      -
        - type: section
          title: Page rows and editable elements
          blocks:
            - type: text
              paragraphs:
                - Each page and locale is a Markdown file, but the page body after front matter must stay empty. The editor data lives in its blocks YAML.
                - "Order the data from the outside inward: set each row's columns count first, provide one cells entry per column, select an element type inside a cell, then edit that element's fields. The validator rejects mismatched column counts and empty cells."
                - Pages do not use the post Markdown renderer. Posts remain Markdown articles and use the built-in sanitizing renderer.
                - Hero blocks can use mascotWebpSrcset with ascending path-and-width candidates, mascotSizes matching the rendered width, and mascotWidth/mascotHeight matching the fallback image. mascotSrc remains the fallback for browsers without WebP support.
            - type: data-table
              title: Available element families
              headers:
                - Element
                - Main purpose
              rows:
                - - hero, section, text, heading
                  - Page structure and written content
                - - display-text
                  - Large editorial, serif, outline, mono, or accent typography
                - - media-text
                  - Image or captioned video paired with editable text
                - - link-list, list, steps, code, data-table, notice
                  - Navigation, instructions, code samples, facts, and callouts
                - - feature-grid, quote, cta, faq, latest-posts
                  - Reusable page composition
                - - privacy-services, privacy-controller, privacy-consent, captcha, ad-slot
                  - Configuration-backed site integrations
            - type: notice
              title: Video captions
              text: media-text video entries require a WebVTT captions source, language tag, and track label. Videos use native controls and preload none. A third-party video embed should remain behind an explicit consent integration.
              tone: warning
  - columns: 1
    cells:
      -
        - type: section
          title: Develop and preview
          blocks:
            - type: steps
              items:
                - title: Select a theme
                  text: Install or create a theme, then use the EdgePress theme command to change paths.theme in edgepress.config.mjs.
                  command: edgepress theme use your-theme
                - title: Edit layout and CSS
                  text: Change the selected theme layout, partials, and stylesheet. Each CSS and JavaScript asset receives a content fingerprint during build.
                - title: Preview the site
                  text: The server watches source files, rebuilds the output, refreshes the browser, and updates the accessibility and agent-friendliness report.
                  command: edgepress server
  - columns: 1
    cells:
      -
        - type: section
          title: Use the shared icon library
          tone: soft
          text: EdgePress ships 28 local licensed Lucide SVG icons in content/assets/edgepress/icons/, published at /edgepress/icons/<name>.svg. Theme navigation uses them automatically; feature-grid items can also name an icon, with no runtime package or third-party request.
          blocks:
            - type: code
              title: Add a decorative icon to a theme partial
              language: html
              code: |
                <img class="icon icon-library" src="/edgepress/icons/layers.svg" width="24" height="24" alt="" aria-hidden="true">
            - type: code
              title: Choose an icon for a feature card
              language: yaml
              code: |
                - title: Posts use Markdown
                  icon: file-text
                  text: Write and publish an article.
  - columns: 1
    cells:
      - - type: section
          title: Show articles for one project
          blocks:
            - type: text
              paragraphs:
                - "Use post-list with category: edgepress, or categories: [blog, uncategorized], to select columns independently of tags. Lists are newest first and choose the current language version when available. count accepts 1 to 12; longer single-category lists link to a localized category archive."
            - type: code
              title: A project article list
              language: yaml
              code: |
                - columns: 1
                  cells:
                    - - type: post-list
                        title: EdgePress articles
                        category: edgepress
                        count: 6
            - type: text
              paragraphs:
                - "Set category: edgepress in article front matter. Omitted categories default to uncategorized. Tags are displayed on individual articles; tag filters and tag archives are removed. Set site.archive.categories for the main journal and match those categories when paginating a latest-posts homepage."
  - columns: 1
    cells:
      - - type: text
          heading: Image details
          text: Article images and Pages image/media-text blocks open a closable full-screen viewer on click. Use originalSrc in a Pages image block, or data-original on a Markdown HTML img, when its original URL differs from the displayed preview. Originals load only when opened; image-file links are also supported. Branding and ordinary navigation images are unchanged. Optional-service images still wait for consent, and their CSP remains enforced.
        - type: text
          text: Local published images receive their intrinsic width and height during build, preserving their aspect ratio before loading. Explicit dimensions remain authoritative. Supply dimensions for remote pictures because the builder does not request them.

  - columns: 1
    cells:
      - - type: text
          heading: Local multilingual fonts
          text: Built-in themes ship Noto Sans, Noto Serif and variable simplified/traditional Chinese fonts with the site, without a font CDN. Unicode-range WOFF2 subsets load only the glyphs used on the page. Traditional locales prefer traditional letterforms. UI, articles, Pages and Chinese code text use bundled glyphs without requiring visitors to install Chinese fonts.
        - type: code
          title: Use shared font variables in custom themes
          language: css
          code: |
            :root { font-family: var(--edgepress-font-sans); }
            h1, h2 { font-family: var(--edgepress-font-serif); }
            pre, code { font-family: var(--edgepress-font-mono); }
        - type: text
          text: Coverage includes Latin, Greek, Cyrillic and common simplified/traditional Chinese, rather than all Unicode. Language packs using other scripts, such as Arabic, also need the corresponding Noto font and unicode-range. Keep fonts same-origin, licensed and content-hashed. fonts:sync maintains font assets; ordinary builds need no font downloads.

---
