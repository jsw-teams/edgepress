---
title: "Local video and CJK emphasis in Markdown"
lang: en
---

Insert a local video with the ordinary image-shaped Markdown syntax:

```md
![A character walks around the barrier](/media/bypass.mp4 "Motion test")
```

EdgePress enhances same-origin MP4, WebM, OGV and OGG files with the shared Multimedia viewer player. It provides themed controls, time, seeking, speed, volume and fullscreen. The file starts loading when the visitor presses Play. Scrolling the player out of view pauses playback and retains its position. Returning does not automatically resume it.

The native video element remains the fallback if the enhancement is unavailable. The player engine and styles are bundled locally and fingerprinted with the other site assets. A site with Markdown videos receives these assets even when it has no Pages galleries. In text view, the video and its engine activate only when the visitor requests that media. External embeds retain their own service-consent rules.

Use meaningful alternative text and an optional title for the visible caption. Reference-style links are supported too:

```md
![An action comparison][comparison]

[comparison]: /media/comparison.mp4
```

CJK prose can place bold text ending in brackets or punctuation directly beside the next word:

```md
本次采用**有限动画（背景复用）**制作短片。
```

The bracketed phrase renders as bold without adding spaces. Code spans, fenced code, escaped delimiters and link destinations retain their normal Markdown behavior.
