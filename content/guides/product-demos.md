# Product demonstrations

Use a static poster and a local MP4 or WebM for website playback. Visitors start playback manually and can drag the progress bar or use its arrow keys. Touch seeking needs an intentional horizontal drag; scrolling vertically and tapping control spacing keep the playhead. Leaving the viewport pauses playback and returning keeps the same position until Continue is clicked. The final frame remains visible until Replay is chosen.

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

Record a real project and hold its visible results. For EdgePress, show `edgepress new post 'An afternoon by the water'`, editing the generated Markdown in a code editor, running `edgepress server`, opening the homepage, and clicking the article to read it. The preview uses the actual local server. Do not overlay unrelated slogans or publish test posts to production.

中文：网站使用静态封面与本地 MP4/WebM；手动播放，可拖动进度条或用方向键定位；离开视野时暂停，再回来保留原位置，点击继续才播放，结束后停留最后一帧。视频采用 faststart 与内容哈希，接近视野时预载，保留 GIF 给 GitHub 文档。示例必须来自独立写文建站项目：创建文章、代码编辑器修改、运行 `edgepress server`，再从网站首页点击进入文章。录制不需要固定字幕条。

## Isolated desktop recordings

For Pages, run `node tools/recordings/capture-pages-demo.mjs` from the EdgePress repository after preparing the private desktop and installing the current package in the guest. `RECORDING_TOOL_ROOT` selects the guest installation directory (default `/opt/recording`); `RECORDING_VM` selects an existing recording VM. Do not create or enable WSL as part of a capture. The script records the real `edgepress g` and `edgepress s` commands, follows **编辑 Pages** on the loopback preview, creates a page, builds a two-column row, inserts and reorders elements, moves a notice into a section in the other column, edits card fields, uploads a picture through the native file chooser, saves, and returns to the themed website. It verifies the saved hierarchy, uploaded asset and rebuilt HTML. The entire editing sequence is retained; only preview startup waiting is shortened.

中文：页面元素块需单独录制。使用预览里的“编辑 Pages”，展示新建页面、双栏布局、添加元素、调整顺序、跨栏移动到分区、卡片子字段编辑、系统文件选择器上传图片、保存和主题预览。录制使用独立临时站点，原始视频与验证结果保存在 `tools/.recordings/pages-editor/`，检查后再引用导出的 MP4、GIF 和封面。

Use a disposable VM and its own display. The current Windows workflow imports a dedicated WSL2 Debian VM and starts Xvfb display :99 with Openbox, xterm, Geany and Chromium. FFmpeg x11grab records that entire guest desktop at 25 fps. Playwright controls only the guest browser through its loopback CDP endpoint; xdotool controls only DISPLAY :99. Host mouse, keyboard, clipboard and browser sessions remain separate.

Create `/opt/recording/workspace` inside the guest as a link to the mounted canonical workspace. Pack the local EdgePress release with `npm pack` and install the resulting archive under `/opt/recording`, together with compatible Linux dependencies and Wrangler; verify `/opt/recording/node_modules/.bin/edgepress` before capture. Rebuild esbuild in the guest if lifecycle scripts were disabled. When GitHub downloads are unavailable in the guest, transfer archives of the same resolved document-viewer and media-viewer versions from the host and point only the temporary package’s dependencies at those archives. Do not fall back to a Windows global CLI.

The reusable helpers live in tools/recordings/. provision-vm.sh installs open-source desktop tools inside the guest; start-vm-desktop.sh starts its private display. demo-workbench.mjs prepares a real standalone writing site, executes edgepress in the guest terminal, saves the actual Markdown through Geany and opens the actual local preview in Chromium. desktop-recording.mjs invokes FFmpeg capture, trim, concat, H.264 faststart and GIF palette filters. It contains no screenshot capture loop or renderer.

Run start-vm-desktop.sh with `--keep-alive` during a capture session so the desktop stays available between commands. Browser startup waits for the guest CDP endpoint and disables unsolicited translation prompts. Use the physical browser window for page layout and the guest's actual X11 pointer for visible actions. Retain the application's navigation, quota cards and original styles; scroll controls into view before using them. Select both attachments through the native file chooser and show the publication result. The local video fixture adds gentle motion to the existing repository photograph so playback, pause, seeking and speed changes can be seen.

For embeddings, paste !embed[ishare](URL) into the body, save, run edgepress server, open the article from the homepage, grant consent and inspect the attachments. Only the uninformative middle of local-preview startup is omitted; retain the command and ready state. Service fixtures are isolated and never publish production test posts.

Begin writing captures with the terminal already visible. Hold the saved document and server-ready state, then show the homepage link and rendered article. In an embedding capture, verify the copied share URL, play and pause the embedded video, then switch to the picture. Review the exported timeline at several points in every clip and verify MP4/GIF duration, posters and file hashes before synchronizing references.

Keep raw masters, temporary sites and manifests in ignored tools/.recordings/. Publish only verified hashed posters, MP4 clips and documentation GIFs under content/assets/. Run `npm run recordings:capture` from `web/js.gripe`; optional `DEMO` and `DEMO_LOCALE` select a project and language. Inspect the exported clips before running `npm run recordings:sync`. Stop the guest desktop after capture. The operator can also use [OBS Studio display capture](https://obsproject.com/kb/display-capture-sources) inside a VM; this automated pipeline uses [FFmpeg x11grab](https://ffmpeg.org/ffmpeg-devices.html#x11grab) and [Playwright CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp).

The builder emits each progressive file's exact Content-Length and Accept-Ranges policy, with immutable caching for content hashes. Generated audit PDFs live only in tools/reports/page-check.pdf and come from edgepress check.
