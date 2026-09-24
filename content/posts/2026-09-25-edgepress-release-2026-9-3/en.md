---
title: "EdgePress September 2026 update: request 3"
date: 2026-09-25
lang: en
slug: edgepress-release-2026-9-3
tags:
  - release
  - npm
  - themes
---

This is the third requested EdgePress update for September 2026.

## Install EdgePress from npm

EdgePress is published as the `edgepress` package. Start a site by installing the package, initializing an empty folder, installing the generated site dependencies, then opening the local preview:

```sh
npm install edgepress
edgepress init
npm install
edgepress server
```

The initializer keeps an existing `package.json` name and scripts, then adds the EdgePress commands and runtime dependencies.

## Install or create themes

Install a theme package with `edgepress theme install <npm-package>[@version]`. EdgePress copies the theme into `themes/` and skips package install scripts. Switch among installed themes with `edgepress theme list` and `edgepress theme use <name>`.

Run `edgepress theme create my-theme` to generate a blank npm-ready custom theme package. It includes a shared HTML shell, editable head, header, navigation and footer partials, a required accessible structure, and an empty stylesheet for the theme's colors and responsive design.

## Deploy from GitHub or upload static files

The quick-start guide explains how to push the source to GitHub and connect it to Cloudflare Workers Builds. The package's build and deploy scripts let Cloudflare generate the static files and publish the Worker on pushes to the production branch. Local deployment uses `edgepress deploy`.

The GitHub README includes Cloudflare's one-click Worker deployment button for this public repository.

`edgepress build` and `edgepress generate` share one generator. Upload the contents of `dist/` to an OpenResty or Nginx document root to serve the static pages. Worker API routes and service bindings still need a Worker or an equivalent server-side route.
