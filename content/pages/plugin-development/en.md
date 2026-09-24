---
title: Plugin development
lang: en
slug: plugin-development
description: Extend EdgePress with trusted build plugins, consent-gated browser integrations, and private backend forwarding.
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: Extension guide
          title: Connect trusted build code, browser providers, and backend services.
          text: Build-time plugins run in Node. Browser integrations wait for visitor consent. Runtime backend requests stay behind the Worker.
  - columns: 2
    cells:
      -
        - type: section
          title: Build-time plugins
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Local JavaScript modules in plugins/ may transform source documents, register hooks or renderers, and generate routes. They execute with the build process permissions, so only load code reviewed by the project owner.
                - The starter consent plugin adds a privacy panel after the shared page layout. Build plugins are trusted code and are not deployed as browser scripts.
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
      -
        - type: section
          title: Tracking, statistics, advertising, and CAPTCHA
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Add browser providers in config.yml under plugins.tracking, plugins.statistics, plugins.advertising, or plugins.captcha. Each entry needs a unique ID, purpose, retention description, and a public provider identifier.
                - Available providers include Google Tag Manager and Meta Pixel; Cloudflare Web Analytics, Google Analytics, and Baidu Tongji; Google AdSense; and Cloudflare Turnstile, Google reCAPTCHA, and hCaptcha.
                - Provider code is imported only after the visitor accepts that integration. Keep CAPTCHA secret keys out of config.yml and client code. The server must submit each CAPTCHA response to the provider verification API before accepting a form.
            - type: notice
              title: Operator details
              text: Fill privacy.controller.name, privacy.controller.contact, and privacy.policyUrl before configuring any browser provider. The build rejects provider services when the controller name or contact is blank.
              tone: warning
  - columns: 1
    cells:
      -
        - type: section
          title: Forward requests to a URL and token backend
          blocks:
            - type: text
              paragraphs:
                - The Worker exposes /api/v1/* for GET, POST, PUT, PATCH, and DELETE. With BACKEND_URL and BACKEND_TOKEN configured, it appends the request path and query to the backend URL, sends a Bearer token, forwards a small allowlist of request headers, and marks responses no-store.
                - BACKEND_URL must use HTTPS. Plain HTTP is accepted only for localhost development. Request bodies are limited to 1 MB. The backend still needs to authenticate the scoped token, validate user input, authorize every action, and enforce rate and size limits.
                - Prefer a Cloudflare BACKEND Service Binding for private Worker-to-Worker calls. A browser must never receive BACKEND_TOKEN. This generic proxy does not create application accounts, forms, or data models by itself.
            - type: steps
              items:
                - title: Set the backend base URL
                  text: Add vars.BACKEND_URL in wrangler.jsonc. Use an HTTPS base URL without credentials or a token in its URL.
                - title: Store the secret
                  text: Wrangler prompts for the secret value. Use a narrowly scoped backend token and rotate it under the operator's process.
                  command: edgepress secret put BACKEND_TOKEN
                - title: Configure and deploy
                  text: Confirm the backend accepts the forwarded path and Bearer token, then deploy the Worker.
                  command: edgepress deploy
            - type: code
              title: Local development
              language: sh
              code: |
                # .dev.vars is local and must not be committed
                BACKEND_URL=http://127.0.0.1:8788
                BACKEND_TOKEN=replace-with-a-local-token
            - type: text
              text: The Worker returns 503 when no backend binding or URL and token are configured. It rejects unsupported methods and oversized request bodies.
            - type: link-list
              title: Provider validation reference
              items:
                - label: Cloudflare Turnstile Siteverify
                  url: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
                - label: Consent guidelines from the EDPB
                  url: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf
  - columns: 1
    cells:
      -
        - type: section
          title: Content security and maintenance
          blocks:
            - type: text
              paragraphs:
                - The built-in Markdown renderer sanitizes post output. Custom renderers, plugins, themes, and files in static/ are trusted project code; review changes before building or deploying. Do not put secrets in posts, themes, or public assets.
                - edgepress iterate writes a report-only review plan under .edgepress/reports/. It does not edit source files, update dependencies, or deploy. edgepress security checks dependency advisories. Review the lockfile and generated page report before deployment, and keep a known-good deployment for rollback.
            - type: code
              title: Review project changes
              language: sh
              code: |
                edgepress security
                edgepress iterate
                edgepress check
                edgepress server
---
