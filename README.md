# EdgePress v2 — 零依赖极速静态建站与高自由度主题框架

EdgePress v2 是面向个人博客、技术文档站与轻量官网重构的**零依赖、毫秒级增量构建、超低内存占用**静态建站框架。

默认主题严格基于 `b-end-design-system-skill` 设计哲学（向 Linear 与 Apple Notes 的极致简洁看齐）从零重塑，并提供**三层高自由度主题二次开发体系（Theme SDK v2）**，让小白 10 秒换肤，让开发者自由扩展任意布局、插槽与钩子。

## 重构优化对比（原版 vs 重构版 v2）

| 指标 | 原版 EdgePress | 重构版 EdgePress v2 | 优化效果 |
| --- | --- | --- | --- |
| 仓库总体积 | **38 MB**（含 13MB PDF + 11MB 图/视频 + 10MB 228 个字体） | **< 120 KB 纯源码** | 体积缩减 **99.6%+** |
| 运行时依赖 | 0 依赖（50+ 源码文件，10,444 行） | **0 依赖（5 个核心模块，精简清晰）** | 零 `npm install`，极易维护 |
| 构建耗时 | 秒级 | **< 50 ms 毫秒级增量构建** | SHA-256 增量哈希缓存 |
| 静态生产服务器 | 每次请求同步读盘，无压缩无缓存 | **有界 LRU 内存 + Gzip 预压缩 + ETag 304** | 高并发零磁盘 I/O |
| 默认主题设计 | 传统基础样式（带卡片阴影） | **工业级 B-End Design System 规范** | 0.5px 微边框 / 同心圆角 / 6 态按钮 / 抽屉检索 |
| 主题二次开发 | 仅基础 `{{> partial}}` | **Token 换肤 + `extends` 继承 + Slots + Hooks** | 极高自由度，一行命令生成脚手架 |

## 3 分钟快速上手

要求：Node.js 18.18+（无需 `npm install`）。

```bash
# 1. 检查环境
npm run doctor

# 2. 构建并启动本地预览（http://127.0.0.1:8787）
npm run dev

# 3. 新建一篇 Markdown 文章
npm run new -- "我的第一篇极速博客"

# 4. 生成生产静态文件到 dist/
npm run build
```

## 常用命令速查

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 增量构建并启动本地预览服务器 |
| `npm run build` | 生成生产级静态文件、RSS、Sitemap 与离线搜索索引到 `dist/` |
| `npm run serve` | 启动高并发有界 LRU + Gzip 生产静态服务器 |
| `npm run new -- "标题"` | 在 `content/posts/` 创建一篇新文章 |
| `npm run new -- page "标题"` | 在 `content/pages/` 创建一个新独立页面 |
| `npm run theme -- list` | 查看已安装主题 |
| `npm run theme -- create my-theme` | 一键生成继承自 `default` 的子主题脚手架（加 `--blank` 为空白主题） |
| `npm run bench` | 实测全量冷构建 / 增量热构建耗时与内存占用 |
| `npm test` | 运行全套自动化测试 |

## 默认主题设计系统亮点 (`themes/default`)

严格贯彻 `b-end-design-system-skill` 核心红线：
- **页面默认纯平 + 0.5px 微边框**：常规卡片零阴影，使用 `1px solid rgba(226, 232, 240, 0.7)` 切分层级；阴影仅留给离屏侧边抽屉与弹窗。
- **光学同心圆角与 4px 对称栅格**：严格遵守 $R_{outer} = R_{inner} + Padding$，全站间距均为 4px 倍数。
- **原子 6 态按钮 & 唯一主操作**：完整支持 Default / Hover / Active / Disabled / Loading / Focus-visible（严禁 `outline: none`）；每处操作区最多 1 个 Primary 按钮。
- **模态 ≠ 阻断**：站内搜索采用侧边抽屉（Drawer，支持 `⌘K` / `Ctrl+K` 快捷键与五态反馈），保留阅读背景上下文。
- **极致排版细节**：数字/日期强制 `tabular-nums` 防抖动，标题开启 `text-wrap: balance`，行高 ≥ 1.5 防多语言音标削顶。

## 教学与开发者文档

- [小白从 0 到 1 建站与部署教学文档](docs/TUTORIAL.md)
- [高自由度主题二次开发完全指南 (Theme SDK v2)](docs/THEME_DEV.md)

## 许可证

MIT
