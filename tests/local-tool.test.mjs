import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLocalTool} from '../src/local-tool.js';
import {renderBlocks} from '../src/page-blocks.js';
import {rewriteAssetLinks} from '../src/assets.js';
const manifest = {'/study.js':'/study.1111111111111111.js', '/study.css':'/study.2222222222222222.css', '/data/bank.json':'/data/bank.json'};
const context = {config:{assetManifest:manifest}};
const block = {type:'local-tool',id:'study',title:'Local search',script:'/study.js',stylesheet:'/study.css',data:'/data/bank.json',fallback:'Enable JavaScript to search.'};

test('JSON Pages render trusted local tools and fingerprint their executable assets', async () => {
  const body = await renderBlocks([{columns:1,cells:[[block]]}], context);
  const output = rewriteAssetLinks(body, manifest);
  assert.match(output, /data-edgepress-local-tool/);
  assert.match(output, /data-tool-data="\/data\/bank.json"/);
  assert.match(output, /study\.1111111111111111\.js/);
  assert.match(output, /study\.2222222222222222\.css/);
  assert.match(output, /<noscript><p>Enable JavaScript/);
});

test('local tools reject remote, traversal, encoded, executable-data and missing assets', () => {
  for (const script of ['https://vendor.example/study.js','//vendor.example/study.js','/../study.js','/x/./study.js','/x/%2e%2e/study.js','javascript:alert(1)','/missing.js','/study.js?x=1']) {
    assert.throws(() => renderLocalTool({...block,script},context), /local-tool.script/);
  }
  assert.throws(() => renderLocalTool({...block,data:'https://vendor.example/bank.json'}, context), /local-tool.data/);
  assert.throws(() => renderLocalTool({...block,stylesheet:'/study.js'}, context), /local-tool.stylesheet/);
});

test('local tool titles and fallback text remain escaped and unsupported configuration fails', () => {
  const html = renderLocalTool({...block,title:'<img onerror=x>',text:'<script>evil</script>',fallback:'<script>evil</script>'},context);
  assert.ok(!html.includes('<img onerror'));
  assert.match(html,/&lt;script&gt;evil/);
  assert.throws(() => renderLocalTool({...block,id:'bad"id'},context),/local-tool.id/);
  assert.throws(() => renderLocalTool({...block,endpoint:'/api'},context),/Unsupported local-tool/);
});
