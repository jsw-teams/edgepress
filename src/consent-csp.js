// Network permission is not consent: browser loaders still require the visitor's choice.
const defaults = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
const providers = {
  'cloudflare-web-analytics': {script:['https://static.cloudflareinsights.com'],connect:['https://cloudflareinsights.com']},
  'google-analytics': {script:['https://www.googletagmanager.com'],connect:['https://*.google-analytics.com','https://*.analytics.google.com','https://www.googletagmanager.com'],img:['https://*.google-analytics.com']},
  'baidu-tongji': {script:['https://hm.baidu.com'],connect:['https://hm.baidu.com'],img:['https://hm.baidu.com']},
  'google-tag-manager': {script:['https://www.googletagmanager.com'],connect:['https://www.googletagmanager.com']},
  'meta-pixel': {script:['https://connect.facebook.net'],connect:['https://www.facebook.com'],img:['https://www.facebook.com']},
  'cloudflare-turnstile': {script:['https://challenges.cloudflare.com'],connect:['https://challenges.cloudflare.com'],frame:['https://challenges.cloudflare.com']},
  'google-recaptcha': {script:['https://www.google.com','https://www.gstatic.com'],connect:['https://www.google.com','https://www.gstatic.com'],frame:['https://www.google.com','https://recaptcha.google.com']},
  'hcaptcha': {script:['https://js.hcaptcha.com','https://*.hcaptcha.com'],connect:['https://hcaptcha.com','https://*.hcaptcha.com'],frame:['https://hcaptcha.com','https://*.hcaptcha.com'],style:['https://*.hcaptcha.com']},
  'google-adsense': {script:['https://pagead2.googlesyndication.com','https://*.googlesyndication.com','https://*.doubleclick.net'],connect:['https://*.googlesyndication.com','https://*.doubleclick.net','https://www.google.com'],frame:['https://*.googlesyndication.com','https://*.doubleclick.net','https://www.google.com'],img:['https://*.googlesyndication.com','https://*.doubleclick.net','https://www.google.com']}
};
const directiveNames = new Set(['script-src','connect-src','frame-src','img-src','style-src','font-src','media-src','worker-src']);
export function validateServiceCsp(service) {
  if (service.csp === undefined) return;
  if (!service.csp || typeof service.csp !== 'object' || Array.isArray(service.csp)) throw new Error('Service csp must be a directive map');
  for (const [name,sources] of Object.entries(service.csp)) {
    if (!directiveNames.has(name) || !Array.isArray(sources) || sources.length > 24 || sources.some(source => typeof source !== 'string' || !/^https:\/\/(?:\*\.)?[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(source))) throw new Error('Service csp needs supported directives and HTTPS origins');
  }
}
function permissions(config) {
  const result = new Map();
  const add=(name,values)=>result.set(name,[...new Set([...(result.get(name)||[]),...values])]);
  for (const service of config.browserPlugins?.services || []) {
    if (service.enabled === false || config.browserPlugins?.consent?.enabled === false) continue;
    for (const [name,values] of Object.entries(providers[service.provider] || {})) add(name+'-src',values);
    if (['external-widget','external-api','oembed'].includes(service.provider)) {
      const backend=new URL(service.backendUrl).origin;
      add('connect-src',[backend]);
      if (service.provider==='external-widget') {add('script-src',[new URL(service.moduleUrl).origin]);add('frame-src',[backend]);}
      if (service.provider==='oembed') {
        const media=service.embedOrigins || [backend];
        for (const name of ['frame-src','img-src','connect-src','media-src']) add(name,media);
        if (service.embedScripts?.length) {add('script-src',[...service.embedScripts.map(value=>new URL(value).origin),...media]);add('style-src',media);}
      }
    }
    validateServiceCsp(service);
    for(const [name,values] of Object.entries(service.csp || {})) add(name,values);
  }
  for(const [name,values] of Object.entries(config.contentCsp || {})) add(name,values);
  return result;
}
function extend(policy,config) {
  const directives=new Map(policy.split(';').map(value=>value.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...sources])=>[name,sources]));
  for(const [name,sources] of permissions(config)) {
    if (!sources.length) continue;
    const inherited=directives.get(name) || directives.get('default-src') || ["'self'"];
    directives.set(name,[...new Set([...inherited.filter(source=>source!=="'none'"),...sources])]);
  }
  return [...directives].map(([name,sources])=>name+' '+sources.join(' ')).join('; ');
}
export function extendConsentPolicy(headers,config) {
  if (!globalPolicy(headers)) headers += '\n\n/*\n  Content-Security-Policy: '+defaults;
  return headers.replace(/(Content-Security-Policy:\s*)([^\r\n]+)/gi,(_match,prefix,policy)=>prefix+extend(policy,config));
}
// Content images/videos are independent of optional services. Inert embed metadata
// must never expand the allowlist, especially when a service has been disabled.
export function contentPermissions(routes) {
  const result={};
  for(const route of routes) {
    if(route.contentType && !/^text\/html\b/i.test(route.contentType))continue;
    const html=route.body.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    if (/data-edgepress-document(?:\s|=|>)/i.test(html)) {
      result['script-src'] = ["'wasm-unsafe-eval'"];
      result['font-src'] = ['blob:'];
    }
    for(const match of html.matchAll(/<(img|video|audio|source)\b[^>]*\bsrc\s*=\s*["'](https:\/\/[^"']+)["']/gi)) {
      try {const origin=new URL(match[2]).origin;const name=match[1].toLowerCase()==='img'?'img-src':'media-src';result[name]=[...new Set([...(result[name]||[]),origin])];}catch{}
    }
    for(const match of html.matchAll(/<img\b[^>]*\bdata-original\s*=\s*["'](https:\/\/[^"']+)["']/gi)){try{const origin=new URL(match[1]).origin;result['img-src']=[...new Set([...(result['img-src']||[]),origin])];}catch{}}
  }
  return result;
}
export function injectConsentPolicy(html,headers) {
  if (!/^\s*(?:<!doctype html>\s*)?<html\b/i.test(html) || !/<head\b/i.test(html)) return html;
  // Use the global source policy when provided (e.g. first-party upload endpoints).
  let policy=globalPolicy(headers);
  if (!policy) return html;
  policy=policy.split(';').filter(part=>!/^\s*(?:frame-ancestors|sandbox|report-uri|report-to)\b/i.test(part)).join(';');
  const escaped=policy.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return html.replace(/<head\b[^>]*>/i,head=>head+'\n<meta http-equiv="Content-Security-Policy" content="'+escaped+'">');
}
function globalPolicy(headers) {
  let scope='';
  for(const line of headers.split(/\r?\n/)){if(line&&!/^\s/.test(line))scope=line.trim();else if(scope==='/*'&&/^\s*Content-Security-Policy:/i.test(line))return line.replace(/^\s*Content-Security-Policy:\s*/i,'');}
}
// Static hosts join repeated header values with commas. CSP treats each value
// as a separate policy, so first expand default fallbacks, then partition only
// disjoint directives. Splitting an origin list would incorrectly intersect it.
export function serializeConsentHeaders(headers) {
  return headers.replace(/^([ \t]*Content-Security-Policy:[ \t]*)([^\r\n]+)$/gim,(line,prefix,policy)=>{
    if(line.length<=2000)return line;
    const directives=new Map(policy.split(';').map(part=>part.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...sources])=>[name,sources]));
    const fallback=directives.get('default-src');
    if(fallback) {
      for(const name of ['script-src','style-src','img-src','connect-src','font-src','media-src','frame-src','worker-src','manifest-src','child-src','object-src']) {
        if(directives.has(name))continue;
        const inherited=name==='worker-src'?(directives.get('child-src')||directives.get('script-src')||fallback):name==='frame-src'?(directives.get('child-src')||fallback):fallback;
        directives.set(name,inherited);
      }
      directives.delete('default-src');
    }
    // child-src only supplies frame/worker fallbacks. Separate policies would
    // apply those fallbacks again and incorrectly block explicit permissions.
    const child=directives.get('child-src');
    if(child){if(!directives.has('frame-src'))directives.set('frame-src',child);if(!directives.has('worker-src'))directives.set('worker-src',child);directives.delete('child-src');}
    const groups=[];
    for(const names of [['script-src','script-src-elem','script-src-attr','worker-src'],['style-src','style-src-elem','style-src-attr']]) {
      const parts=[];
      for(const name of names){if(directives.has(name)){parts.push(name+' '+directives.get(name).join(' '));directives.delete(name);}}
      if(parts.length)groups.push(parts.join('; '));
    }
    for(const [name,sources] of directives)groups.push(name+' '+sources.join(' '));
    const chunks=[];let chunk='';
    for(const directive of groups) {
      if(prefix.length+directive.length>2000)throw new Error('CSP directive group exceeds the static host line limit; reduce its configured origins.');
      if(prefix.length+chunk.length+(chunk?2:0)+directive.length>2000){chunks.push(prefix+chunk);chunk='';}
      chunk+=(chunk?'; ':'')+directive;
    }
    if(chunk)chunks.push(prefix+chunk);
    return chunks.join('\n');
  });
}
