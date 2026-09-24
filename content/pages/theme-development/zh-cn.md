---
title: 主题开发
lang: zh-CN
slug: theme-development
description: 使用共享 HTML 局部模板、CSS 配色、页面元素布局和可复用错误页构建 EdgePress 主题。
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: 主题指南
          title: 让主题负责共享布局和视觉设计。
          text: 页面定义行栏数、元素类型和内容。主题负责网站外壳、字体、间距、颜色和响应式行为。
  - columns: 2
    cells:
      -
        - type: section
          title: 主题结构
          tone: soft
          blocks:
            - type: code
              title: 主题文件
              language: text
              code: |
                themes/your-theme/
                  theme.json
                  package.json
                  README.md
                  layouts/
                    layout.html
                    partials/
                      head.html
                      header.html
                      footer.html
                  assets/
                    style.css
            - type: text
              paragraphs:
                - 共享布局会渲染所有页面和文章。head、header 和 footer 局部模板提供常见网站组件。在 config.yml 中配置页面标题后缀与分隔符、站点标题、全站导航、语言链接、页脚内容和组件显示状态。
                - 使用双花括号占位符输出经过转义的值。唯一允许的原样占位符是生成的页面内容、JSON-LD 和 EdgePress 生成的导航标记。保留跳转链接、唯一 main 主区域、带标签的导航、可见焦点和一个页面级 h1。
                - 将 body 保持为全高纵向布局，并让 main 延伸，这样短页面的页脚也会留在视口底部。
      -
        - type: section
          title: 选择主题配色
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - 颜色、字体选择和组件样式保存在当前主题的样式表中。不要在 config.yml 中填写颜色。切换主题不会改变页面内容。
                - 使用 edgepress theme list 查看可用主题。使用 edgepress theme use default、edgepress theme use atelier 或 edgepress theme use signal 进行切换。
                - 使用 edgepress theme install <npm-package>[@version] 安装 npm 上发布的主题包。包内必须包含 theme.json 和 layouts/layout.html。EdgePress 会将主题复制到 themes/，且不会运行 npm 安装脚本。
                - 使用 edgepress theme create my-theme 创建可发布到 npm 的主题包骨架，其中包含 npm package.json、空白样式表、无障碍布局以及 head、header、导航和 footer 文件。编辑后使用 edgepress theme use my-theme 切换；也可以进入该目录运行 npm publish --access public 发布。
            - type: notice
              title: 共享错误页
              text: EdgePress 使用所选主题布局生成本地化的 403 和 404 页面。静态资源被拒绝访问时，Worker 会返回对应的 403 页面。
              tone: info
  - columns: 1
    cells:
      -
        - type: section
          title: 页面行与可编辑元素
          blocks:
            - type: text
              paragraphs:
                - 每个页面和语言版本都是一个 Markdown 文件，但 front matter 之后必须保持空白。页面编辑数据放在 YAML blocks 中。
                - 数据从外向内排列：先设每行的 columns 栏数，再为每栏设置一个 cells 项，然后在栏内选择元素类型，最后编辑该元素字段。验证器会拒绝栏数不匹配或空白的栏。
                - 页面不使用文章 Markdown 渲染器。文章仍使用 Markdown 撰写，并由内置安全渲染器输出。
            - type: data-table
              title: 可用元素类别
              headers:
                - 元素
                - 主要用途
              rows:
                - - hero、section、text、heading
                  - 页面结构和文字内容
                - - display-text
                  - 编辑式、衬线、描边、等宽或强调字样
                - - media-text
                  - 图片或带字幕视频配合可编辑文字
                - - link-list、list、steps、code、data-table、notice
                  - 导航、说明、代码、信息和提示
                - - feature-grid、quote、cta、faq、latest-posts
                  - 可复用页面组合
                - - privacy-services、privacy-controller、privacy-consent、captcha、ad-slot
                  - 使用配置数据的站点集成
            - type: notice
              title: 视频字幕
              text: media-text 视频元素需要 WebVTT 字幕源、语言标签和字幕轨道名称。视频使用浏览器原生控件并设置 preload none。第三方视频嵌入应放在明确同意后才启用的集成中。
              tone: warning
  - columns: 1
    cells:
      -
        - type: section
          title: 开发与预览
          blocks:
            - type: steps
              items:
                - title: 选择主题
                  text: 安装或创建主题后，使用 EdgePress theme 命令修改 edgepress.config.mjs 中的 paths.theme。
                  command: edgepress theme use your-theme
                - title: 编辑布局和 CSS
                  text: 修改所选主题的布局、局部模板和样式表。构建时会为每个 CSS 和 JavaScript 资源生成内容指纹。
                - title: 预览网站
                  text: server 会监视源文件、重新构建输出、刷新浏览器，并更新无障碍化和 agent 友好度报告。
                  command: edgepress server
---
