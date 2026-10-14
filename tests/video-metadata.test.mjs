import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVideoMetadata, reserveVideoMetadata} from '../src/video-metadata.js';
import {dataSaverHtml, configureDataSaver} from '../src/data-saver.js';
import {loadConfig} from '../src/config.js';

test('local video sidecars reserve measured previews without downloading media and survive text-view gating', async () => {
  const assets = [
    {path:'media/clip.mp4'}, {path:'media/clip.mp4.poster.jpg'},
    {path:'media/clip.mp4.json', content:Buffer.from(JSON.stringify({duration:150.001,width:960,height:540,poster:'clip.mp4.poster.jpg'}))}
  ];
  const metadata = await collectVideoMetadata(assets);
  const source = '<figure><video data-edgepress-video preload="none" aria-label="Clip"><source src="/media/clip.mp4" type="video/mp4"></video><figcaption>Caption</figcaption></figure>';
  const html = reserveVideoMetadata(source, metadata, '2026/10/report/index.html', 'https://site.example');
  assert.match(html, /data-duration="150\.001" poster="\/media\/clip\.mp4\.poster\.jpg" width="960" height="540"/);
  assert.equal(reserveVideoMetadata(html, metadata, 'index.html', 'https://site.example'),html);
  assert.equal(reserveVideoMetadata(source.replace('/media/clip.mp4','https://other.example/media/clip.mp4'),metadata,'index.html','https://site.example'),source.replace('/media/clip.mp4','https://other.example/media/clip.mp4'));
  assert.match(reserveVideoMetadata(source.replace('preload="none"','preload="none" poster="/chosen.jpg"'),metadata,'index.html','https://site.example'),/poster="\/chosen.jpg"/);
  const config = await loadConfig(process.cwd()); config.site.dataSaver.enabled=true; await configureDataSaver(config);
  const gated = dataSaverHtml('<html><head></head><body>'+html+'</body></html>',config,{});
  assert.match(gated,/<template data-edgepress-data-html>.*data-duration=&quot;150\.001&quot;.*poster=&quot;\/media\/clip\.mp4\.poster\.jpg&quot;/s);
  assert.match(gated,/<\/div><figcaption>Caption<\/figcaption>/);
  assert.deepEqual(await collectVideoMetadata([{path:'media/clip.mp4'}]),new Map());
  for (const change of [{duration:0},{poster:'https://external.example/image.jpg'},{poster:'missing.jpg'}]) {
    const bad=assets.map(item=>item.path.endsWith('.json')?{...item,content:Buffer.from(JSON.stringify({duration:150,width:960,height:540,poster:'clip.mp4.poster.jpg',...change}))}:item);
    await assert.rejects(collectVideoMetadata(bad));
  }
});
