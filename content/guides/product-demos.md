# Product demonstrations

Use a static poster and a local MP4 or WebM for website playback. Visitors start playback manually and can drag the progress bar or use its arrow keys. Touch seeking needs an intentional horizontal drag; scrolling vertically keeps the playhead. Leaving the viewport pauses playback and returning keeps the same position until Continue is clicked.

```yaml
- type: media-text
  mediaType: image
  src: /images/publishing.webp
  animationSrc: /images/publishing.mp4
  alt: Publishing a photo and video post
  title: Publish a story
  text: Write a caption, attach media and share the result.
```

Put MP4 metadata at the start of the file (FFmpeg `-movflags +faststart`) and use a hashed filename for immutable caching. Posters reserve layout space before playback starts.

中文：网站使用静态封面与本地 MP4/WebM；访客手动播放，可拖动进度条或用方向键定位；离开视野时暂停，再回来保留原位置。视频采用 `faststart` 与内容哈希，保留 GIF 给 GitHub 文档。

## Recording workflow

Keep raw captures in ignored `tools/.recordings/` and publish only verified hashed posters, MP4 clips, and GIFs under `content/assets/`. Use an isolated VM desktop (for example, Xvfb + Openbox + FFmpeg `x11grab` + `xdotool`, or OBS Studio inside a VM) so host input and browser profiles stay separate. Never record live production credentials or publish test posts to production.
