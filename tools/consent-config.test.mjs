import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse,stringify} from 'yaml';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import consentManager from '../plugins/consent/index.js';
import {generateBuiltinRoutes} from '../src/generators.js';
import {renderBlocks} from '../src/page-blocks.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=parse(await readFile(resolve(root,'config.yml'),'utf8'));
source.plugins.consent.services.push({id:'github-comments',provider:'external-widget',moduleUrl:'https://comments.example.com/commentnest/widget.js',placement:'posts',backendUrl:'https://comments.example.com',name:'GitHub comments',purpose:'Read discussions.',dataCategories:'Identity and comments.',recipient:'GitHub',retention:'Until removed.',privacyUrl:'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'});

test('consent payload follows YAML names, dates, expiry and enabled services; no old fingerprints survive',async()=>{
  const folder=await mkdtemp(resolve(tmpdir(),'reporelay-consent-'));
  try {
    const settings=structuredClone(source);
    settings.plugins.consent.expiresDays=37;
    settings.plugins.consent.proposedDate='2026-10-03';
    settings.plugins.consent.effectiveDate='2026-10-04';
    for (const service of settings.plugins.consent.services) service.enabled = service.provider === 'external-widget';
    settings.plugins.consent.services.find(service => service.provider === 'external-widget').name='Configured discussion name';
    await writeFile(resolve(folder,'config.yml'),stringify(settings));
    await writeFile(resolve(folder,'edgepress.config.mjs'),"export default {i18n:{defaultLocale:'en',languagePacks:['zh-CN']}};");
    const config=await loadConfig(folder);
    config.i18n.translationsByLocale={en:{}};
    let filter;
    consentManager({registerFilter:(_key,value)=>{filter=value;}});
    const html=filter('<html><body></body></html>',{config,page:{locale:'en'}});
    const payload=JSON.parse(html.match(/id="edgepress-privacy-config">([\s\S]*?)<\/script>/)[1]);
    assert.equal(payload.privacy.consent.expiresDays,37);
    assert.equal(payload.privacy.consent.effectiveDate,'2026-10-04');
    assert.deepEqual(payload.privacy.integrations.map(item=>item.id),['github-comments']);
    assert.equal(payload.privacy.integrations[0].name,'Configured discussion name');
    assert.equal(payload.legacyChoiceFingerprints,undefined);
    assert.equal(config.browserPlugins.services.filter(service => service.enabled === false).length,1,'A disabled service is retained without loading it');
    assert.ok(!Object.hasOwn(payload.privacy.integrations[0], 'category'));
    assert.ok(!Object.hasOwn(payload.ui, 'pluginBackend'));
  } finally {await rm(folder,{recursive:true,force:true});}
});

test('disabling external services removes slots and publishes no service context',async()=>{
  const config=await loadConfig(root);await loadLanguagePacks(config);
  config.browserPlugins.services.forEach(service => service.enabled = false);
  const post={kind:'posts',bundlePath:'fixture',title:'Article',locale:'en',path:'fixture/',date:new Date('2026-10-03'),
    tags:[],category:'blog',description:'Article',markdown:'Text',html:'<p>Text</p>'};
  const routes=await generateBuiltinRoutes({posts:[post],pages:[]},config,{filter:async(_key,value)=>value});
  const article=routes.find(route=>route.path==='fixture/index.html');
  assert.doesNotMatch(article.body,/data-edgepress-service|services-consent\.js/);
  assert.equal(routes.find(route=>route.path==='edgepress/service-contexts.json').body,'[]');
  const html=await renderBlocks([{columns:1,cells:[[{type:'service',integration:'github-comments'}]]}],{config,locale:'en',site:{posts:[]}});
  assert.doesNotMatch(html,/data-edgepress-service/);
});

test('explicit service slots publish stable context across translations and reject duplicate blocks',async()=>{
  const config=await loadConfig(root);await loadLanguagePacks(config);
  config.browserPlugins.services=structuredClone(source.plugins.consent.services);
  const blocks=[{columns:1,cells:[[{type:'service',integration:'github-comments'}]]}];
  const pages=['en','zh-SG'].map(locale=>({kind:'pages',bundlePath:'home',title:'Home',locale,path:locale==='en'?'':locale+'/',homepage:true,blocks}));
  const routes=await generateBuiltinRoutes({posts:[],pages},config,{filter:async(_key,value)=>value});
  assert.match(routes.find(route=>route.path==='index.html').body,/data-service-thread="page:home"/);
  assert.deepEqual(JSON.parse(routes.find(route=>route.path==='edgepress/service-contexts.json').body),[{thread:'page:home',title:'Home'}]);
  const duplicate=[{columns:1,cells:[[{type:'service',integration:'github-comments'},{type:'service',integration:'github-comments'}]]}];
  await assert.rejects(renderBlocks(duplicate,{config,locale:'en',document:pages[0],site:{posts:[]}}),/only one/);
});


test('flat consent configuration rejects category presets and validates per-service enablement',async()=>{
 const folder=await mkdtemp(resolve(tmpdir(),'edgepress-services-'));
 try {
  await writeFile(resolve(folder,'edgepress.config.mjs'),"export default {i18n:{defaultLocale:'en',languagePacks:[]}};");
  const settings=structuredClone(source);settings.plugins.consent.services=[];
  settings.plugins.consent.statistics={enabled:true,services:[]};
  await writeFile(resolve(folder,'config.yml'),stringify(settings));
  await assert.rejects(loadConfig(folder),/plugins.consent.services/);
  delete settings.plugins.consent.statistics;
  settings.plugins.consent.services=[{...source.plugins.consent.services.find(service=>service.provider==='external-widget'),enabled:'yes'}];
  await writeFile(resolve(folder,'config.yml'),stringify(settings));
  await assert.rejects(loadConfig(folder),/enabled must be a boolean/);
 }finally{await rm(folder,{recursive:true});}
});
