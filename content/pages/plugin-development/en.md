---
title: Plugin development
lang: en
slug: plugin-development
description: Extend static websites with trusted build plugins and consent-registered external services.
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: Extension guide
          title: Connect trusted build code, browser providers, and backend services.
          text: Build-time plugins run in Node. Browser services load only after visitor consent. Backends are independently
            deployed.
  - columns: 2
    cells:
      - - type: section
          title: Build-time plugins
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Local JavaScript modules in plugins/ may transform source documents, register hooks or renderers, and
                  generate routes. They execute with the build process permissions, so only load code reviewed by the
                  project owner.
                - The starter consent plugin adds a privacy panel after the shared page layout. Build plugins are
                  trusted code and are not deployed as browser scripts.
            - type: code
              title: Register a route generator
              language: js
              code: |
                export default function projectMeta(api) {
                  api.registerGenerator('project-meta', ({ site }) => ({
                    path: 'project-meta.json',
                    body: JSON.stringify({
                      title: site.config.site.title,
                      posts: site.posts.length
                    }),
                    contentType: 'application/json; charset=utf-8'
                  }));
                }
      - - type: section
          title: Tracking, statistics, advertising, and CAPTCHA
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Add browser providers in config.yml under plugins.consent.services. Each service needs a unique ID, provider,
                  purpose, dataCategories, recipient, retention, a privacyUrl pointing to the provider's current privacy
                  information, and its public site identifier. privacyUrl must be an HTTPS URL. Localized fields are
                  maps keyed by every enabled locale, such as en and zh-CN.
                - Available providers include Google Tag Manager and Meta Pixel; Cloudflare Web Analytics, Google
                  Analytics, and Baidu Tongji; Google AdSense; and Cloudflare Turnstile, Google reCAPTCHA, and hCaptcha.
                - Set plugins.consent.proposedDate to the YYYY-MM-DD date the notice was drafted. Set effectiveDate when
                  the notice takes effect; omit it while no effective date has been set. Updating either date makes
                  saved consent stale, so visitors are asked again.
                - Provider code is imported only after the visitor accepts that integration. The first layer offers
                  accept and reject together; service data and individual switches are available in its details. Keep
                  CAPTCHA secret keys out of config.yml and client code. The server must submit each CAPTCHA response to
                  the provider verification API before accepting a form.
            - type: notice
              title: Operator details
              text: Fill privacy.controller.name, privacy.controller.contact, and privacy.policyUrl before configuring any browser
                provider. The build rejects provider services when the controller name or contact is blank.
              tone: warning
  - columns: 1
    cells:
      - - type: text
          heading: Optional external services
          paragraphs:
            - Register external-api or external-widget under plugins.consent.services in config.yml. Services require
              their own HTTPS origin, complete privacy disclosures and explicit visitor consent.
            - The site is static. API authentication, authorization, CAPTCHA verification, input validation and rate
              limits belong to the independently deployed backend. Operator Secrets never enter browser configuration.
  - columns: 1
    cells:
      - - type: section
          title: Content security and maintenance
          blocks:
            - type: text
              paragraphs:
                - The built-in Markdown renderer sanitizes post output. Custom renderers, plugins, themes, and files in
                  static/ are trusted project code; review changes before building or deploying. Do not put secrets in
                  posts, themes, or public assets.
                - edgepress iterate writes a report-only review plan under .edgepress/reports/. It does not edit source
                  files, update dependencies, or deploy. edgepress security checks dependency advisories. Review the
                  lockfile and generated page report before deployment, and keep a known-good deployment for rollback.
            - type: code
              title: Review project changes
              language: sh
              code: |
                edgepress security
                edgepress iterate
                edgepress check
                edgepress server
  - columns: 1
    cells:
      - - type: text
          heading: iask
          text: iask owns comments, styles, identity and stickers. Register an external-widget with backendUrl and
            moduleUrl under plugins.consent.services; the host only loads it after opt-in.
        - type: link-list
          title: Install and integrate
          items:
            - label: Installation and EdgePress integration
              url: https://github.com/jsw-teams/iask/blob/main/docs/edgepress.md
            - label: iask release notes
              url: https://github.com/jsw-teams/iask/blob/main/CHANGELOG.md
        - type: code
          title: Optional page discussion block
          language: yaml
          code: |
            blocks:
              - columns: 1
                cells:
                  - - type: service
                      integration: github-comments
---
