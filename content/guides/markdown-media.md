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

To show a poster and total duration before Play, generate a local preview once (FFmpeg and FFprobe must be on PATH):

```sh
node node_modules/edgepress/tools/assets/video-preview.mjs content/assets/media/bypass.mp4
```

An optional second argument selects the frame time in seconds. Commit the generated `bypass.mp4.poster.jpg` and `bypass.mp4.json` beside the video. The sidecar contains measured `duration`, `width`, `height` and the relative `poster` filename. EdgePress reads these local files during every build and adds the preview attributes to matching video elements, including Markdown videos. Cloud builds need no FFmpeg; visitors load the poster, while the video still waits for Play. After playback begins, the player's actual media duration replaces the supplied value. Regenerate the preview when replacing the video.

```md
![An action comparison][comparison]

[comparison]: /media/comparison.mp4
```

CJK prose can place bold text ending in brackets or punctuation directly beside the next word:

```md
本次采用**有限动画（背景复用）**制作短片。
```

The bracketed phrase renders as bold without adding spaces. Code spans, fenced code, escaped delimiters and link destinations retain their normal Markdown behavior.
