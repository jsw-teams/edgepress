---
title: Quick start
lang: en
slug: quick-start
description: Install EdgePress, create Markdown posts, edit page elements, build the site, and preview it locally.
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: Start here
          title: Set up the project and open the live preview.
          text: Use the edgepress command after installing project dependencies. Local preview rebuilds changed source files and refreshes the PDF accessibility and agent-friendliness report.
  - columns: 1
    cells:
      - - type: section
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
                npm run build
                npm run dev
  - columns: 1
    cells:
      - - type: section
          title: Write your first article with Markdown
          tone: soft
          blocks:
            - type: text
              text: After the one-time setup, everyday writing uses Markdown. EdgePress creates the title, date, and language for you. Open the path printed by the command and write below the second --- line. The theme handles the page title, article list, contents, search, and feed.
            - type: steps
              items:
                - title: Create an article
                  text: The command prints the new Markdown file path and never overwrites an existing post.
                  command: npm run new -- post "My first article"
                - title: Write in Markdown
                  text: Replace the starter paragraph. Use
                - title: Preview and publish
                  text: Keep the preview running while you edit. Save the file to refresh it. Build before publishing through your existing deployment workflow.
                  command: npm run dev
            - type: code
              title: A short article body
              language: markdown
              code: |
                This is my first article. **Markdown** formats the text.

                ## What I learned

                - Record the problem.
                - Explain the solution.

                [Project source](https://github.com/jsw-teams/edgepress)
            - type: text
              text: Site settings are handled during setup. The page-layout and theme guides below are available when you want to change the website design. They are optional for everyday article writing.
  - columns: 2
    cells:
      - - type: section
          title: Create content
          blocks:
            - type: steps
              items:
                - title: Create an article
                  text: Posts use Markdown and are written in content/posts/<post-id>/en.md or a localized file such as zh-cn.md.
                  command: edgepress new post "A project update"
                - title: Create a page folder
                  text: Add content/pages/<page-id>/en.md. Each configured locale gets its own lowercase locale filename.
                - title: Set the language
                  text: Match the front matter lang value to the filename and enable optional locales in edgepress.config.mjs.
      - - type: section
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
      - - type: section
          title: Configure and preview
          blocks:
            - type: text
              paragraphs:
                - Edit site title, description, canonical URL, agent SEO, site navigation, footer text, and privacy controller details in config.yml. Theme colors live in theme CSS.
                - Change the selected theme with edgepress theme list and edgepress theme use <theme-name>. Theme paths are stored in edgepress.config.mjs.
                - Install a theme package with edgepress theme install <npm-package> or start with a blank theme using edgepress theme create <name>.
                - edgepress server starts a local Wrangler server, watches source files, rebuilds changed pages, reloads the browser, and refreshes tools/page-check.pdf. Screenshots are embedded in the PDF and temporary files are removed after generation.
            - type: code
              title: Build, inspect, and deploy
              language: sh
              code: |
                edgepress check
                edgepress doctor
                edgepress deploy
            - type: text
              text: Compatibility checks read the Node.js baseline, Worker entry, and compatibility date from project-compatibility.json and wrangler.jsonc. Review the PDF report before deploying.
            - type: text
              paragraphs:
                - You can run edgepress check before writing your first article. Markdown verification uses a built-in in-memory sample; no tutorial post or posts directory is required. Worker compatibility reads the actual main entry from Wrangler configuration.
                - With Edge, Chrome or Chromium installed, the report includes headless desktop, phone and tablet profiles in light and dark modes, browser accessibility-tree checks, and a sample of Tab, Shift+Tab and Enter navigation. No visible browser or desktop screen reader is launched. Simulations do not replace physical-device or assistive-technology testing; unavailable browser checks are labeled accordingly.
            - type: section
              title: Publish the source on GitHub
              blocks:
                - type: text
                  paragraphs:
                    - Create an empty repository on GitHub, then push the EdgePress source. In the Cloudflare dashboard, create a Worker and connect that repository with Workers Builds. Choose main as the production branch. Set a unique Worker name in wrangler.jsonc before deployment.
                    - For this repository, set Workers Builds root directory to /, build command to npm run build, and deploy command to npx wrangler deploy. No build variables are required. The build command generates dist/ before Wrangler publishes the Worker; dist/ stays out of Git.
                    - The Deploy to Cloudflare button in the GitHub README creates a new GitHub repository copy and a new Worker. During setup, choose unused names for both. If a repository or Worker named edgepress already exists, choose a different name. To update an existing Worker, use its existing repository and Workers Builds connection; the button does not attach to or update an existing project.
                    - If the log remains at Initializing build environment before cloning the repository or running commands, verify that the Cloudflare Workers and Pages GitHub App still has access to this repository. Reconnect the repository or reinstall and reauthorize the app, then retry. Check that the selected Cloudflare API token is still valid; Workers Builds can create a token automatically, and stale tokens must be replaced in Build settings. This stage runs before the project build command.
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
                    - label: Connect or reauthorize the GitHub integration
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
                    - label: Configure Workers Builds commands
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
                    - label: Troubleshoot Workers Builds
                      url: https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/
                    - label: Deploy button behavior and setup
                      url: https://developers.cloudflare.com/workers/platform/deploy-buttons/
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
                  text: All deployments serve static output. Register optional external APIs and widgets under plugins.consent.services in config.yml; each backend manages its own private credentials and security.
                  tone: warning
  - columns: 1
    cells:
      - - type: text
          heading: Publication dates and time zones
          text: Set site.timeZone in config.yml (default Asia/Taipei). New posts include a complete timestamp with an explicit offset. Timestamps without an offset are interpreted in that configured zone, independently of the build host. Date-only articles stay calendar dates; complete timestamps are shown in the reader’s current zone. Ambiguous daylight-saving times require an explicit offset.
        - type: code
          title: config.yml
          language: yaml
          code: |
            site:
              timeZone: Asia/Taipei
---
