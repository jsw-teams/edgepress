import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import baseConfig from "../site.config.js";
import { buildSite } from "../src/build.js";
import { startStaticServer } from "../src/server.js";
import { parseFrontmatter, renderMarkdown } from "../src/content.js";

const root = resolve(process.cwd());

test("Markdown parser extracts frontmatter, headings TOC, tables, and code blocks", () => {
  const { data, body } = parseFrontmatter(`---\ntitle: "Test"\ntags: [a, b]\n---\n\n## Intro\n\nHello **world**`);
  assert.equal(data.title, "Test");
  assert.deepEqual(data.tags, ["a", "b"]);
  const { html, toc } = renderMarkdown(body);
  assert.equal(toc.length, 1);
  assert.equal(toc[0].text, "Intro");
  assert.ok(html.includes("<strong>world</strong>"));
});

test("Default theme builds complete static site with B-End Design System tokens", async () => {
  const outDir = resolve(root, ".test-dist-default");
  try {
    const res = await buildSite({ ...baseConfig, build: { ...baseConfig.build, outputDir: outDir } }, root);
    assert.ok(res.postsCount >= 1);
    assert.ok(res.pagesCount >= 1);
    const homeHtml = await readFile(resolve(outDir, "index.html"), "utf8");
    assert.ok(homeHtml.includes("/assets/tokens.css"));
    assert.ok(homeHtml.includes("/assets/theme.css"));
    assert.ok(homeHtml.includes("data-search-drawer"));
    const searchIdx = JSON.parse(await readFile(resolve(outDir, "search-index.json"), "utf8"));
    assert.ok(searchIdx.length >= 2);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("Child theme inheritance (extends: default) + Token override + Slot hooks work seamlessly", async () => {
  const outDir = resolve(root, ".test-dist-child");
  try {
    const res = await buildSite(
      {
        ...baseConfig,
        theme: { name: "starter-custom", tokens: { "--ep-content-width": "1120px" } },
        build: { ...baseConfig.build, outputDir: outDir }
      },
      root
    );
    assert.deepEqual(res.themeChain, ["starter-custom", "default"]);
    const homeHtml = await readFile(resolve(outDir, "index.html"), "utf8");
    assert.ok(homeHtml.includes("ep-custom-banner"), "Expected afterHero slot from theme.hooks.js");
    assert.ok(homeHtml.includes("--ep-content-width:1120px"), "Expected Level 1 token override");
    assert.ok(homeHtml.includes("/assets/custom.css"), "Expected child theme custom.css");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("High-concurrency static server serves Gzip, ETag 304, and concurrent requests cleanly", async () => {
  const outDir = resolve(root, ".test-dist-srv");
  await buildSite({ ...baseConfig, build: { ...baseConfig.build, outputDir: outDir } }, root);
  const srv = await startStaticServer(outDir, { host: "127.0.0.1", port: 0 });
  try {
    const res1 = await fetch(`http://127.0.0.1:${srv.port}/`, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res1.status, 200);
    const etag = res1.headers.get("etag");
    assert.ok(etag);

    const res304 = await fetch(`http://127.0.0.1:${srv.port}/`, { headers: { "if-none-match": etag } });
    assert.equal(res304.status, 304);

    const batch = await Promise.all(Array.from({ length: 20 }, () => fetch(`http://127.0.0.1:${srv.port}/search-index.json`)));
    for (const r of batch) assert.equal(r.status, 200);
  } finally {
    await srv.close();
    await rm(outDir, { recursive: true, force: true });
  }
});
