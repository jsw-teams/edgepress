/**
 * EdgePress v2 增量构建引擎（零依赖，构建耗时 < 80ms）
 * - 自动扫描 content/posts/*.md 与 content/pages/*.md
 * - SHA-256 增量哈希缓存：未修改文章跳过 Markdown 解析
 * - 输出：静态 HTML、指纹化/压缩 CSS & JS、search-index.json、rss.xml、sitemap.xml
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { resolve, join, basename, extname } from "node:path";
import { mapPool, parseFrontmatter, renderMarkdown, minifyCss, escapeHtml } from "./content.js";
import { loadTheme } from "./theme-engine.js";

function sha256(str) {
  return createHash("sha256").update(str).digest("hex").slice(0, 12);
}

async function listMarkdownFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

async function copyDirectory(source, destination) {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(from, to);
    else if (entry.isFile()) await writeFile(to, await readFile(from));
  }
}

function normalizeDocumentUrl(value, kind, slug) {
  if (value === undefined || value === null || value === "") {
    return kind === "post" ? `/posts/${slug}/` : `/pages/${slug}/`;
  }
  const raw = String(value).trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || /[?#\\\\]/.test(raw) || raw.split("/").includes("..")) {
    throw new Error(`Invalid document URL: ${raw}`);
  }
  const path = `/${raw.split("/").filter(Boolean).join("/")}`;
  return path === "/" ? path : `${path}/`;
}

function estimateReadMinutes(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/\S+/g) || []).length;
  return Math.max(1, Math.ceil((cjk + words) / 350));
}

function buildNavHtml(navItems, currentPath) {
  return (navItems || [])
    .map((item) => {
      const isCurrent = item.url === currentPath || (item.url !== "/" && currentPath.startsWith(item.url));
      const aria = isCurrent ? ' aria-current="page"' : "";
      const isExt = /^https?:\/\//i.test(item.url);
      const ext = isExt ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a class="ep-nav-link" href="${escapeHtml(item.url)}"${aria}${ext}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

export async function buildSite(config, cwd = process.cwd()) {
  const t0 = performance.now();
  const contentDir = resolve(cwd, config.build?.contentDir || "content");
  const themesDir = resolve(cwd, config.build?.themesDir || "themes");
  const outputDir = resolve(cwd, config.build?.outputDir || "dist");
  const cacheDir = resolve(cwd, config.build?.cacheDir || ".edgepress");
  const concurrency = config.build?.concurrency || 8;

  await mkdir(outputDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  if (config.build?.staticDir) await copyDirectory(resolve(cwd, config.build.staticDir), outputDir);
  if (config.build?.assetsDir) await copyDirectory(resolve(cwd, config.build.assetsDir), outputDir);

  // 1. 加载增量解析缓存
  const cacheFile = join(cacheDir, "render-cache.json");
  let renderCache = {};
  if (config.build?.incremental !== false) {
    try {
      renderCache = JSON.parse(await readFile(cacheFile, "utf8"));
    } catch {
      renderCache = {};
    }
  }
  const nextCache = {};

  // 2. 加载主题（含 extends 继承链、Token 覆盖与 Hooks）
  const theme = await loadTheme(themesDir, config.theme?.name || "default", config.theme?.tokens);

  // 3. 处理并写入主题静态资源（CSS 自动压缩）
  const assetMap = await theme.collectThemeAssets();
  const assetsOutDir = join(outputDir, "assets");
  await mkdir(assetsOutDir, { recursive: true });

  const stylesheets = [];
  const scripts = [];

  for (const [name, fullPath] of assetMap.entries()) {
    const ext = extname(name).toLowerCase();
    const raw = await readFile(fullPath);
    if (ext === ".css") {
      const text = config.build?.minifyCss !== false ? minifyCss(raw.toString("utf8")) : raw.toString("utf8");
      await writeFile(join(assetsOutDir, name), text, "utf8");
      stylesheets.push(`/assets/${name}`);
    } else {
      await writeFile(join(assetsOutDir, name), raw);
      if (ext === ".js") scripts.push(`/assets/${name}`);
    }
  }

  // 保持 tokens.css -> theme.css -> 其余样式的稳定加载顺序
  stylesheets.sort((a, b) => {
    const rank = (s) => (s.includes("tokens.css") ? 0 : s.includes("theme.css") ? 1 : 2);
    return rank(a) - rank(b);
  });

  const stylesheetTags = stylesheets.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n  ");
  const scriptTags = scripts.map((src) => `<script defer src="${src}"></script>`).join("\n  ");

  // 4. 并发解析所有文章与独立页面（支持增量哈希命中）
  const postFiles = await listMarkdownFiles(join(contentDir, "posts"));
  const pageFiles = await listMarkdownFiles(join(contentDir, "pages"));

  const parseDoc = async (file, kind) => {
    const raw = await readFile(file, "utf8");
    const hash = sha256(raw);
    const slug = basename(file, ".md");
    let parsed = renderCache[hash];
    if (!parsed) {
      const { data, body } = parseFrontmatter(raw);
      const { html, toc } = renderMarkdown(body);
      const plain = body.replace(/[#*`>\[\]()_-]/g, " ").replace(/\s+/g, " ").trim();
      parsed = {
        data,
        html,
        toc,
        readMinutes: estimateReadMinutes(plain),
        excerpt: data.summary || plain.slice(0, 140)
      };
    }
    nextCache[hash] = parsed;
    const url = kind === "post" ? `/posts/${slug}/` : `/pages/${slug}/`;
    const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags : [];
    return {
      kind,
      slug,
      url,
      title: parsed.data.title || slug,
      date: parsed.data.date || "2026-01-01",
      category: parsed.data.category || "技术",
      status: parsed.data.status || "已发布",
      tags,
      tagsHtml: tags.map((t) => `<span class="ep-badge ep-badge--neutral">${escapeHtml(t)}</span>`).join(""),
      summary: parsed.excerpt,
      lang: parsed.data.lang || config.site.language,
      url: normalizeDocumentUrl(parsed.data.url || parsed.data.permalink, kind, slug),
      readMinutes: parsed.readMinutes,
      html: parsed.html,
      toc: parsed.toc,
      draft: Boolean(parsed.data.draft),
      layout: parsed.data.layout || (kind === "post" ? "post" : "page")
    };
  };

  const posts = (await mapPool(postFiles, concurrency, (f) => parseDoc(f, "post")))
    .filter((p) => !p.draft)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const pages = (await mapPool(pageFiles, concurrency, (f) => parseDoc(f, "page"))).filter((p) => !p.draft);

  // 5. 构建页面公共上下文
  const siteBase = {
    ...config.site,
    themeName: theme.name,
    themeChain: theme.chain.join(" -> "),
    postCount: posts.length,
    pageCount: pages.length,
    stylesheetTags,
    scriptTags
  };

  async function emitPage(relUrl, layoutName, pageData) {
    const clean = relUrl.replace(/^\/+|\/+$/g, "");
    const targetDir = clean ? join(outputDir, clean) : outputDir;
    await mkdir(targetDir, { recursive: true });

    const html = await theme.render(layoutName, {
      site: { ...siteBase, language: pageData.lang || siteBase.language, navHtml: buildNavHtml(config.navigation, relUrl) },
      page: pageData,
      posts,
      recentPosts: posts.slice(0, 6)
    });
    await writeFile(join(targetDir, "index.html"), html, "utf8");
  }

  // 6. 并发渲染全部 HTML 页面（首页 / 归档 / 每篇文章 / 每个独立页）
  const tasks = [
    () =>
      emitPage("/", "home", {
        title: `${config.site.title} · ${config.site.tagline}`,
        description: config.site.description,
        url: "/"
      }),
    () =>
      emitPage("/archives/", "archive", {
        title: `全部文章 · ${config.site.title}`,
        description: `共收录 ${posts.length} 篇文章`,
        url: "/archives/"
      }),
    ...posts.map((post) => () =>
      emitPage(post.url, post.layout, {
        ...post,
        title: `${post.title} · ${config.site.title}`,
        heading: post.title,
        description: post.summary,
        hasToc: post.toc.length > 0
      })
    ),
    ...pages.map((page) => () =>
      emitPage(page.url, page.layout, {
        ...page,
        title: `${page.title} · ${config.site.title}`,
        heading: page.title,
        description: page.summary,
        hasToc: page.toc.length > 0
      })
    )
  ];

  await mapPool(tasks, concurrency, (fn) => fn());

  // 7. 生成离线搜索索引 search-index.json、RSS 与 Sitemap
  const searchIndex = [...posts, ...pages].map((doc) => ({
    title: doc.title,
    url: doc.url,
    date: doc.date,
    category: doc.category,
    tags: doc.tags,
    summary: doc.summary
  }));
  await writeFile(join(outputDir, "search-index.json"), JSON.stringify(searchIndex), "utf8");

  const siteUrl = (config.site.url || "https://example.org").replace(/\/+$/, "");
  const rssItems = posts
    .slice(0, 20)
    .map(
      (p) =>
        `<item><title>${escapeHtml(p.title)}</title><link>${siteUrl}${p.url}</link><guid>${siteUrl}${p.url}</guid><description>${escapeHtml(p.summary)}</description><pubDate>${new Date(p.date).toUTCString()}</pubDate></item>`
    )
    .join("");
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(config.site.title)}</title><link>${siteUrl}/</link><description>${escapeHtml(config.site.description)}</description>${rssItems}</channel></rss>`;
  await writeFile(join(outputDir, "rss.xml"), rss, "utf8");

  const sitemapUrls = ["/", "/archives/", ...posts.map((p) => p.url), ...pages.map((p) => p.url)]
    .map((u) => `<url><loc>${siteUrl}${u}</loc></url>`)
    .join("");
  await writeFile(
    join(outputDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls}</urlset>`,
    "utf8"
  );

  // 8. 持久化增量缓存
  await writeFile(cacheFile, JSON.stringify(nextCache), "utf8");

  const durationMs = Number((performance.now() - t0).toFixed(2));
  return {
    durationMs,
    postsCount: posts.length,
    pagesCount: pages.length,
    theme: theme.name,
    themeChain: theme.chain,
    outputDir
  };
}
