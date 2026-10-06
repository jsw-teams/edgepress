# Product demonstrations

Use a static poster and a local MP4 or WebM for website playback. Visitors start playback manually and can drag the progress bar or use its arrow keys. Leaving the viewport pauses playback and returning keeps the same position until Continue is clicked. The final frame remains visible until Replay is chosen.

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

Record a real project and hold its visible results. For EdgePress, show `edgepress new post 'Hello world'`, editing the generated Markdown in a code editor, running `edgepress server`, opening the homepage, and clicking the article to read it. The preview uses the actual local server. Do not overlay unrelated slogans or publish test posts to production.

中文：网站使用静态封面与本地 MP4/WebM；手动播放，可拖动进度条或用方向键定位；离开视野时暂停，再回来保留原位置，点击继续才播放，结束后停留最后一帧。视频采用 faststart 与内容哈希，接近视野时预载，保留 GIF 给 GitHub 文档。示例必须来自独立写文建站项目：创建文章、代码编辑器修改、运行 `edgepress server`，再从网站首页点击进入文章。录制不需要固定字幕条。

## Recording workbench

`tools/demo-workbench.mjs` provides an isolated CLI and Monaco workbench for browser recordings. Pass an artifact directory, EdgePress package root, installed Monaco directory, local photo and browser context. It creates a temporary site, executes the real new-post and server commands, and serves browser requests through the running preview. Always call `dispose()` in `finally` to stop its preview process. The workbench accepts no deployment command. Keep temporary frames and manifests in ignored `tools/.recordings/`; only publish the final hashed poster, MP4 and documentation GIF.

For embedded posts, show the link being added to article `embeds`, save the actual Markdown file, and display the resulting post after consent. A dialog containing links alone does not demonstrate website integration.

The development checkout includes Monaco. A browser recording can import `workbench`, supply `editorRoot: resolve(packageRoot, 'node_modules/monaco-editor')`, and navigate to `https://edgepress-demo.test/workbench/` within its intercepted context. The browser uses that recording-only hostname while the helper forwards built pages to the real loopback server.

The builder generates the exact Content-Length of each static MP4/WebM from its file metadata, alongside the immutable policy for hashed files. This keeps native seeking available on the deployed assets without moving recordings into an application backend.
