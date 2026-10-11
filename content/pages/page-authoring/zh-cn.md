---
title: 用括号看懂 Pages 的包含关系
lang: zh-CN
slug: page-authoring
description: 页面（行），行（单元格），单元格（元素）：带括号和注释的 YAML 实例，以及编辑和校验方法。
# 页面（行列表）；行（栏数，单元格列表）；单元格（按顺序排列的元素）
blocks: [ # 页面 / page（行 / rows）
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "hero",
          title: "用括号看懂 Pages 的包含关系",
          text: "先看包含关系，再填内容。方括号表示列表，花括号表示一个对象；这是标准 YAML，与缩进写法完全等价。"
        }
      ]
    ]
  },
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "code",
          title: "包含关系（结构说明，不是额外语法）",
          language: "text",
          code: "页面（行 1，行 2，…）\n  行（columns: 栏数，cells: 单元格列表）\n    单元格（元素 1，元素 2，…）\n      元素（type: 类型，该类型的内容字段）\n      section（title: 标题，blocks: 子元素列表）"
        }
      ]
    ]
  },
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "code",
          title: "可直接保存的完整页面",
          language: "yaml",
          code: "---\ntitle: My page\nlang: en\nslug: my-page\nblocks: [ # page (row 1, row 2, ...)\n  { columns: 2, cells: [ # row 1 (left cell, right cell)\n    [ # left cell (heading, text)\n      { type: heading, level: 2, text: \"About this project\" },\n      { type: text, text: \"A small tool for everyday writing.\" }\n    ],\n    [ # right cell (links)\n      { type: link-list, title: \"Read more\", items: [\n        { label: \"Project\", url: \"/project-introduction/\" }\n      ] }\n    ]\n  ] }\n]\n---"
        },
        {
          type: "text",
          paragraphs: ["把示例保存为 content/pages/my-page/en.md；语言文件名须小写，lang 要匹配。中文页面使用已启用的语言，例如 zh-cn.md 与 lang: zh-CN。homepage: true 生成对应语言首页，普通页面用 slug 定义路径。第二道 --- 后不写正文。", "blocks 的外层列表按顺序放行。每行先声明 columns，范围为 1 到 4；cells 的外层列表必须有同样数量的单元格。cells 里的每个内层列表至少放一个元素，元素按顺序从上到下显示。新增一栏时，同时新增一个内层列表。", "方括号 [ ] 包含多个对象或列表，花括号 { } 包含字段；同级项目用逗号分隔。圆括号只用于解释，不是配置分隔符。缩进写法里的两个 - 分别表示单元格列表和元素列表。不要新增名为 elements 的字段：它只是描述，实际元素直接放在单元格列表中。", "section 的 blocks 放子元素，不是另一套 columns/cells 行。长段落和代码建议用缩进 YAML 的 text: |、code: |，避免把多行内容挤进花括号。可以把短列表写成 [blog, uncategorized]，其余字段保留缩进；两种写法可混用。", "文章仍写在 content/posts/<post-id>/<locale>.md，用 Markdown 正文。页面文字用 text 或 paragraphs，独立标题用 heading；Markdown 的标题和列表请用对应 Pages 元素表达。!embed 与 !document 是 text 的独立扩展行。"]
        }
      ]
    ]
  },
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "data-table",
          title: "常用元素（字段）",
          headers: ["用途", "元素与关键字段"],
          rows: [
            ["Title", "heading (level, text)"],
            ["Prose", "text (text OR paragraphs)"],
            ["Group", "section (title, blocks)"],
            ["Code", "code (language, code)"],
            ["Articles", "post-list (title, category OR categories, count)"],
            ["Document", "document (title, src)"],
            ["Gallery", "media-viewer (title, items)"]
          ]
        }
      ]
    ]
  },
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "heading",
          level: 2,
          text: "改动后检查"
        },
        {
          type: "text",
          text: "运行 npm run build 校验页面和配置，再用 npm run dev 查看布局。npm run check 生成页面检查报告。代码错误会指出 blocks[行索引]、cells[单元格索引] 和元素位置；索引从 0 开始，括号中的行与单元格编号从 1 开始。"
        }
      ]
    ]
  },
  {
    columns: 1,
    cells: [ # 行 / row（单元格 / cells），个数等于 columns
      [ # 单元格 / cell（元素 / elements），按顺序显示
        {
          type: "link-list",
          title: "继续阅读",
          items: [
            {
              label: "快速入门",
              url: "/quick-start/"
            },
            {
              label: "主题开发",
              url: "/theme-development/"
            }
          ]
        }
      ]
    ]
  }
]
---
