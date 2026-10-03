import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../src/config.js';
import {collectAssets} from '../src/assets.js';

test('a dependency-based site receives hashed core runtime and can retain explicit local overrides',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'edgepress-runtime-'));
  try {
    const config=await loadConfig(fileURLToPath(new URL('../',import.meta.url)));
    config.resolvedPaths.static=resolve(directory,'static');config.resolvedPaths.content=resolve(directory,'content');config.resolvedPaths.theme=resolve(directory,'theme');
    const bundle=await collectAssets(config),paths=new Set(bundle.assets.map(item=>'/'+item.path));
    for(const path of ['/edgepress/language-select.js','/edgepress/navigation-select.js','/edgepress/plugins/consent/manager.js','/edgepress/plugins/consent/choices.js','/edgepress/oembed.js']){assert.match(bundle.urlMap[path],/\.[a-f0-9]{16}\.js$/);assert.ok(paths.has(bundle.urlMap[path]));}
    const oembed=bundle.assets.find(item=>'/'+item.path===bundle.urlMap['/edgepress/oembed.js']).content.toString();
    assert.match(oembed,/services\.[a-f0-9]{16}\.js/);assert.match(oembed,/choices\.[a-f0-9]{16}\.js/);
    // Theme assets are also a supported explicit override source.
    const override="export const customLanguageSwitcher=true;\n";
    await mkdir(resolve(directory,'theme/assets/edgepress'),{recursive:true});await writeFile(resolve(directory,'theme/assets/edgepress/language-select.js'),override);
    const custom=await collectAssets(config);assert.equal(custom.assets.find(item=>'/'+item.path===custom.urlMap['/edgepress/language-select.js']).content.toString(),override);
  }finally{await rm(directory,{recursive:true,force:true});}
});
