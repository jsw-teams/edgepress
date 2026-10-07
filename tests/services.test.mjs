import test from 'node:test';
import assert from 'node:assert/strict';
import {callService} from '../static/edgepress/services.js';
import {choiceSnapshot} from '../static/edgepress/plugins/consent/choices.js';
import {extendConsentPolicy} from '../src/consent-csp.js';
import {deploymentCommand} from '../src/deploy.js';

test('optional API calls use a fixed endpoint and header actions after current service consent',async()=>{
  const names=['document','localStorage','sessionStorage','fetch'];
  const original=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const privacy={controller:{name:'Publisher',contact:'publisher@example.com'},policyUrl:'/privacy/',consent:{proposedDate:'2026-10-03',expiresDays:180},integrations:[{id:'lookup',provider:'external-api',backendUrl:'https://service.example/backend/cloudflare/'}]};
  const config={privacy,choiceFingerprint:choiceSnapshot(privacy)};
  let saved=null,calls=0;
  try {
    globalThis.document={getElementById:()=>({textContent:JSON.stringify(config)}),cookie:''};
    globalThis.localStorage=globalThis.sessionStorage={getItem:()=>saved};
    globalThis.fetch=async(address,options)=>{calls++;assert.equal(address.href,'https://service.example/backend/cloudflare/');assert.equal(options.credentials,'omit');assert.equal(options.headers.get('X-Service-Action'),'resolve');assert.equal(options.headers.get('X-Service-Context'),'example.com');return Response.json({ok:true});};
    await assert.rejects(callService('lookup','resolve',{headers:{'X-Service-Context':'example.com'}}),/consent/);assert.equal(calls,0);
    saved=JSON.stringify({proposedDate:'2026-10-03',effectiveDate:'',fingerprint:config.choiceFingerprint,expiresAt:Date.now()+60000,allowed:['lookup']});
    await callService('lookup','resolve',{headers:{'X-Service-Context':'example.com'}});assert.equal(calls,1);
    for(const path of ['https://attacker.example','//attacker.example','../private','%2e%2e/private','\\private'])await assert.rejects(callService('lookup',path));
    config.privacy.integrations[0].backendUrl='https://changed.example/';config.choiceFingerprint=choiceSnapshot(config.privacy);
    await assert.rejects(callService('lookup','resolve'),/consent/);assert.equal(calls,1);
  }finally{for(const [name,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});

test('CSP permits only enabled configured service origins and deployment selects native static CLIs',()=>{
  assert.deepEqual(deploymentCommand('netlify','dist'),['netlify-cli','deploy','--prod','--dir','dist']);
  const header="/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'none'";
  const services=[{enabled:false,provider:'external-widget',moduleUrl:'https://comments.example/widget.js',backendUrl:'https://comments.example'}];
  assert.equal(extendConsentPolicy(header,{browserPlugins:{services}}),header);
  services[0].enabled=true;const policy=extendConsentPolicy(header,{browserPlugins:{services}});
  assert.match(policy,/script-src 'self' https:\/\/comments.example/);assert.match(policy,/frame-src 'self' https:\/\/comments.example/);assert.doesNotMatch(policy,/connect-src 'none'/);
  assert.deepEqual(deploymentCommand('vercel'),['vercel','deploy','--prod']);assert.deepEqual(deploymentCommand('edgeone','dist',['-n','site']),['edgeone','pages','deploy','dist','-n','site']);assert.throws(()=>deploymentCommand('invalid'),/Platform/);
});
