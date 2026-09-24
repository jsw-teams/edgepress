---
title: 插件开发
lang: zh-CN
slug: plugin-development
description: 使用可信构建插件、遵循同意设置的浏览器集成和私有后端转发扩展 EdgePress。
blocks:
  - columns: 1
    cells:
      -
        - type: hero
          eyebrow: 扩展指南
          title: 连接可信构建代码、浏览器供应商和后端服务。
          text: 构建插件在 Node 中运行。浏览器集成需等待访客同意。运行时后端请求由 Worker 转发。
  - columns: 2
    cells:
      -
        - type: section
          title: 构建插件
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - plugins/ 中的本地 JavaScript 模块可以转换源文档、注册钩子或渲染器，并生成路由。它们拥有构建进程的权限，因此只应加载项目负责人审查过的代码。
                - 起始同意插件会在共享页面布局后添加隐私面板。构建插件属于可信代码，不会作为浏览器脚本发布。
            - type: code
              title: 注册路由生成器
              language: js
              code: |
                export default function projectMeta(api) {
                  api.registerGenerator('project-meta', ({ site }) => ({
                    path: 'project-meta.json',
                    body: JSON.stringify({
                      title: site.config.site.title,
                      posts: site.posts.length
                    }),
                    contentType: 'application/json; charset=utf-8'
                  }));
                }
      -
        - type: section
          title: 跟踪、统计、广告和人机验证
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - 在 config.yml 的 plugins.tracking、plugins.statistics、plugins.advertising 或 plugins.captcha 下添加浏览器供应商。每项需要唯一 ID、用途、保留期限说明和公开供应商标识。
                - 可用供应商包括 Google Tag Manager 和 Meta Pixel；Cloudflare Web Analytics、Google Analytics 和百度统计；Google AdSense；以及 Cloudflare Turnstile、Google reCAPTCHA 和 hCaptcha。
                - 只有访客接受对应集成后才会导入供应商代码。不要把 CAPTCHA 密钥放入 config.yml 或客户端代码。服务器必须在接受表单前将每个 CAPTCHA 响应提交给供应商验证 API。
            - type: notice
              title: 运营者信息
              text: 配置浏览器供应商前，请填写 privacy.controller.name、privacy.controller.contact 和 privacy.policyUrl。控制者名称或联系方式为空时，构建器会拒绝启用供应商服务。
              tone: warning
  - columns: 1
    cells:
      -
        - type: section
          title: 通过 URL 和令牌转发后端请求
          blocks:
            - type: text
              paragraphs:
                - Worker 为 GET、POST、PUT、PATCH 和 DELETE 提供 /api/v1/* 接口。配置 BACKEND_URL 和 BACKEND_TOKEN 后，Worker 会将请求路径及查询参数附加到后端 URL，发送 Bearer 令牌，转发有限的请求头，并为响应设置 no-store。
                - BACKEND_URL 必须使用 HTTPS。只有 localhost 开发环境允许普通 HTTP。请求正文最大为 1 MB。后端仍需验证受限令牌、校验用户输入、授权每项操作，并执行自己的请求频率和大小限制。
                - 私有 Worker 间调用优先使用 Cloudflare BACKEND Service Binding。浏览器绝不能获得 BACKEND_TOKEN。此通用代理本身不会创建应用账户、表单或数据模型。
            - type: steps
              items:
                - title: 设置后端基础 URL
                  text: 在 wrangler.jsonc 中添加 vars.BACKEND_URL。基础 URL 应使用 HTTPS，且不能包含凭据或令牌。
                - title: 保存密钥
                  text: Wrangler 会提示输入密钥值。请使用权限范围有限的后端令牌，并依照运营者流程定期轮换。
                  command: edgepress secret put BACKEND_TOKEN
                - title: 配置并部署
                  text: 确认后端接受转发路径和 Bearer 令牌，再部署 Worker。
                  command: edgepress deploy
            - type: code
              title: 本地开发
              language: sh
              code: |
                # .dev.vars 仅供本地使用，不要提交到版本库
                BACKEND_URL=http://127.0.0.1:8788
                BACKEND_TOKEN=replace-with-a-local-token
            - type: text
              text: 未配置后端绑定，或 URL 和令牌时，Worker 会返回 503。它会拒绝不支持的方法和过大的请求正文。
            - type: link-list
              title: 供应商验证参考
              items:
                - label: Cloudflare Turnstile Siteverify
                  url: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
                - label: EDPB 同意指南
                  url: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf
  - columns: 1
    cells:
      -
        - type: section
          title: 内容安全与维护
          blocks:
            - type: text
              paragraphs:
                - 内置 Markdown 渲染器会清理文章输出。自定义渲染器、插件、主题和 static/ 中的文件都属于可信项目代码；构建或部署前应审查变更。不要将密钥放在文章、主题或公开资源中。
                - edgepress iterate 会在 .edgepress/reports/ 下生成只读维护计划，不会修改源文件、更新依赖或部署。edgepress security 检查依赖安全公告。部署前请审查锁文件和页面报告，并保留可用于回滚的已知稳定部署。
            - type: code
              title: 审查项目变更
              language: sh
              code: |
                edgepress security
                edgepress iterate
                edgepress check
                edgepress server
---
