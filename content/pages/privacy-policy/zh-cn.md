---
title: 隐私政策
lang: zh-CN
slug: privacy-policy
description: 说明本网站如何处理请求数据、同意偏好、可选统计服务、个人权利和供应商信息。
blocks:
  - columns: 1
    cells:
      -
        - type: section
          title: 个人信息处理者与联系
          tone: soft
          blocks:
            - type: privacy-controller
              nameLabel: 处理者
              contactLabel: 隐私联系
              missingTitle: 发布前需要补充信息
              missingText: 正式发布前，请在 config.yml 中填写负责个人或组织的真实名称和有效隐私联系方式。
            - type: text
              text: 请确认上方名称能识别负责的个人或法律实体。若运营者情形适用，还应在本政策中补充邮寄地址、欧盟代表或数据保护官的联系方式。
  - columns: 2
    cells:
      -
        - type: section
          title: 网站请求与处理依据
          blocks:
            - type: text
              paragraphs:
                - 本网站发布页面和文章，并提供在访客浏览器中运行的站内搜索。本构建版本没有访客账户、评论或联系表单。
                - 为传送和保护网站，托管及网络服务商会收到请求数据，例如 IP 地址、请求路径、请求时间以及浏览器或设备请求头。在 GDPR 适用时，运营者以提供安全、可靠网站服务的合法利益为依据（第 6 条第 1 款 (f) 项）；运营者应记录利益衡量，并在部署账户中确认实际日志内容与保留期限。
                - 下方列出的可选浏览器服务只有在访客主动选择后才加载。若相关处理涉及个人数据且以同意为法律依据，则依据第 6 条第 1 款 (a) 项处理。拒绝可选服务不会阻止访问网站基本页面。
      -
        - type: section
          title: 可选浏览器服务
          blocks:
            - type: text
              text: 此列表根据 config.yml 中启用的服务生成，列明处理目的、数据类别、接收方、保留期限及供应商自己的隐私说明。
            - type: privacy-services
              emptyText: 当前没有配置可选的第三方浏览器服务。
  - columns: 1
    cells:
      -
        - type: section
          title: Cloudflare 网站分析
          blocks:
            - type: text
              paragraphs:
                - 访客接受后，Cloudflare 信标会报告页面浏览和浏览器性能指标。Cloudflare 公布的报告维度包括页面路径、来源页、设备、浏览器、操作系统和国家或地区。Cloudflare 表示，信标会在正常 HTTP 请求中接收来源 IP，在最近的数据中心丢弃该 IP，且不会将其保存到核心数据库或日志中；Cloudflare 也表示该信标不会使用浏览器存储。
                - Cloudflare 表示未采样信标数据保留 7 天，之后汇总为约 10% 的长期数据；仪表板可查看最近 6 个月的数据。信标可能在访客所在国家或地区以外处理。发布前，运营者应核实实际 Cloudflare 账户、套餐和适用的数据处理条款。
  - columns: 2
    cells:
      -
        - type: section
          title: 同意、保留期限与跨境传输
          tone: accent
          blocks:
            - type: text
              paragraphs:
                - 同意选择保存在访客设备的第一方 localStorage 中，并遵循所配置的期限。本网站不会将该选择发送给运营者作为回执或服务器端审计记录。访客可重新打开“隐私设置”修改或撤回选择；撤回后，页面重新载入以停止已启用的集成。若运营者依赖同意处理个人数据，必须确保能够按照 GDPR 第 7 条证明已取得同意。
                - 托管和安全日志的保留期取决于部署服务商账户，本源配置没有设置该期限。Cloudflare 数据处理附录说明了受限传输的保障机制，包括标准合同条款；运营者应核实本部署适用的协议和保障措施。
            - type: privacy-consent
              storageLabel: 浏览器存储键
              expiryLabel: 偏好有效期
              proposedDateLabel: 告知拟定日期
              effectiveDateLabel: 告知生效日期
              expiryText: 保存后 {days} 天
      -
        - type: section
          title: 你的权利
          blocks:
            - type: text
              paragraphs:
                - GDPR 适用时，你可以请求访问、更正、删除或限制处理，也可以在适用条件下反对处理。满足法律条件时，你可以请求数据可携；你也可以随时撤回同意，撤回不影响撤回前基于同意进行的合法处理。
                - 如需行使权利或提出问题，请使用上方的处理者联系方式。你也可以向有管辖权的数据保护监管机构投诉，包括你居住或工作的欧盟国家，或你认为发生违规的国家。
                - 本网站当前未配置会产生法律影响或类似重大影响的纯自动化决策。如果此情况改变，或网站新增账户、表单等数据用途，运营者应更新本告知。
  - columns: 1
    cells:
      -
        - type: section
          title: 法律与供应商资料
          blocks:
            - type: link-list
              title: 官方资料
              items:
                - label: 欧盟《通用数据保护条例》（EUR-Lex）
                  url: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
                - label: Cloudflare RUM 信标隐私说明
                  url: https://developers.cloudflare.com/speed/observatory/rum-beacon/
                - label: Cloudflare 网站分析保留期限与常见问题
                  url: https://developers.cloudflare.com/web-analytics/faq/
                - label: Cloudflare 数据处理附录
                  url: https://www.cloudflare.com/cloudflare-customer-dpa/
---
