---
title: Read Pages as nested collections
lang: en
slug: page-authoring
description: "Page (rows), row (cells), cell (elements): a complete commented YAML example and editing rules."
# Page (rows); row (columns, cells); cell (ordered elements)
blocks:
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: hero
          title: Read Pages as nested collections
          text: Understand containment first, then fill in the content. Square brackets hold lists; braces hold objects. This is standard YAML, equivalent to the indented form.
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: code
          title: Containment (a description, not extra syntax)
          language: text
          code: |-
            Page (row 1, row 2, …)
              Row (columns: count, cells: cell list)
                Cell (element 1, element 2, …)
                  Element (type, fields for that type)
                  Section (title, blocks: child elements)
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: code
          title: A complete page you can save
          language: yaml
          code: |-
            ---
            title: My page
            lang: en
            slug: my-page
            blocks: [ # page (row 1, row 2, ...)
              { columns: 2, cells: [ # row 1 (left cell, right cell)
                [ # left cell (heading, text)
                  { type: heading, level: 2, text: "About this project" },
                  { type: text, text: "A small tool for everyday writing." }
                ],
                [ # right cell (links)
                  { type: link-list, title: "Read more", items: [
                    { label: "Project", url: "/project-introduction/" }
                  ] }
                ]
              ] }
            ]
            ---
        - type: text
          paragraphs:
            - "Save the example as content/pages/my-page/en.md. Locale filenames are lowercase and lang must match an enabled locale. homepage: true generates the localized home; slug gives an ordinary page its path. Leave the body after the second --- empty."
            - The outer blocks list holds rows in order. Set columns from 1 to 4, then give cells exactly that many inner lists. Each inner list is one cell with at least one element, rendered from top to bottom. Add an inner list whenever you add a column.
            - Square brackets contain lists, braces contain fields, and commas separate adjacent entries. Parentheses describe containment; they are not configuration delimiters. The two dashes in the indented form represent the cell list and its element list. Do not add an elements field; elements go directly in the inner list.
            - "A section uses blocks for child elements, not another columns/cells row. Use indented text: | or code: | for long passages and multiline code. Short lists such as [blog, uncategorized] can use brackets while the rest stays indented."
            - Articles stay in content/posts/<post-id>/<locale>.md with Markdown bodies. Pages use text or paragraphs for prose and heading for a separate heading. Use corresponding page elements for lists and titles. Standalone !embed and !document lines are supported extensions in text.
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: data-table
          title: Common elements (fields)
          headers:
            - Purpose
            - Element and key fields
          rows:
            - - Title
              - heading (level, text)
            - - Prose
              - text (text OR paragraphs)
            - - Group
              - section (title, blocks)
            - - Code
              - code (language, code)
            - - Articles
              - post-list (title, category OR categories, count)
            - - Document
              - document (title, src)
            - - Gallery
              - media-viewer (title, items)
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: heading
          level: 2
          text: Check your changes
        - type: text
          text: Run npm run build to validate pages and configuration, npm run dev to inspect the layout, and npm run check for the page report. Rendering errors identify the row, cell and element. Array indexes start at 0; the accompanying human row and cell numbers start at 1.
  - columns: 1
    cells: # Row (cell 1, cell 2, …); count equals columns
      - - type: link-list
          title: Continue reading
          items:
            - label: Quick start
              url: /quick-start/
            - label: Theme development
              url: /theme-development/
---
