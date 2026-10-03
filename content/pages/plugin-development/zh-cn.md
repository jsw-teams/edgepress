---
title: 插件开发
lang: zh-CN
slug: plugin-development
description: 使用可信构建插件和经过 consent 注册的外部服务扩展静态网站。
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: 扩展指南
          title: 连接可信构建代码、浏览器供应商和后端服务。
          text: 构建插件在 Node 中运行，浏览器服务只在访客选择后加载，后端独立部署。
  - columns: 2
    cells:
      - - type: section
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
      - - type: section
          title: 跟踪、统计、广告和人机验证
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - 在 config.yml 的 plugins.consent.services 下添加浏览器供应商。每项需要唯一
                  ID、provider、purpose、dataCategories、recipient、retention、指向供应商当前隐私说明的 privacyUrl，以及公开站点标识。privacyUrl 必须是
                  HTTPS 地址。多语言字段需使用语言映射，覆盖已启用的每种语言，例如 en 与 zh-CN。
                - 可用供应商包括 Google Tag Manager 和 Meta Pixel；Cloudflare Web Analytics、Google Analytics 和百度统计；Google
                  AdSense；以及 Cloudflare Turnstile、Google reCAPTCHA 和 hCaptcha。
                - plugins.consent.proposedDate 必须设置为 YYYY-MM-DD 格式的告知拟定日期。告知生效后再设置
                  effectiveDate；尚未生效时可以省略。修改任一日期都会使旧的同意记录失效，并重新询问访客。
                - 只有访客接受对应集成后才会导入供应商代码。首层同时提供接受和拒绝，数据详情与逐项开关位于展开内容中。不要把 CAPTCHA 密钥放入 config.yml 或客户端代码。服务器必须在接受表单前将每个
                  CAPTCHA 响应提交给供应商验证 API。
            - type: notice
              title: 运营者信息
              text: 配置浏览器供应商前，请填写 privacy.controller.name、privacy.controller.contact 和 privacy.policyUrl。控制者名称或联系方式为空时，构建器会拒绝启用供应商服务。
              tone: warning
  - columns: 1
    cells:
      - - type: text
          heading: 可选外部服务
          paragraphs:
            - 在 config.yml 的 plugins.consent.services 注册 external-api 或 external-widget。服务使用独立 HTTPS 地址、完整隐私说明和访客明确选择。
            - 网站只提供静态前端。API 身份验证、授权、验证码校验、输入验证和速率限制由独立后端负责，运营者 Secret 不进入浏览器配置。
  - columns: 1
    cells:
      - - type: section
          title: 内容安全与维护
          blocks:
            - type: text
              paragraphs:
                - 内置 Markdown 渲染器会清理文章输出。自定义渲染器、插件、主题和 static/ 中的文件都属于可信项目代码；构建或部署前应审查变更。不要将密钥放在文章、主题或公开资源中。
                - edgepress iterate 会在 .edgepress/reports/ 下生成只读维护计划，不会修改源文件、更新依赖或部署。edgepress security
                  检查依赖安全公告。部署前请审查锁文件和页面报告，并保留可用于回滚的已知稳定部署。
            - type: code
              title: 审查项目变更
              language: sh
              code: |
                edgepress security
                edgepress iterate
                edgepress check
                edgepress server
  - columns: 1
    cells:
      - - type: text
          heading: 我提问
          text: 显示经过验证的 GitHub 身份和头像，可从本地图片、GIF 图集中选择表情包，支持删除自己的评论。读者选中评论后才加载讨论。
        - type: link-list
          title: 安装与接入
          items:
            - label: 安装及 EdgePress 接入说明
              url: https://github.com/jsw-teams/iask/blob/main/docs/edgepress.md
            - label: 我提问 独立更新日志
              url: https://github.com/jsw-teams/iask/blob/main/CHANGELOG.md
        - type: code
          title: 可选页面评论区块
          language: yaml
          code: |
            blocks:
              - columns: 1
                cells:
                  - - type: service
                      integration: github-comments
  - columns: 1
    cells:
      - - type: text
          heading: 嵌入分享图片与视频
          text: "在 plugins.consent.services 注册 provider: oembed 的 ishare 服务，填写实际 HTTPS
            backendUrl、用途与隐私披露。页面先显示本地占位，访客授权并点击加载媒体才请求服务。元数据使用固定 /api 和 HTTP 请求头传递，保留作者和来源署名的 iframe
            仅使用配置的服务域名。"
        - type: code
          title: 页面 oEmbed 区块
          language: yaml
          code: |
            blocks:
              - columns: 1
                cells:
                  - - type: oembed
                      integration: ishare
                      url: https://share.js.gripe/s/REPLACE_WITH_REAL_SHARE_ID
                      title: 分享媒体
        - type: link-list
          title: 服务说明
          items:
            - label: ishare
              url: https://github.com/jsw-teams/ishare/blob/main/docs/zh-cn.md
  - columns: 1
    cells:
      - - type: text
          heading: 通用社交媒体嵌入
          text: "默认预置 YouTube、X、Vimeo、TikTok、Reddit、Spotify、SoundCloud、Dailymotion、Flickr、Tumblr、Mastodon、Instagram、Facebook、哔哩哔哩。逐项设 enabled: false 会移除区块、授权条目和网络权限。标准提供方使用 oembedEndpoint，构建阶段缓存元数据；浏览器必须先授权并点击加载。sourceOrigins 指定分享链接域名，embedOrigins 指定播放器与资源域名，embedScripts 是按需加载的完整脚本地址。Instagram 和 Facebook 使用公开内容的官方 iframe，不要求把 Meta 令牌放入前端；私密、禁止嵌入或平台限制的内容仍可能无法显示。Mastodon 需将默认实例替换为实际实例。"
        - type: code
          title: oEmbed 与页面元素组合
          language: yaml
          code: |
            blocks:
              - columns: 2
                cells:
                  - - type: text
                      heading: 视频与说明
                      text: 在播放器旁介绍内容。
                  - - type: oembed
                      integration: youtube
                      url: https://www.youtube.com/watch?v=jNQXAC9IVRw
                      title: 分享视频
                      caption: 保留原链接供直接查看。
        - type: text
          heading: 自定义 oEmbed 与导航跳转
          text: "在 config.yml 新增 provider: oembed 服务，填写授权说明、backendUrl、oembedEndpoint 与分享链接和媒体域名。公开接口不得包含密钥；需凭据的平台使用外部网关。Pages 通过 integration 引用服务 ID。导航和页脚链接含下拉选项均支持 target: _self 或 target: _blank。"
---
