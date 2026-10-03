// CSP permission is not consent. Loaders still wait for the visitor's stored choice.
export function extendConsentPolicy(headers, config) {
  const services=config.browserPlugins.services.filter(service => service.enabled !== false && ['external-widget','external-api','oembed'].includes(service.provider));
  if (!services.length) return headers;
  const origins=(provider, field)=>[...new Set(services.filter(service=>service.provider===provider).map(service=>new URL(service[field]).origin))];
  const embedded=services.filter(service=>service.provider==='oembed');
  const media=embedded.flatMap(service=>service.embedOrigins || [new URL(service.backendUrl).origin]);
  const scripts=[...origins('external-widget','moduleUrl'),...embedded.flatMap(service=>(service.embedScripts || []).length?[...(service.embedScripts || []).map(value=>new URL(value).origin),...(service.embedOrigins || [])]:[])];
  const connections=[...services.map(service=>new URL(service.backendUrl).origin),...media];
  const frames=[...origins('external-widget','backendUrl'),...media];
  return headers.replace(/(Content-Security-Policy:\s*)([^\r\n]+)/gi, (_match,prefix,policy)=>{
    const directives=new Map(policy.split(';').map(value=>value.trim().split(/\s+/)).filter(parts=>parts[0]).map(([name,...sources])=>[name,sources]));
    for(const [name,sources] of [['script-src',scripts],['connect-src',connections],['frame-src',frames],['img-src',media]]) {
      if (!sources.length) continue;
      const inherited=directives.get(name) || directives.get('default-src') || ["'self'"];
      directives.set(name,[...new Set([...inherited.filter(source=>source!=="'none'"),...sources])]);
    }
    return prefix+[...directives].map(([name,sources])=>name+' '+sources.join(' ')).join('; ');
  });
}
