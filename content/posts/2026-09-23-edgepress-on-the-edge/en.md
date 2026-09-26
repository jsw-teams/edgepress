---
title: "EdgePress and Markdown: a complete writing guide"
author: toewpq
date: 2026-09-23
lang: en
slug: markdown-syntax-guide
tags:
  - EdgePress
  - Markdown
  - writing guide
description: "A hands-on guide to the Markdown syntax EdgePress renders, including GitHub Flavored Markdown, safe HTML, nested formatting, and its supported limits."

---

EdgePress keeps **pages** and **posts** deliberately different. Pages use ordered, editable element blocks from their Markdown front matter. Posts use the Markdown renderer, so this article is also a working reference: every example below is rendered from a real post.

The post renderer uses CommonMark with GitHub Flavored Markdown (GFM), then sanitizes the generated HTML. Use a blank line between block elements. Inline syntax can be combined inside paragraphs, list items, quotes, and table cells.

## Headings and paragraphs

Markdown has six heading levels. A post already gets its page-level `<h1>` from its front matter title; use `##` through `######` in the body so the page keeps one clear `<h1>`.

```markdown
# Heading level 1
## Heading level 2
### Heading level 3
#### Heading level 4
##### Heading level 5
###### Heading level 6
```

CommonMark also has Setext headings. A line of `=` characters makes a level-one heading, and a line of `-` characters makes a level-two heading. Keep the level-one form in a code sample when the post already has its page title as `<h1>`:

```markdown
Heading level one
=================

Heading level two
-----------------
```

The level-two Setext form is rendered here:

Setext heading level two
------------------------

This article uses the remaining heading levels below to demonstrate that they render as real headings.

### A level-three heading

#### A level-four heading

##### A level-five heading

###### A level-six heading

A paragraph is ordinary text. Leave a blank line to start a new paragraph. A single newline in a paragraph normally becomes a space. For a hard line break, put two spaces at the end of a source line, then continue on the next line:

This line ends with a Markdown hard break.  
This sentence starts on the next rendered line.

Use three hyphens, asterisks, or underscores on a line by themselves to make a thematic break:

---

An asterisk rule:

* * *

An underscore rule:

___

## Emphasis, code, and characters

Use `*italic*` or `_italic_` for *emphasis*. Use `**bold**` or `__bold__` for **strong emphasis**. Combine them as `***bold and italic***`, and use `~~deleted text~~` for ~~strikethrough~~.

Backticks make `inline code`. Fence multiple lines with three backticks; add a language name for readable code highlighting hooks:

```js
const site = { renderer: 'EdgePress', markdown: true };
console.log(`Building with ${site.renderer}`);
```

Tildes can fence code as well:

~~~text
This fenced block uses tildes.
~~~

Indenting code by four spaces is also part of CommonMark:

    const indented = 'four leading spaces';

To show a literal backtick, put it inside a code span marked with two backticks: `` ` ``. Markdown punctuation can be escaped with a backslash, like `\*not emphasis\*`, and character references such as `&lt;` and `&amp;` are displayed as `<` and `&`.

## Links and images

An inline link looks like `[Quick start](/quick-start/)`. Reference links keep the destination separate: [the build guide][build-guide]. GFM recognizes a bare URL such as https://www.markdownguide.org/, an angle-bracket URL such as <https://commonmark.org>, a www.example.com address, and an email such as team@example.com. Link text should describe its destination.

[build-guide]: /quick-start/

Images use the same shape as links, with an exclamation mark and useful alternative text. This local illustration is included in the project assets:

![A diagram showing Markdown source passing through EdgePress rendering and HTML sanitization to a published post](/edgepress-markdown-guide.svg "The EdgePress post pipeline")

Posts also accept a direct video file in the same image-shaped syntax. The alt text describes the video for assistive technology, and the optional title becomes its caption:

```markdown
![A kite passing over a field](https://media.example.org/field-recording.mp4 "Wind test, early morning")
```

MP4, WebM, OGV, and OGG files are rendered in a native video player with controls. Media uses `preload="none"` so the browser waits for playback before downloading the video. Embedded video players and arbitrary iframe markup are not supported.

## Lists, including nested combinations

Start unordered items with `-`, `+`, or `*`; start ordered items with a number and a period. Indent child items by at least two spaces. Inline emphasis, code, and links work inside either level:

- A parent item with **strong text** and `inline code`.
  1. A numbered child with a [link to the guide](/quick-start/).
  2. Another child with *emphasis*.
- A second parent item.

GFM task-list markers render as named, non-interactive status symbols so assistive technology can announce whether a task is complete:

- [x] The finished item includes **bold text**.
- [ ] The unfinished item contains `code` and a nested child:
  - [x] The nested item is complete.

Block quotes begin with `>`. Quotes can contain other block syntax, including a nested list and inline formatting:

> A quoted sentence with **bold text** and `code`.
>
> - A list nested inside the quote.
> - A second quoted list item with [a link](/project-introduction/).

You can also nest quote levels by adding another `>` at the start of a line:

> The outer quote.
>
> > The inner quote has *emphasis*.

These examples combine two or more Markdown forms in one region. The generated HTML keeps the semantic nesting: list inside a quote, list inside a list, and inline emphasis inside list items.

The `+` marker also starts an unordered list, and `1)` is another ordered-list marker:

+ Another unordered item.
+ A second item.

1) An ordered item using a closing parenthesis.
2) Its next item.

## Tables and more GFM

Use pipes to separate table cells and hyphens for the header divider. Colons set alignment. Inline Markdown works inside cells:

| Syntax | Example | Rendered result |
| :--- | :---: | ---: |
| Emphasis | `*text*` | *text* |
| Strong | `**text**` | **text** |
| Code | `` `const x = 1` `` | `const x = 1` |

GFM also turns `www.example.com` and `https://example.com` into links, and supports the strikethrough and task-list forms shown above. Tables can scroll horizontally on narrow screens so their columns stay readable.

## Safe inline HTML and supported limits

Small semantic HTML elements such as <kbd>Ctrl</kbd> can be useful inside Markdown. EdgePress sanitizes the resulting HTML: safe text, headings, lists, links, images, quotes, and tables are retained, while unsafe attributes and active script content are removed. This raw script is intentionally removed during the build:

<script>alert('unsafe');</script>

Use the Markdown image-shaped syntax above for a direct video file; embedded frames and arbitrary scripts are not allowed in posts.

This is the complete enabled post dialect: CommonMark block and inline syntax plus GFM tables, autolinks, task lists, and strikethrough. Extensions such as footnotes, math notation, Mermaid diagrams, underline syntax, and definition lists are not enabled by this project. They remain ordinary text unless you add a trusted renderer extension.

## Writing posts in EdgePress

Create a post directory under `content/posts/` with one lowercase locale file such as `en.md` or `zh-cn.md`. Keep the `lang` front matter value matched to the locale filename. Add title, author, date, slug, tags, and an optional description above the Markdown body. The author appears in article cards, article bylines, feeds, search data, and BlogPosting metadata. Then run `edgepress build` to render the post, or `edgepress check` to build the site and generate the accessibility, agent-friendliness, responsive screenshot, and Markdown-rendering report.

The local article search reads the generated `search.json` file from this site and searches post titles and text in the browser. It does not send a query to a third-party service.
