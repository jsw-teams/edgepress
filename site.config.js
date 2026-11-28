/**
 * EdgePress v2 极简主配置文件（小白一处搞定建站与换肤）
 */
export default {
  site: {
    title: "EdgePress",
    tagline: "极简、零依赖、高性能静态内容与文档框架",
    description: "零运行时依赖、秒级构建部署、内置工业级设计系统与高自由度主题开发体系的现代静态建站框架。",
    url: "https://example.org",
    language: "zh-CN",
    author: "EdgePress Team",
    footer: "© 2026 EdgePress · Built with Zero Dependencies"
  },

  // 导航菜单（自动高亮当前页，支持外部链接）
  navigation: [
    { label: "首页", url: "/" },
    { label: "文章", url: "/archives/" },
    { label: "主题开发", url: "/pages/theme-guide/" },
    { label: "关于", url: "/pages/about/" }
  ],

  // 主题配置（支持 Level 1 零代码 Token 换肤、Level 2 子主题继承、Level 3 完全自定义）
  theme: {
    name: "default", // 可切换为 "starter-custom" 或自己创建的主题名
    // Level 1 零代码换肤：取消注释任意 CSS Token 即可全局生效
    tokens: {
      // "--ep-accent": "#2563eb",
      // "--ep-accent-hover": "#1d4ed8",
      // "--ep-radius-inner": "8px",
      // "--ep-content-width": "1080px"
    }
  },

  // 构建与高并发性能参数
  build: {
    contentDir: "content",
    themesDir: "themes",
    outputDir: "dist",
    cacheDir: ".edgepress",
    concurrency: 8,         // 受控并发文件处理数（平衡 CPU 与 I/O）
    minifyCss: true,        // 构建时自动轻量压缩 CSS
    minifyHtml: false,      // 保留可读性或开启极致压缩
    incremental: true       // 增量 SHA-256 缓存，未变更文档零重复渲染
  },

  // 本地预览 / 生产静态服务器配置
  server: {
    host: "127.0.0.1",
    port: 8787,
    cacheMaxBytes: 16 * 1024 * 1024 // 16MB 有界 LRU 内存 + Gzip 预压缩缓存
  }
};
