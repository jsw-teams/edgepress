/**
 * EdgePress 高自由度主题引擎 (Theme SDK v2)
 *
 * 支持三层自由度：
 * 1. Token 级零代码换肤：site.config.js -> theme.tokens 自动生成 :root CSS 变量覆盖
 * 2. 子主题继承 ("extends": "default")：只覆盖你想改的 partial/layout/asset，其余自动回退父主题
 * 3. 完全自定义能力：
 *    - 模板语法：{{var}} (转义), {{{raw}}} (原样 HTML), {{> partial}}, {{slot:name}},
 *      {{#if expr}}...{{else}}...{{/if}}, {{#each list}}...{{/each}}
 *    - 生命周期 Hooks (theme.hooks.js)：beforeBuild / transformHtml / provideSlots / afterBuild
 */
import { readFile, stat, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { escapeHtml } from "./content.js";

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function getByPath(ctx, path) {
  if (path === ".") return ctx;
  const parts = String(path).trim().split(".");
  let cur = ctx;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/**
 * 轻量高性能模板渲染器（支持循环、条件、插槽、转义/原始输出）
 */
export function renderTemplate(template, context, slots = {}) {
  let out = String(template);

  // 1. 替换命名插槽 {{slot:name}}
  out = out.replace(/\{\{\s*slot:([A-Za-z0-9_-]+)\s*\}\}/g, (_, name) => {
    return slots[name] ?? "";
  });

  // 2. 处理 {{#each list}}...{{/each}}
  out = out.replace(/\{\{#each\s+([A-Za-z0-9_.-]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, expr, body) => {
    const list = getByPath(context, expr);
    if (!Array.isArray(list) || !list.length) return "";
    return list
      .map((item, index) => {
        const childCtx =
          item && typeof item === "object"
            ? { ...context, ...item, this: item, "@index": index }
            : { ...context, this: item, "@index": index };
        return renderTemplate(body, childCtx, slots);
      })
      .join("");
  });

  // 3. 处理 {{#if expr}}...{{else}}...{{/if}}
  out = out.replace(
    /\{\{#if\s+([A-Za-z0-9_.-]+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, expr, truthy, falsy = "") => {
      const val = getByPath(context, expr);
      const isTruthy = Array.isArray(val) ? val.length > 0 : Boolean(val);
      return renderTemplate(isTruthy ? truthy : falsy, context, slots);
    }
  );

  // 4. 原始 HTML {{{expr}}}
  out = out.replace(/\{\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}\}/g, (_, expr) => {
    const val = getByPath(context, expr);
    return val == null ? "" : String(val);
  });

  // 5. 安全转义 {{expr}}
  out = out.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, expr) => {
    const val = getByPath(context, expr);
    return val == null ? "" : escapeHtml(val);
  });

  return out;
}

/**
 * 加载主题链（支持 extends 子主题继承 + hooks + token 合并）
 */
export async function loadTheme(themesRoot, themeName, userTokenOverrides = {}) {
  const chain = [];
  const visited = new Set();
  let currentName = themeName || "default";

  while (currentName) {
    if (visited.has(currentName)) {
      throw new Error(`Circular theme inheritance detected: ${currentName}`);
    }
    visited.add(currentName);
    const dir = resolve(themesRoot, currentName);
    const manifestPath = join(dir, "theme.json");
    if (!(await exists(manifestPath))) {
      throw new Error(`Theme "${currentName}" missing theme.json at ${manifestPath}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    let hooks = {};
    const hooksPath = join(dir, "theme.hooks.js");
    if (await exists(hooksPath)) {
      const mod = await import(pathToFileURL(hooksPath).href);
      hooks = mod.default || mod;
    }
    chain.push({ name: currentName, dir, manifest, hooks });
    currentName = manifest.extends || null;
  }

  // 合并 CSS Tokens：父主题默认 < 子主题 tokens < site.config.js 用户覆盖
  const mergedTokens = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    Object.assign(mergedTokens, chain[i].manifest.tokens || {});
  }
  Object.assign(mergedTokens, userTokenOverrides || {});

  const partialCache = new Map();
  const layoutCache = new Map();

  async function resolveThemeFile(relPath) {
    for (const layer of chain) {
      const full = join(layer.dir, relPath);
      if (await exists(full)) return full;
    }
    return null;
  }

  async function expandPartials(source, depth = 0) {
    if (depth > 8) throw new Error("Theme partial nesting exceeded max depth (8)");
    const matches = [...source.matchAll(/\{\{>\s*([A-Za-z0-9_/-]+)\s*\}\}/g)];
    if (!matches.length) return source;
    let out = source;
    for (const m of matches) {
      const name = m[1];
      let content = partialCache.get(name);
      if (content === undefined) {
        const file = await resolveThemeFile(join("layouts", "partials", `${name}.html`));
        if (!file) throw new Error(`Theme partial not found: ${name}`);
        content = await readFile(file, "utf8");
        partialCache.set(name, content);
      }
      out = out.replace(m[0], await expandPartials(content, depth + 1));
    }
    return out;
  }

  async function getLayout(layoutName = "base") {
    if (layoutCache.has(layoutName)) return layoutCache.get(layoutName);
    const file =
      (await resolveThemeFile(join("layouts", `${layoutName}.html`))) ||
      (await resolveThemeFile(join("layouts", "base.html")));
    if (!file) throw new Error(`Theme layout not found: ${layoutName}`);
    const raw = await readFile(file, "utf8");
    const expanded = await expandPartials(raw);
    layoutCache.set(layoutName, expanded);
    return expanded;
  }

  // 收集主题链中的全部静态资源（子主题同名文件覆盖父主题）
  async function collectThemeAssets() {
    const assetMap = new Map();
    for (let i = chain.length - 1; i >= 0; i--) {
      const assetsDir = join(chain[i].dir, "assets");
      if (!(await exists(assetsDir))) continue;
      const entries = await readdir(assetsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          assetMap.set(entry.name, join(assetsDir, entry.name));
        }
      }
    }
    return assetMap;
  }

  // 生成零代码 Token 覆盖样式片段
  const tokenEntries = Object.entries(mergedTokens);
  const tokenStyleTag = tokenEntries.length
    ? `<style id="ep-theme-tokens">:root{${tokenEntries.map(([k, v]) => `${k}:${v}`).join(";")}}</style>`
    : "";

  // 聚合所有层级的 hooks（子主题优先）
  const activeHooks = chain.map((c) => c.hooks).filter(Boolean);

  return {
    name: chain[0].name,
    chain: chain.map((c) => c.name),
    manifest: chain[0].manifest,
    tokenStyleTag,
    getLayout,
    collectThemeAssets,
    async render(layoutName, context) {
      const tpl = await getLayout(layoutName);
      const slots = {};
      for (let i = activeHooks.length - 1; i >= 0; i--) {
        if (typeof activeHooks[i].provideSlots === "function") {
          Object.assign(slots, (await activeHooks[i].provideSlots(context)) || {});
        }
      }
      let html = renderTemplate(tpl, { ...context, themeTokensStyle: tokenStyleTag }, slots);
      for (let i = activeHooks.length - 1; i >= 0; i--) {
        if (typeof activeHooks[i].transformHtml === "function") {
          html = await activeHooks[i].transformHtml(html, context);
        }
      }
      return html;
    }
  };
}
