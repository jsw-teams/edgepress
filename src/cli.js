#!/usr/bin/env node
/**
 * EdgePress v2 零依赖小白极简 CLI
 * 命令：dev | build | serve | new <post|page> <title> | theme <list|create> | clean | doctor | bench
 */
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSite } from "./build.js";
import { startStaticServer } from "./server.js";

const [, , cmd = "help", arg1, arg2, arg3] = process.argv;

async function loadConfig() {
  const cfgPath = resolve(process.cwd(), "site.config.js");
  const mod = await import(pathToFileURL(cfgPath).href);
  return mod.default || mod;
}

function toSlug(title) {
  return (
    String(title || "untitled")
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .slice(0, 48) || "untitled"
  );
}

async function cmdBuild() {
  const config = await loadConfig();
  const res = await buildSite(config);
  console.log(
    `构建完成 (${res.durationMs} ms) · 主题: ${res.theme} (${res.themeChain.join(" -> ")}) · 文章: ${res.postsCount} · 页面: ${res.pagesCount} -> ${res.outputDir}`
  );
  return { config, res };
}

async function cmdServe(rebuild) {
  const config = await loadConfig();
  if (rebuild) {
    const res = await buildSite(config);
    console.log(`初始构建完成 (${res.durationMs} ms)`);
  }
  const srv = await startStaticServer(resolve(process.cwd(), config.build?.outputDir || "dist"), {
    host: process.env.HOST || config.server?.host || "127.0.0.1",
    port: Number(process.env.PORT || config.server?.port || 8787),
    cacheMaxBytes: config.server?.cacheMaxBytes
  });
  console.log(`EdgePress 静态服务已启动 -> http://${srv.host}:${srv.port}/`);
  const stop = async () => {
    await srv.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function cmdNew() {
  const kind = arg1 === "page" ? "page" : "post";
  const title = arg1 === "page" || arg1 === "post" ? arg2 : arg1;
  if (!title) {
    console.log("用法: npm run new -- \"我的第一篇文章\"  或  npm run new -- page \"关于我\"");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const slug = kind === "post" ? `${today}-${toSlug(title)}` : toSlug(title);
  const dir = resolve(process.cwd(), "content", kind === "post" ? "posts" : "pages");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slug}.md`);
  const content = `---
title: "${title}"
date: "${today}"
category: "${kind === "post" ? "随笔" : "页面"}"
tags: [EdgePress]
summary: "在这里填写一句话摘要，将展示在首页列表与搜索结果中。"
---

## 开始写作

在这里用标准 Markdown 编写正文内容。
`;
  await writeFile(file, content, "utf8");
  console.log(`已创建 ${kind}: ${file}`);
}

async function cmdTheme() {
  const sub = arg1 || "list";
  const themesDir = resolve(process.cwd(), "themes");
  if (sub === "list") {
    const entries = await readdir(themesDir, { withFileTypes: true });
    console.log("已安装主题:");
    for (const e of entries) {
      if (e.isDirectory()) console.log(`  - ${e.name}`);
    }
    return;
  }
  if (sub === "create") {
    const name = arg2;
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      console.error("请提供小写字母/数字/短横线组成的主题名，例如: npm run theme -- create my-theme");
      process.exit(1);
    }
    const blank = arg3 === "--blank";
    const target = join(themesDir, name);
    await mkdir(join(target, "assets"), { recursive: true });
    await mkdir(join(target, "layouts", "partials"), { recursive: true });

    const manifest = blank
      ? { name, version: "1.0.0", description: "Custom blank theme" }
      : {
          name,
          version: "1.0.0",
          extends: "default",
          description: "Custom theme extending EdgePress default B-End Design System",
          tokens: {
            "--ep-accent": "#0f766e",
            "--ep-accent-hover": "#115e59",
            "--ep-accent-soft": "#f0fdfa"
          }
        };
    await writeFile(join(target, "theme.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await writeFile(
      join(target, "assets", "custom.css"),
      `/* ${name} 自定义扩展样式（在 default 主题之后加载） */\n`,
      "utf8"
    );
    await writeFile(
      join(target, "theme.hooks.js"),
      `export default {\n  provideSlots() {\n    return {\n      afterHero: ""\n    };\n  }\n};\n`,
      "utf8"
    );
    console.log(`已创建主题脚手架 themes/${name}/ (${blank ? "空白模式" : "继承 default 模式"})`);
    console.log(`在 site.config.js 中将 theme.name 改为 "${name}" 即可启用。`);
  }
}

async function cmdBench() {
  const config = await loadConfig();
  const cold = await buildSite({ ...config, build: { ...config.build, incremental: false } });
  const warm = await buildSite({ ...config, build: { ...config.build, incremental: true } });
  const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  console.log("=== EdgePress v2 零依赖构建性能自测 ===");
  console.log(`全量冷构建耗时: ${cold.durationMs} ms`);
  console.log(`增量热构建耗时: ${warm.durationMs} ms`);
  console.log(`进程总 RSS 内存: ${memMb} MB`);
}

switch (cmd) {
  case "build":
    await cmdBuild();
    break;
  case "dev":
    await cmdServe(true);
    break;
  case "serve":
    await cmdServe(false);
    break;
  case "new":
    await cmdNew();
    break;
  case "theme":
    await cmdTheme();
    break;
  case "clean":
    await rm(resolve(process.cwd(), "dist"), { recursive: true, force: true });
    await rm(resolve(process.cwd(), ".edgepress"), { recursive: true, force: true });
    console.log("已清理 dist/ 与 .edgepress/");
    break;
  case "doctor": {
    const cfg = await loadConfig();
    console.log(`Node.js: ${process.version} (OK) · 站点: ${cfg.site.title} · 当前主题: ${cfg.theme?.name || "default"}`);
    break;
  }
  case "bench":
    await cmdBench();
    break;
  default:
    console.log(`EdgePress v2 — 零依赖极速静态建站与高自由度主题框架

常用命令:
  npm run dev                          构建并启动本地预览 (http://127.0.0.1:8787)
  npm run build                        增量构建生产静态站点到 dist/
  npm run serve                        直接启动高并发 LRU+Gzip 生产静态服务器
  npm run new -- "文章标题"             新建 Markdown 文章
  npm run theme -- list                列出已安装主题
  npm run theme -- create my-theme     一键生成高自由度子主题脚手架
  npm run bench                        冷/热构建耗时与内存自测
  npm test                             运行自动化测试`);
}
