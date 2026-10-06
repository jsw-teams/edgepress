import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../src/config.js';
import {collectAssets,writeAssets} from '../src/assets.js';

test('a dependency-based site receives hashed core runtime and can retain explicit local overrides',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'edgepress-runtime-'));
  try {
    const config=await loadConfig(fileURLToPath(new URL('../',import.meta.url)));
    config.resolvedPaths.static=resolve(directory,'static');config.resolvedPaths.content=resolve(directory,'content');config.resolvedPaths.theme=resolve(directory,'theme');
    const bundle=await collectAssets(config),paths=new Set(bundle.assets.map(item=>'/'+item.path));
    for(const icon of ['home','shield-check','github'])assert.ok(paths.has('/edgepress/icons/'+icon+'.svg'),'Missing built-in icon: '+icon);
    for(const path of ['/edgepress/language-select.js','/edgepress/navigation-select.js','/edgepress/plugins/consent/manager.js','/edgepress/plugins/consent/choices.js','/edgepress/oembed.js']){assert.match(bundle.urlMap[path],/\.[a-f0-9]{16}\.js$/);assert.ok(paths.has(bundle.urlMap[path]));}
    const oembed=bundle.assets.find(item=>'/'+item.path===bundle.urlMap['/edgepress/oembed.js']).content.toString();
    assert.match(oembed,/services\.[a-f0-9]{16}\.js/);assert.match(oembed,/choices\.[a-f0-9]{16}\.js/);
    // Theme assets are also a supported explicit override source.
    const override="export const customLanguageSwitcher=true;\n";
    await mkdir(resolve(directory,'theme/assets/edgepress'),{recursive:true});await writeFile(resolve(directory,'theme/assets/edgepress/language-select.js'),override);
    const custom=await collectAssets(config);assert.equal(custom.assets.find(item=>'/'+item.path===custom.urlMap['/edgepress/language-select.js']).content.toString(),override);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('hashed recordings cache immutably while unversioned media stays refreshable',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'edgepress-media-cache-'));try{const files=['demo.0123456789abcdef.mp4','demo.0123456789abcdef.webm','demo.mp4'];await writeAssets({existingHeaders:'',assets:files.map(path=>({path,content:Buffer.from('fixture')}))},directory);const headers=await readFile(resolve(directory,'_headers'),'utf8');for(const path of files.slice(0,2))assert.ok(headers.includes('/'+path+'\n  Cache-Control: public, max-age=31536000, immutable'));assert.ok(!headers.includes('/demo.mp4\n  Cache-Control: public, max-age=31536000, immutable'));assert.match(headers,/Content-Length: 7/);}finally{await rm(directory,{recursive:true,force:true});}
});
