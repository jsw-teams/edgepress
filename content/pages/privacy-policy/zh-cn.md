---
title: 隐私政策
lang: zh-CN
slug: privacy-policy
description: 本 EdgePress 网站当前的数据处理方式、同意管理、已配置集成和发布前信息。
blocks:
  - columns: 1
    cells:
      -
        - type: section
          title: 网站运营者
          tone: soft
          blocks:
            - type: privacy-controller
              nameLabel: 个人信息处理者
              contactLabel: 隐私联系
              missingTitle: 发布前需要补充信息
              missingText: config.yml 尚未填写真实运营者名称和有效的隐私联系方式。正式发布前请补充这两项信息。
  - columns: 2
    cells:
      -
        - type: section
          title: 此起始站点当前的功能
          blocks:
            - type: text
              paragraphs:
                - 此源项目生成公开页面、文章、搜索数据、站点地图和 Atom 订阅。它不包含访客账户系统、评论功能或联系表单。
                - Worker 提供可选的 /api/v1/ 后端代理。只有部署者配置 Service Binding，或同时设置 BACKEND_URL 和 BACKEND_TOKEN 密钥后，代理才会转发请求。此起始站点不会将页面内容提交到该接口。
                - 托管和内容分发服务商可能为运行网站而处理连接和请求数据。运营者应在发布前确认实际服务商，说明适用条款和数据保留期限。
      -
        - type: section
          title: 可选浏览器服务
          blocks:
            - type: text
              text: 下方列表会在每次构建时根据 config.yml 中 plugins.consent 下已启用的浏览器服务重新生成，显示服务名称、供应商类别、用途、数据类别、接收方和配置的保留期限。
            - type: privacy-services
              emptyText: 此源项目当前没有配置可选的第三方浏览器服务。
  - columns: 1
    cells:
      -
        - type: section
          title: 同意偏好
          tone: accent
          blocks:
            - type: text
              paragraphs:
                - 可选浏览器集成只有在访客主动接受后才会加载。首次访问时没有预先选中的服务；接受和拒绝选项处于同一层级，访客也可以展开服务详情并保存逐项选择。
                - 同意界面会在第一方浏览器存储中保存访客选择的服务 ID，并遵循下方配置的有效期限。该偏好记录只保存在访客设备上，不是服务器端审计日志。
                - 访客可以重新打开“隐私设置”更改或撤回选择。撤回之前已启用的服务后，页面会重新载入，以停止该集成继续运行。
            - type: privacy-consent
              storageLabel: 浏览器存储键
              expiryLabel: 偏好过期时间
              proposedDateLabel: 隐私告知拟定日期
              effectiveDateLabel: 隐私告知生效日期
              expiryText: "保存后 {days} 天"
  - columns: 1
    cells:
      -
        - type: section
          title: 供应商与法律信息
          blocks:
            - type: text
              paragraphs:
                - 启用供应商前，运营者应记录供应商接收的信息、处理目的、接收方、适用保留期限和跨境传输情况。浏览器配置中只能填写公开站点标识；CAPTCHA 密钥必须保存在可信服务器中，并由服务器验证每个响应令牌。
                - 此起始配置无法确定实际部署的运营者所在地、法律依据、数据保留义务或适用的个人权利。请根据实际网站完成政策，必要时咨询合格的专业人员。
                - 请核对上方每个供应商当前的隐私说明和适用条款，确认其实际收集的数据、接收方、保留期限和传输方式与本政策一致。发布前以及配置变更后都应重新检查。
            - type: link-list
              title: 主要法律资料
              items:
                - label: EUR-Lex GDPR 正文
                  url: https://eur-lex.europa.eu/eli/reg/2016/679
                - label: 英国 ICO 隐私告知指引
                  url: https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment/what-information-you-must-supply-under-the-gdpr/
                - label: 中国个人信息保护法
                  url: https://www.miit.gov.cn/jgsj/zfs/fl/art/2022/art_515a4b20c12f430eab54bb4f56d89f56.html
---
