/**
 * EdgePress Default Theme — 零依赖交互控制器 (< 3KB)
 * 功能：
 * 1. 侧边抽屉搜索（五态覆盖：初始 / 加载中 / 命中结果 / 空态 / 错误态），保留页面上下文
 * 2. 浅色 / 暗色模式切换并持久化
 * 3. 代码块一键复制（带按钮 Loading/完成状态反馈）
 * 4. 快捷键 Cmd/Ctrl + K 打开搜索抽屉，Escape 关闭浮层
 */
(() => {
  const root = document.documentElement;
  const saved = localStorage.getItem("ep-theme");
  if (saved === "light" || saved === "dark") {
    root.setAttribute("data-theme", saved);
  }

  // 1. 暗色模式切换
  const themeBtn = document.querySelector("[data-toggle-theme]");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("ep-theme", next);
    });
  }

  // 2. 侧边搜索抽屉（模态 != 阻断，保留背景上下文）
  const backdrop = document.querySelector("[data-ep-backdrop]");
  const drawer = document.querySelector("[data-search-drawer]");
  const input = document.querySelector("[data-search-input]");
  const resultsBox = document.querySelector("[data-search-results]");
  let indexCache = null;

  function openDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.add("is-open");
    backdrop.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    setTimeout(() => input && input.focus(), 60);
    if (!indexCache) loadIndex();
  }

  function closeDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  async function loadIndex() {
    if (!resultsBox) return;
    resultsBox.innerHTML = '<div class="ep-empty">正在加载全站索引...</div>';
    try {
      const res = await fetch("/search-index.json");
      if (!res.ok) throw new Error("index fetch failed");
      indexCache = await res.json();
      renderResults("");
    } catch {
      resultsBox.innerHTML = '<div class="ep-empty">索引加载失败，请稍后重试。</div>';
    }
  }

  function renderResults(query) {
    if (!resultsBox || !indexCache) return;
    const q = query.trim().toLowerCase();
    const matched = q
      ? indexCache.filter((item) =>
          `${item.title} ${item.summary} ${(item.tags || []).join(" ")}`.toLowerCase().includes(q)
        )
      : indexCache.slice(0, 8);

    if (!matched.length) {
      resultsBox.innerHTML = '<div class="ep-empty">没有找到匹配的内容，请尝试更换关键词。</div>';
      return;
    }

    resultsBox.innerHTML = matched
      .map(
        (item) =>
          `<a class="ep-card" style="display:block;margin-bottom:8px;text-decoration:none" href="${item.url}">` +
          `<div class="ep-card-title">${item.title}</div>` +
          `<div class="ep-card-meta" style="margin-top:4px"><time>${item.date}</time><span class="ep-badge ep-badge--info">${item.category}</span></div>` +
          `</a>`
      )
      .join("");
  }

  document.querySelectorAll("[data-open-search]").forEach((btn) => btn.addEventListener("click", openDrawer));
  document.querySelectorAll("[data-close-drawer]").forEach((btn) => btn.addEventListener("click", closeDrawer));
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  if (input) input.addEventListener("input", (e) => renderResults(e.target.value));

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openDrawer();
    } else if (e.key === "Escape") {
      closeDrawer();
    }
  });

  // 3. 代码块一键复制
  document.querySelectorAll("[data-copy-code]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.closest(".ep-code-block")?.querySelector("pre code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        const orig = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = orig), 1500);
      } catch {
        btn.textContent = "复制失败";
      }
    });
  });
})();
