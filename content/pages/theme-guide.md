---
title: "主题二次开发指南"
date: "2026-11-28"
category: "文档"
tags: [主题开发, ThemeSDK]
summary: "三层自由度：10 秒 Token 换肤、子主题局部继承、完整自定义布局与生命周期 Hooks。"
---

## Level 1：零代码 Token 换肤（10 秒完成）

直接打开根目录 `site.config.js`，修改 `theme.tokens` 即可覆盖全局主色、圆角或内容宽度：

```js
theme: {
  name: "default",
  tokens: {
    "--ep-accent": "#0f766e",
    "--ep-radius-inner": "8px"
  }
}
```

## Level 2：子主题局部继承 (`extends`)

运行 `npm run theme -- create my-theme`，会自动生成继承自 `default` 的子主题目录。你只需要新建想修改的局部模板（例如 `layouts/partials/header.html`），其余所有布局和样式自动继承父主题。

## Level 3：命名插槽与 Hooks

通过 `theme.hooks.js` 中的 `provideSlots(context)` 和 `transformHtml(html, context)`，你可以向 `beforeHeader`、`afterHero`、`sidebar`、`afterPost`、`beforeFooter` 任意插槽注入自定义组件，或进行任意 HTML 后处理。
