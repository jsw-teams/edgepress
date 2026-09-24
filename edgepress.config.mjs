export default {
  paths: {
    content: "content",
    static: "static",
    theme: "themes/default",
    output: "dist",
    cache: ".edgepress"
  },
  permalink: "/:year/:month/:slug/",
  pagination: { perPage: 10 },
  markdown: { gfm: true, breaks: false },
  i18n: {
    defaultLocale: "en",
    languagePacks: ["zh-CN"]
  },
  concurrency: 8,
  plugins: ["plugins/consent/index.js"]
};
