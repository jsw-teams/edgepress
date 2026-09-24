# My EdgePress site

Static site source built with EdgePress. Use Node.js 22.12 or newer.

## Start locally

    npm install
    edgepress server

Edit localized pages in `content/pages/` and Markdown posts in `content/posts/`. Choose a shared layout with `edgepress theme list` and `edgepress theme use <name>`.

## Deploy to Cloudflare Workers

Push this source repository to GitHub, then connect the repository to Cloudflare Workers Builds. The `build` and `deploy` scripts in `package.json` generate the static files and deploy the Worker. Set a unique Worker name in `wrangler.jsonc` first.

For a local deployment, run `npx wrangler login`, then `edgepress deploy`.

## Use another static web server

Run `edgepress generate` and upload the contents of `dist/` to the server document root. OpenResty and Nginx can serve the generated directories as static files. Worker API routes and service bindings need a Worker or an equivalent server-side route.
