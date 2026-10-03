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
source.plugins.consent.comments={enabled:true,services:[{id:'github-comments',provider:'commentnest',backendUrl:'https://comments.example.com',name:'GitHub comments',purpose:'Read discussions.',dataCategories:'Identity and comments.',recipient:'GitHub',retention:'Until removed.',privacyUrl:'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'}]};

test('consent payload follows YAML names, dates, expiry and enabled groups; no old fingerprints survive',async()=>{
  const folder=await mkdtemp(resolve(tmpdir(),'reporelay-consent-'));
  try {
    const settings=structuredClone(source);
    settings.plugins.consent.expiresDays=37;
    settings.plugins.consent.proposedDate='2026-10-03';
    settings.plugins.consent.effectiveDate='2026-10-04';
    settings.plugins.consent.statistics.enabled=false;
    settings.plugins.consent.comments.services[0].name='Configured discussion name';
    await writeFile(resolve(folder,'config.yml'),stringify(settings));
    await writeFile(resolve(folder,'edgepress.config.mjs'),"export default {i18n:{defaultLocale:'en',languagePacks:['zh-CN']}};");
    const config=await loadConfig(folder);
    config.i18n.translationsByLocale={en:{pluginComments:'Comments'}};
    let filter;
    consentManager({registerFilter:(_key,value)=>{filter=value;}});
    const html=filter('<html><body></body></html>',{config,page:{locale:'en'}});
    const payload=JSON.parse(html.match(/id="edgepress-privacy-config">([\s\S]*?)<\/script>/)[1]);
    assert.equal(payload.privacy.consent.expiresDays,37);
    assert.equal(payload.privacy.consent.effectiveDate,'2026-10-04');
    assert.deepEqual(payload.privacy.integrations.map(item=>item.id),['github-comments']);
    assert.equal(payload.privacy.integrations[0].name,'Configured discussion name');
    assert.equal(payload.legacyChoiceFingerprints,undefined);
    assert.equal(config.browserPlugins.statistics.services.length,1,'A disabled definition is retained without loading it');
  } finally {await rm(folder,{recursive:true,force:true});}
});

test('disabling comments removes UI and publishes no article allowlist',async()=>{
  const config=await loadConfig(root);await loadLanguagePacks(config);
  config.browserPlugins.comments.enabled=false;
  const post={kind:'posts',bundlePath:'fixture',title:'Article',locale:'en',path:'fixture/',date:new Date('2026-10-03'),
    tags:[],category:'blog',description:'Article',markdown:'Text',html:'<p>Text</p>'};
  const routes=await generateBuiltinRoutes({posts:[post],pages:[]},config,{filter:async(_key,value)=>value});
  const article=routes.find(route=>route.path==='fixture/index.html');
  assert.doesNotMatch(article.body,/data-edgepress-comments|comments-consent\.js/);
  assert.equal(routes.find(route=>route.path==='edgepress/comment-threads.json').body,'[]');
  const html=await renderBlocks([{columns:1,cells:[[{type:'comments'}]]}],{config,locale:'en',site:{posts:[]}});
  assert.doesNotMatch(html,/data-edgepress-comments/);
});

test('explicit page comments publish one stable thread across translations and reject duplicate blocks',async()=>{
  const config=await loadConfig(root);await loadLanguagePacks(config);
  config.browserPlugins.comments=structuredClone(source.plugins.consent.comments);
  const blocks=[{columns:1,cells:[[{type:'comments'}]]}];
  const pages=['en','zh-SG'].map(locale=>({kind:'pages',bundlePath:'home',title:'Home',locale,path:locale==='en'?'':locale+'/',homepage:true,blocks}));
  const routes=await generateBuiltinRoutes({posts:[],pages},config,{filter:async(_key,value)=>value});
  assert.match(routes.find(route=>route.path==='index.html').body,/data-comments-thread="page:home"/);
  assert.deepEqual(JSON.parse(routes.find(route=>route.path==='edgepress/comment-threads.json').body),[{thread:'page:home',title:'Home'}]);
  const duplicate=[{columns:1,cells:[[{type:'comments'},{type:'comments'}]]}];
  await assert.rejects(renderBlocks(duplicate,{config,locale:'en',document:pages[0],site:{posts:[]}}),/only one/);
});
