# Product demonstrations

Use a static poster and a local MP4 or WebM for website playback. The recording starts when it enters the viewport, pauses when it leaves, and continues from the same position when it returns. A visitor's explicit pause stays paused. The final frame remains visible until Replay is chosen.

```yaml
- type: media-text
  mediaType: image
  src: /images/publishing.webp
  animationSrc: /images/publishing.mp4
  alt: Publishing a photo and video post
  title: Publish a story
  text: Write a caption, attach media and share the result.
```

Put the MP4 metadata at the start of the file (FFmpeg `-movflags +faststart`) and use a hashed filename for immutable caching. The runtime prepares nearby media, streams the native file and preserves its playhead without Blob URLs. Posters reserve the layout. GIF exports remain useful in GitHub documentation.

Record a real project and hold its visible results. For EdgePress, show `edgepress new post 'Hello world'`, editing the generated Markdown in a code editor, a real CLI publication check, and the built article in a browser. The example records Cloudflare's dry run without creating a production site. Do not overlay unrelated slogans or publish test posts to production.

中文：网站使用静态封面与本地 MP4/WebM；进入视野自动播放，离开时暂停，再回来从原处继续。手动暂停后不会自行播放，结束后停留最后一帧。视频采用 faststart 与内容哈希，接近视野时预载，保留 GIF 给 GitHub 文档。示例必须来自独立写文建站项目：创建文章、代码编辑器修改、真实命令行发布检查和浏览器成稿。录制不需要固定字幕条。
