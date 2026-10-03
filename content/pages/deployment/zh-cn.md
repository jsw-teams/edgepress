---
title: 静态部署与可选服务
lang: zh-CN
slug: deployment
description: 将同一份静态产物部署到 Cloudflare、Vercel、腾讯 EdgeOne Pages 或阿里云 ESA Pages，外部服务由 consent 注册并按需调用。
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: 部署指南
          title: 同一份静态网站，部署到四个平台。
          text: npm run build 生成 dist/。页面、搜索及本地 JavaScript 动态交互不依赖网站后端。
        - type: text
          heading: 平台入口
          paragraphs:
            - Cloudflare 使用 wrangler.jsonc 的纯静态资源托管；Vercel 使用 vercel.json；腾讯 EdgeOne Pages 使用 edgeone.json；阿里云 ESA Pages 使用 esa.jsonc。构建命令均为 npm run build，输出目录均为 dist。
            - Vercel 和 EdgeOne 支持仓库部署按钮。ESA 使用仓库导入或官方 CLI；配置平台账号后执行一条部署命令。也可配置仓库 Secrets 后运行手动部署工作流。
        - type: code
          title: 选择部署平台
          language: sh
          code: |
            npm run deploy:cloudflare
            npm run deploy:vercel
            npm run deploy:edgeone -- -n my-site
            npm run deploy:esa -- --name my-site
        - type: text
          heading: 按访客需求调用外部服务
          paragraphs:
            - 在 config.yml 的 plugins.consent.services 注册服务。external-api 使用 backendUrl；external-widget 使用 backendUrl 和同服务来源的 moduleUrl，模块导出 mount 函数。
            - 每项服务填写唯一 ID、名称、用途、数据类别、接收者、保留期限与 HTTPS 隐私链接。多语言说明须覆盖全部已启用语言。先填写真实地址和隐私责任人，再启用服务组。
            - 访客明确选择前不加载外部模块或调用 API。接口在访客操作时调用，单纯给予 consent 不会主动请求 API。地址变更使已保存的 consent 失效。Secret 只放在独立后端的平台设置中。
        - type: code
          title: 从主题源码调用已注册 API
          language: js
          code: |
            import {callService} from '/edgepress/services.js';
            const response = await callService('lookup', 'query', {headers: {'X-Service-Context': 'example'}});
        - type: text
          heading: 评论由独立项目负责
          text: CommentNest 全权负责评论前端、翻译、样式、登录、附件、存储及 API。网站只提供通用服务插槽和已发布内容上下文。
        - type: link-list
          title: 独立服务接入
          items:
            - label: CommentNest 部署与接入
              url: https://github.com/jsw-teams/CommentNest/blob/main/docs/edgepress.md
        - type: text
          heading: 控制缓存成本
          paragraphs:
            - CSS、JS 与本地模块依赖使用内容哈希命名，Cloudflare、Vercel 和 EdgeOne 缓存一年。HTML 及未带哈希的元数据重新验证，构建更新会发布新的资源地址。
            - ESA 继续使用同一份哈希资源，并在控制台配置 CSS、JS 的浏览器及边缘缓存一年，HTML 和未版本化 JSON 短缓存。esa.jsonc 配置构建和静态目录，官方未文档化与 Vercel headers 对应的配置字段。
---
