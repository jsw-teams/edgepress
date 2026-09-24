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
                - Install a theme package with edgepress theme install <npm-package> or start with a blank theme using edgepress theme create <name>.
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
            - type: section
              title: Publish the source on GitHub
              blocks:
                - type: text
                  paragraphs:
                    - Create an empty repository on GitHub, then push the EdgePress source. In the Cloudflare dashboard, create a Worker and connect that repository with Workers Builds. Choose main as the production branch. Set a unique Worker name in wrangler.jsonc before deployment.
                    - The build and deploy scripts in package.json are detected by Workers Builds. It runs npm run build to generate dist/, then npm run deploy to publish the Worker. dist/ stays out of Git. Cloudflare manages the build authorization for this connection.
                - type: code
                  title: Upload the source repository
                  language: sh
                  code: |
                    git init
                    git add .
                    git commit -m "Initial EdgePress site"
                    git branch -M main
                    git remote add origin https://github.com/<owner>/<repository>.git
                    git push -u origin main
                - type: text
                  text: For a local deployment, authenticate with npx wrangler login, then run edgepress deploy. The command generates dist/ and deploys the Worker using wrangler.jsonc.
                - type: link-list
                  title: Deployment references
                  items:
                    - label: Connect GitHub to Cloudflare Workers Builds
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
                    - label: Configure Workers Builds commands
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
            - type: section
              title: Generate files for OpenResty or Nginx
              blocks:
                - type: text
                  paragraphs:
                    - edgepress build and edgepress generate use the same generator and write the static site to dist/. Run edgepress generate, then upload the contents of dist/ to the server's document root. Do not upload the dist/ directory as a nested folder unless that is the URL path you want.
                    - OpenResty uses Nginx configuration syntax for static files. Set root to the uploaded directory; try_files checks the exact path, directory index, and .html route. The generated 403.html and 404.html files can be used for error responses.
                - type: code
                  title: Minimal Nginx or OpenResty site
                  language: nginx
                  code: |
                    server {
                      listen 80;
                      server_name example.org;
                      root /var/www/edgepress;
                      index index.html;

                      location / {
                        try_files $uri $uri/ $uri.html =404;
                      }

                      error_page 403 /403.html;
                      error_page 404 /404.html;
                    }
                - type: code
                  title: Generate the upload directory
                  language: sh
                  code: edgepress generate
                - type: notice
                  title: Worker-only integrations
                  text: Static hosting does not run src/worker.js. The built-in /api/ proxy and Cloudflare service bindings require an EdgePress Worker deployment; otherwise configure an equivalent server-side route on your host. Keep backend tokens out of browser settings.
                  tone: warning
---
