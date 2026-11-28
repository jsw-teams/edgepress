# EdgePress v2 小白从 0 到 1 建站与部署教学文档

本教程面向零前端基础的用户，带你 5 分钟拥有一个加载飞快、外观专业、完全免费的静态网站。

## 第一步：修改站点信息 (`site.config.js`)

打开根目录 `site.config.js`，把标题、简介和导航改成你自己的：

```js
export default {
  site: {
    title: "张三的数字花园",
    tagline: "记录技术、产品与生活思考",
    url: "https://blog.example.com",
    language: "zh-CN",
    author: "张三",
    footer: "© 2026 张三"
  },
  navigation: [
    { label: "首页", url: "/" },
    { label: "文章", url: "/archives/" },
    { label: "关于", url: "/pages/about/" }
  ],
  theme: {
    name: "default",
    tokens: {
      // 10 秒换主色：把下面这行注释去掉即可换成青绿色
      // "--ep-accent": "#0f766e"
    }
  }
};
```

## 第二步：写文章与建页面

### 1. 写一篇新文章
```bash
npm run new -- "如何用 EdgePress 搭建极速博客"
```
命令会在 `content/posts/` 自动生成带日期前缀的 `.md` 文件。用任意文本编辑器打开即可使用 Markdown 写作：
- `## 二级标题` 和 `### 三级标题` 会自动生成文章右侧的**浮动目录 (TOC)**。
- 代码块会自动带上语言标签和**一键复制按钮**。
- 构建时会自动把文章加入全站搜索索引（按 `Ctrl+K` 或 `⌘K` 即可瞬间搜索）。

### 2. 建一个独立页面（如「关于我」、「友链」）
```bash
npm run new -- page "友链"
```
生成的页面位于 `content/pages/友链.md`，访问路径为 `/pages/友链/`，将其加入 `site.config.js` 的 `navigation` 即可出现在顶栏。

## 第三步：免费部署到云平台

EdgePress v2 零依赖，无需云平台安装任何 npm 包，构建时间通常低于 1 秒：

| 平台 | 构建命令 | 输出目录 | 安装命令 |
| --- | --- | --- | --- |
| **Cloudflare Workers / Pages** | `npm run build` | `dist` | 留空或 `true`（自带 `wrangler.jsonc`） |
| **Vercel** | `npm run build` | `dist` | 自动读取 `vercel.json` 跳过安装 |
| **Netlify** | `npm run build` | `dist` | 自动读取 `netlify.toml` |
| **腾讯云 EdgeOne / 阿里云 ESA** | `npm run build` | `dist` | 留空 |
| **自有 VPS / Docker** | `docker build -t site .` | — | `docker run -d -p 8787:8787 site` |
