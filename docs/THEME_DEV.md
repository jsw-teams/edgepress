# EdgePress v2 高自由度主题二次开发完全指南 (Theme SDK v2)

EdgePress v2 的主题引擎采用**三层自由度架构**，无论你是只想微调配色、局部改版，还是从零打造全新设计系统，都能以最低维护成本实现。

---

## 层级 1：零代码 Design Token 换肤（适合 80% 定制需求）

默认主题的所有颜色、间距、圆角、字号与布局宽度都定义在 `themes/default/assets/tokens.css` 的 CSS 变量中。

你无需改动任何主题源码，只需在 `site.config.js` 中覆写 `theme.tokens`：

```js
theme: {
  name: "default",
  tokens: {
    "--ep-accent": "#7c3aed",          // 主强调色（紫色）
    "--ep-accent-hover": "#6d28d9",    // 悬停主色
    "--ep-accent-soft": "#f5f3ff",     // 浅强调底色
    "--ep-radius-inner": "10px",       // 内圆角（外圆角会自动按同心圆角公式联动计算）
    "--ep-content-width": "1160px"     // 全局容器最大宽度
  }
}
```

---

## 层级 2：子主题继承 `extends`（推荐开发者使用）

子主题只需存放你**想覆盖或新增的文件**，其余所有布局、局部模板与样式会自动回退继承自父主题（如 `default`），后续升级父主题零冲突。

### 1. 一键生成子主题脚手架
```bash
npm run theme -- create my-brand
```
生成的目录结构：
```
themes/my-brand/
├── theme.json          # 声明 "extends": "default" 与自定义 tokens
├── theme.hooks.js      # 生命周期钩子与命名插槽注入
├── assets/
│   └── custom.css      # 在父主题样式之后自动加载
└── layouts/
    └── partials/       # 放入同名文件（如 header.html）即可精准替换父主题对应区块
```

### 2. 启用子主题
将 `site.config.js` 中的 `theme.name` 改为 `"my-brand"`，运行 `npm run dev` 即可看到效果（也可直接切换为内置示例主题 `"starter-custom"` 体验）。

---

## 层级 3：模板语法、命名插槽与生命周期 Hooks（100% 自由度）

如果你想从零构建一个完全独立的主题，运行：
```bash
npm run theme -- create my-custom --blank
```

### 1. 内置零依赖模板语法
- `{{page.title}}`：HTML 安全转义输出
- `{{{page.html}}}`：原始 HTML 输出
- `{{> header}}`：引入 `layouts/partials/header.html`（支持最多 8 层嵌套与父主题回退）
- `{{slot:afterPost}}`：命名插槽（由 `theme.hooks.js` 动态填充）
- `{{#if page.hasToc}} ... {{else}} ... {{/if}}`：条件渲染
- `{{#each posts}} ... {{/each}}`：列表循环渲染

### 2. 默认主题开放的 5 个标准命名插槽
| 插槽名 | 位置 | 典型用途 |
| --- | --- | --- |
| `beforeHeader` | 顶栏上方 | 全站公告条、活动通知 |
| `afterHero` | 首页标题区下方 | 特色推荐卡片、公告横幅 |
| `sidebar` | 文章/页面右侧栏顶部 | 作者卡片、广告位、快捷导航 |
| `afterPost` | 文章正文底部 | 评论系统（Giscus/Waline）、版权声明、打赏卡片 |
| `beforeFooter` | 页脚上方 | 邮件订阅 CTA、友链区 |

### 3. `theme.hooks.js` 完整示例
```js
export default {
  // 动态向页面插槽注入 HTML
  provideSlots(context) {
    return {
      afterPost: `<section class="ep-card">本文发布于 ${context.page.date || ""}</section>`
    };
  },

  // 最终 HTML 落盘前的任意后处理（如注入自定义统计脚本、SEO 标签等）
  transformHtml(html, context) {
    return html.replace("</body>", `<!-- rendered for ${context.page.url} --></body>`);
  }
};
```

---

## 主题设计自查建议（源自 `b-end-design-system-skill`）

二次开发主题时，建议保持以下高质感底线：
1. **边框克制**：用低透明度的微边框（如 `rgba(226, 232, 240, 0.7)`）替代粗黑实线。
2. **卡片纯平**：常规卡片不加阴影，将阴影留给抽屉和弹窗等真实浮层。
3. **按钮清晰**：同一操作区域只保留 1 个高饱和度主按钮，绝不禁用 `:focus-visible` 键盘轮廓。
4. **排版防抖**：所有日期、阅读时长、统计数字保留 `font-variant-numeric: tabular-nums`。
