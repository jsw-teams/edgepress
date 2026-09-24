# EdgePress accessibility and agent-friendliness audit

Overall status: **warning**

| Audit | Status | Score | Checks | Errors | Warnings |
| --- | --- | ---: | ---: | ---: | ---: |
| Accessibility | pass | 100% | 861 | 0 | 0 |
| Agent friendliness | pass | 100% | 694 | 0 | 0 |
| Markdown rendering | pass | 100% | 42 | 0 | 0 |
| Report reading structure | pass | 100% | 11 | 0 | 0 |

Generated documents: 46 | Posts: 8 | Pages: 12 | System routes: 26 | Errors: 0 | Warnings: 2
HTML bytes: 292410 | Stylesheet references: 46 | Potentially render-blocking stylesheets: 46 | Script references: 140 | Blocking scripts: 0

Accessible PDF evidence: [page-check.pdf](page-check.pdf) | HTML report: [page-check-visual.html](page-check-visual.html) | Screenshots: [EdgePress September 2026 update · desktop (1440/1425 px)](page-check-screenshots/page-1a69f3c70e.png) · [EdgePress September 2026 update · mobile (390/390 px)](page-check-screenshots/page-a0675bae17.png) · [EdgePress September 2026 update: request 2 · desktop (1440/1425 px)](page-check-screenshots/page-28e8a21a17.png) · [EdgePress September 2026 update: request 2 · mobile (390/390 px)](page-check-screenshots/page-51425ff648.png) · [EdgePress September 2026 update: request 3 · desktop (1440/1425 px)](page-check-screenshots/page-7566a23d4b.png) · [EdgePress September 2026 update: request 3 · mobile (390/390 px)](page-check-screenshots/page-e8a21bcd68.png) · [EdgePress and Markdown: a complete writing guide · desktop (1440/1425 px)](page-check-screenshots/page-72dd2c8ef0.png) · [EdgePress and Markdown: a complete writing guide · mobile (390/390 px)](page-check-screenshots/page-0fe8fc61c4.png) · [Build a fast website from clear, editable source files. · desktop (1440/1425 px)](page-check-screenshots/page-ee1c3d6e11.png) · [Build a fast website from clear, editable source files. · mobile (390/390 px)](page-check-screenshots/page-89b8917b56.png) · [Plugin development · mobile (390/390 px)](page-check-screenshots/page-ffdeb6b3c5.png) · [Privacy policy · desktop (1440/1425 px)](page-check-screenshots/page-0d1f478833.png) · [Privacy policy · mobile (390/390 px)](page-check-screenshots/page-c895171d97.png) · [Project introduction · mobile (390/390 px)](page-check-screenshots/page-7bb6eb8bf9.png) · [Quick start · mobile (390/390 px)](page-check-screenshots/page-10a7740137.png) · [Theme development · mobile (390/390 px)](page-check-screenshots/page-b567f4d70b.png) · [EdgePress 2026 年 9 月更新 · desktop (1440/1425 px)](page-check-screenshots/page-af6970487b.png) · [EdgePress 2026 年 9 月更新 · mobile (390/390 px)](page-check-screenshots/page-b99b22b763.png) · [EdgePress 2026 年 9 月更新：第 2 次需求 · desktop (1440/1440 px)](page-check-screenshots/page-5c8a9c41e4.png) · [EdgePress 2026 年 9 月更新：第 2 次需求 · mobile (390/390 px)](page-check-screenshots/page-48034736da.png) · [EdgePress 2026 年 9 月更新：第 3 次需求 · desktop (1440/1425 px)](page-check-screenshots/page-66d3fbb19b.png) · [EdgePress 2026 年 9 月更新：第 3 次需求 · mobile (390/390 px)](page-check-screenshots/page-8d538da2c8.png) · [EdgePress 与 Markdown：完整写作指南 · desktop (1440/1425 px)](page-check-screenshots/page-dd77a99fb7.png) · [EdgePress 与 Markdown：完整写作指南 · mobile (390/390 px)](page-check-screenshots/page-494e50836d.png) · [用清晰、可编辑的源文件构建快速网站。 · desktop (1440/1425 px)](page-check-screenshots/page-71c57c89f6.png) · [用清晰、可编辑的源文件构建快速网站。 · mobile (390/390 px)](page-check-screenshots/page-476de61daa.png) · [插件开发 · mobile (390/390 px)](page-check-screenshots/page-4d890181ff.png) · [隐私政策 · desktop (1440/1425 px)](page-check-screenshots/page-5031c5be65.png) · [隐私政策 · mobile (390/390 px)](page-check-screenshots/page-0b33a6ba50.png) · [项目介绍 · mobile (390/390 px)](page-check-screenshots/page-063b595d95.png) · [快速入门 · mobile (390/390 px)](page-check-screenshots/page-449eb122ac.png) · [主题开发 · mobile (390/390 px)](page-check-screenshots/page-eaac5e04b2.png)

## Findings

- **WARNING · publication-readiness** config.yml — Replace the example site URL with the published site URL.
- **WARNING · publication-readiness** config.yml — Add the real site operator name and privacy contact before publishing the privacy policy.

## Markdown rendering

Verified 42 of 42 syntax combinations in the generated tutorial post.

### 2026/09/markdown-syntax-guide/index.html

- [x] headings 2 through 6
- [x] Setext heading syntax
- [x] paragraphs and hard line breaks
- [x] hyphen, asterisk, and underscore thematic breaks
- [x] emphasis and strong emphasis
- [x] strikethrough
- [x] inline and fenced code
- [x] tilde-fenced and four-space-indented code
- [x] code spans containing a literal backtick
- [x] escaped Markdown punctuation and character references
- [x] inline and reference links
- [x] GFM automatic links
- [x] angle-bracket, www, and email automatic links
- [x] images with alternative text
- [x] nested lists with inline formatting
- [x] task lists with accessible status names
- [x] lists nested inside block quotes
- [x] nested block quotes
- [x] tables and inline table syntax
- [x] safe semantic inline HTML
- [x] sanitization of active script markup

### zh-CN/2026/09/markdown-syntax-guide/index.html

- [x] headings 2 through 6
- [x] Setext heading syntax
- [x] paragraphs and hard line breaks
- [x] hyphen, asterisk, and underscore thematic breaks
- [x] emphasis and strong emphasis
- [x] strikethrough
- [x] inline and fenced code
- [x] tilde-fenced and four-space-indented code
- [x] code spans containing a literal backtick
- [x] escaped Markdown punctuation and character references
- [x] inline and reference links
- [x] GFM automatic links
- [x] angle-bracket, www, and email automatic links
- [x] images with alternative text
- [x] nested lists with inline formatting
- [x] task lists with accessible status names
- [x] lists nested inside block quotes
- [x] nested block quotes
- [x] tables and inline table syntax
- [x] safe semantic inline HTML
- [x] sanitization of active script markup

## Documents reviewed

| Type | Count |
| --- | ---: |
| Posts | 8 |
| Customizable pages and homepages | 12 |
| System routes | 26 |

## Scope

- Accessibility checks inspect generated HTML and CSS. They do not measure color contrast, screen-reader behavior, keyboard interactions in a browser, or dynamic vendor widgets.
- Agent-friendliness checks inspect metadata, structured data, internal links, robots.txt, sitemap.xml, and llms.txt. They do not guarantee crawler indexing or answer quality.
- This automated report is not a legal-compliance assessment or a substitute for manual review.
- Screenshots capture generated local pages at desktop and mobile viewports. They do not replace manual keyboard, zoom, contrast, or assistive-technology review.

This report is written outside the public output directory.