# Product demonstrations

A media-text image block can pair a static poster with an optional local GIF. The animation is fetched only when the visitor presses Watch, with pause and replay controls. Preserve deliberate result holds instead of accelerating the whole interaction.

```yaml
- type: media-text
  mediaType: image
  src: /images/publishing.webp
  animationSrc: /images/publishing.gif
  animationDuration: 30000
  alt: Publishing a photo and video post
  title: From story to shared post
  text: Write, attach media, publish, then share the result.
```

Use a local GIF and an integer duration between 1,000 and 120,000 milliseconds. Store the poster and recording under content/assets/. Hashed filenames retain immutable caching. Do not wrap a recording in the original-image lightbox. The recording should show genuine interface actions in an isolated fixture; never publish demonstration data on production.

中文：用静态封面搭配本地 GIF，访客点击后再加载，支持暂停和从头重播。演示先展示用途，再停留展示关键操作和结果，不要把完整流程加速成看不清的步骤。
