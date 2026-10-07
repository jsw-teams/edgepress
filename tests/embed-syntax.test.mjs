import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {createExtensions} from '../src/plugin-api.js';
import {renderBlocks} from '../src/page-blocks.js';

test('posts and Pages share validated embed lines, with inert code examples and disabled services', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  const service = {id:'youtube', provider:'oembed', backendUrl:'https://www.youtube.com', sourceOrigins:['https://www.youtube.com'], embedOrigins:['https://www.youtube.com'], name:'YouTube', embedPathPattern:'^/watch$', embedTemplate:'https://www.youtube.com/embed/example'};
  // The fixture uses a local template and never contacts a real provider.
  delete service.embedPathPattern;
  config.browserPlugins.services = [service];
  const renderer = (await createExtensions(config)).renderer('.md');
  const source = '!embed[youtube](https://www.youtube.com/watch?v=example)';
  const article = await renderer.render('Before\n' + source + '\nAfter', {config, document:{locale:'en'}});
  const page = await renderBlocks([{columns:1, cells:[[{type:'text', text:'Before\n' + source + '\nAfter\n<script>unsafe</script>'}]]}], {config, locale:'en'});
  for (const html of [article, page]) {
    assert.match(html, /data-edgepress-oembed="youtube"/);
    assert.match(html, /data-oembed-data/);
    assert.doesNotMatch(html, /<iframe|<script|<p>\s*<figure/);
    assert.match(html, /Before/); assert.match(html, /After/);
  }
  assert.match(page, /&lt;script&gt;unsafe/);
  for (const example of ['`' + source + '`', '```md\n' + source + '\n```', '\\' + source]) {
    assert.doesNotMatch(await renderer.render(example, {config, document:{locale:'en'}}), /data-edgepress-oembed/);
  }
  for (const unsafe of ['https://evil.example/video', 'https://user:password@www.youtube.com/watch', 'http://www.youtube.com/watch']) {
    await assert.rejects(renderer.render('!embed[youtube](' + unsafe + ')', {config, document:{locale:'en'}}), /registered HTTPS/);
  }
  await assert.rejects(renderer.render('!embed[unknown](https://www.youtube.com/watch)', {config, document:{locale:'en'}}), /registered oembed service/);
  service.enabled = false;
  const disabled = await renderer.render(source, {config, document:{locale:'en'}});
  assert.match(disabled, /data-oembed-disabled/);
  assert.doesNotMatch(disabled, /data-edgepress-oembed|data-oembed-data|<iframe/);
});


test('article summaries and search text omit embeds while retaining prose and code examples',async()=>{
 const {renderMarkdownExcerpt,plainText}=await import('../src/markdown.js');
 const source='!embed[youtube](https://www.youtube.com/watch?v=example)\n\nA quiet afternoon.';
 assert.equal((await renderMarkdownExcerpt(source)).trim(),'<p>A quiet afternoon.</p>');
 assert.equal(plainText(source),'A quiet afternoon.');
 assert.match(plainText('`!embed[youtube](https://www.youtube.com/watch?v=example)`'),/!embed\[youtube\]/);
});


test('Markdown article links and excerpts resolve raw and encoded locale placeholders without rewriting other URLs',async()=>{
 const {localizedContentUrl}=await import('../src/i18n.js');const {renderMarkdown,renderMarkdownExcerpt}=await import('../src/markdown.js');
 const config={i18n:{defaultLocale:'en'}};
 for(const locale of ['en','zh-CN']){
  const resolve=value=>localizedContentUrl(config,locale,value),prefix=locale==='en'?'':'/'+locale;
  for(const token of ['[launge]','%5Blaunge%5D']){
   const source='[Guide](/'+token+'/edgepress/guide/)';
   for(const render of [renderMarkdown,renderMarkdownExcerpt])assert.match(await render(source,{linkResolver:resolve}),new RegExp('href="'+prefix+'/edgepress/guide/"'));
  }
  assert.equal(resolve('https://example.com/[launge]/'),'https://example.com/[launge]/');assert.equal(resolve('/explicit/'),'/explicit/');
  assert.throws(()=>resolve('/other/[launge]/'),/first site-path segment/);
 }
});


test('revision comparisons keep localized links valid without loading historical embeds',async()=>{
 const {renderRevisionCards}=await import('../src/revision-cards.js');const {localizedContentUrl}=await import('../src/i18n.js');
 const html=await renderRevisionCards('-[Old guide](/[launge]/guide/)\n+[Current guide](/[launge]/edgepress/)',key=>key,null,{linkResolver:value=>localizedContentUrl({i18n:{defaultLocale:'en'}},'zh-CN',value)});
 assert.match(html,/href="\/zh-CN\/guide\/"/);assert.match(html,/href="\/zh-CN\/edgepress\/"/);assert.doesNotMatch(html,/%5Blaunge|data-edgepress-oembed/);
});
