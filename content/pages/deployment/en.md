---
title: Static deployment and optional services
lang: en
slug: deployment
description: Deploy static output on Cloudflare, Vercel, EdgeOne Pages or ESA Pages and register optional external services through consent.
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: Deployment
          title: Publish the same static site on four platforms.
          text: Build with npm run build. Every platform serves dist/. Page rendering, search and local JavaScript work without a website backend.
        - type: text
          heading: Platform configuration
          paragraphs:
            - Cloudflare reads wrangler.jsonc and serves static assets without a Worker script. Vercel reads vercel.json. Tencent EdgeOne Pages reads edgeone.json. Alibaba Cloud ESA Pages reads esa.jsonc.
            - Vercel and EdgeOne support repository deployment buttons. ESA uses repository import or the native deployment CLI. Authenticate in your chosen platform and run one deployment command, or use the manual deployment workflow after setting repository Secrets.
        - type: code
          title: Choose a deployment platform
          language: sh
          code: |
            npm run deploy:cloudflare
            npm run deploy:vercel
            npm run deploy:edgeone -- -n my-site
            npm run deploy:esa -- --name my-site
        - type: text
          heading: Optional APIs and widgets
          paragraphs:
            - Register external services in config.yml under plugins.consent.services. Use external-api with backendUrl for visitor-triggered API calls, or external-widget with backendUrl and a same-service moduleUrl exporting mount for an isolated interface.
            - Each service needs a unique ID, name, purpose, dataCategories, recipient, retention and HTTPS privacyUrl. Localized disclosure maps must cover every enabled site language. Do not put operator secrets in browser configuration.
            - Enable the group only after setting real service URLs and the privacy controller. The browser imports no service module and makes no API call before explicit per-service consent. Endpoint changes invalidate previous consent.
        - type: code
          title: Call a registered API from a theme asset
          language: js
          code: |
            import {callService} from '/edgepress/services.js';
            // Run this in response to the visitor's action after consent.
            const response = await callService('lookup', 'query', {headers: {'X-Service-Context': 'example'}});
        - type: text
          heading: Comment service ownership
          text: CommentNest owns its entire interface, translations, styles, authentication, uploads, storage and API. The website supplies only a generic service slot and published content context. Its deployment and credentials are managed separately.
        - type: link-list
          title: CommentNest integration
          items:
            - label: Independent service setup
              url: https://github.com/jsw-teams/CommentNest/blob/main/docs/edgepress.md
        - type: text
          heading: Cache policy
          paragraphs:
            - CSS and JavaScript names include a content hash, including local module dependencies. Cloudflare, Vercel and EdgeOne cache these immutable URLs for one year. HTML and unversioned metadata revalidate so a rebuild can publish new references immediately.
            - ESA serves the same hashed assets. Configure its browser and edge cache rules for CSS and JS to one year, while leaving HTML and unversioned JSON short-lived. esa.jsonc configures the build and asset directory; it has no documented equivalent of Vercel custom headers.
---
