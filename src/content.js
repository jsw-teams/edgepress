/**
 * 受控并发执行池 & 轻量内容解析工具（零依赖）
 * - mapPool: 限制同时打开的文件描述符数量，防止 EMFILE 与内存峰值抖动
 * - parseFrontmatter: 零依赖解析 YAML Frontmatter (title, date, tags, category, summary, draft, layout)
 * - renderMarkdown: 零依赖高性能 Markdown -> HTML 渲染器（带自动 TOC 目录提取与安全转义）
 */

export async function mapPool(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(concurrency || 8, items.length || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseFrontmatter(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    return { data: {}, body: text };
  }
  const endIdx = text.indexOf("\n---\n", 4);
  if (endIdx === -1) {
    return { data: {}, body: text };
  }

  const yamlBlock = text.slice(4, endIdx);
  const body = text.slice(endIdx + 5);
  const data = {};
  let currentListKey = null;

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentListKey) {
      data[currentListKey].push(stripQuotes(trimmed.slice(2).trim()));
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const rawVal = trimmed.slice(colon + 1).trim();

    if (rawVal === "") {
      data[key] = [];
      currentListKey = key;
    } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      currentListKey = null;
      data[key] = rawVal
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
    } else if (rawVal === "true" || rawVal === "false") {
      currentListKey = null;
      data[key] = rawVal === "true";
    } else {
      currentListKey = null;
      data[key] = stripQuotes(rawVal);
    }
  }

  return { data, body };
}

function stripQuotes(s) {
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "section";
}

function renderInline(text) {
  // 1. 提取行内代码防二次解析
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    const id = codes.push(`<code>${code}</code>`) - 1;
    return `\u0000CODE${id}\u0000`;
  });

  // 2. 图片 ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const safeSrc = /^(?:https?:|\/|\.)/i.test(src) ? src : "#";
    return `<img src="${safeSrc}" alt="${alt}" loading="lazy" decoding="async">`;
  });

  // 3. 链接 [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safeHref = /^(?:https?:|\/|#|mailto:|\.)/i.test(href) ? href : "#";
    const isExt = /^https?:\/\//i.test(safeHref);
    return `<a href="${safeHref}"${isExt ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });

  // 4. 粗体 / 斜体 / 删除线
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // 5. 还原行内代码
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, id) => codes[Number(id)]);
  return out;
}

export function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const toc = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 代码块 ```lang
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}"` : "";
      html.push(
        `<div class="ep-code-block"><div class="ep-code-bar"><span class="ep-code-lang">${escapeHtml(lang || "text")}</span><button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-copy-code>复制</button></div><pre><code${langAttr}>${escapeHtml(buf.join("\n"))}</code></pre></div>`
      );
      continue;
    }

    // 标题 #..####
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const id = slugifyHeading(rawTitle);
      if (level >= 2 && level <= 3) {
        toc.push({ level, id, text: rawTitle.replace(/[*`]/g, "") });
      }
      html.push(`<h${level} id="${id}">${renderInline(rawTitle)}</h${level}>`);
      i++;
      continue;
    }

    // 引用 >
    if (line.trim().startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        buf.push(lines[i].trim().slice(2));
        i++;
      }
      html.push(`<blockquote><p>${renderInline(buf.join(" "))}</p></blockquote>`);
      continue;
    }

    // Markdown 表格
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      const parseRow = (row) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const headers = parseRow(line);
      i += 2; // skip header & separator
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      html.push(`<div class="ep-table-wrap"><table class="ep-table">${thead}${tbody}</table></div>`);
      continue;
    }

    // 无序列表 - / *
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // 有序列表 1.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // 普通段落
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("> ") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return { html: html.join("\n"), toc };
}

export function minifyCss(css) {
  return String(css || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}
