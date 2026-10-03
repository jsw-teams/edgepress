const storageKey='edgepress-privacy-selection', cookieKey='edgepress_privacy_choice';
const stable=value=>Array.isArray(value)?value.map(stable):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export function choiceSnapshot(privacy, siteOrigin='') {
  try {siteOrigin=new URL(siteOrigin).origin;}catch{}
  const consent=privacy.consent || {};
  const services=(privacy.integrations || []).map(service=>{
    const presentation=new Set(['name','purpose','dataCategories','recipient','retention']);
    const value=Object.fromEntries(Object.entries(service).filter(([key])=>!presentation.has(key)));
    return value;
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(stable({controller:privacy.controller,policyUrl:privacy.policyUrl,consent,integrations:services}));
}
export function makeChoice(config, allowed) {
  const consent=config.privacy?.consent || {};
  return {proposedDate:consent.proposedDate || '',effectiveDate:consent.effectiveDate || '',fingerprint:config.choiceFingerprint || choiceSnapshot(config.privacy),
    expiresAt:Date.now()+consent.expiresDays*86400000,updatedAt:Date.now(),allowed:[...new Set(allowed)]};
}
export function readChoice(config) {
  const candidates=[];
  for(const storage of ['localStorage','sessionStorage']) {
    try {candidates.push(JSON.parse(globalThis[storage].getItem(storageKey)));}catch{}
  }
  try {const cookie=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieKey+'='));if(cookie)candidates.push(JSON.parse(decodeURIComponent(cookie.slice(cookieKey.length+1))));}catch{}
  const consent=config.privacy?.consent || {}, validIds=new Set((config.privacy?.integrations || []).map(item=>item.id));
  for(const saved of candidates.filter(Boolean).sort((a,b)=>(b.updatedAt || 0)-(a.updatedAt || 0))) {
    if(saved.proposedDate!==(consent.proposedDate || '') || saved.effectiveDate!==(consent.effectiveDate || '') || !Number.isFinite(saved.expiresAt) || saved.expiresAt<=Date.now() || !Array.isArray(saved.allowed))continue;
    let matches=saved.fingerprint===(config.choiceFingerprint || choiceSnapshot(config.privacy));
    if(!matches && typeof saved.fingerprint==='string' && saved.fingerprint.startsWith('{')) {
      try {matches=choiceSnapshot(JSON.parse(saved.fingerprint),config.siteOrigin)===config.choiceSnapshot;}catch{}
    }
    if(!matches)continue;
    saved.allowed=saved.allowed.filter(id=>validIds.has(id));
    if(saved.fingerprint!==config.choiceFingerprint){saved.fingerprint=config.choiceFingerprint;persistChoice(saved);}
    return saved;
  }
  return null;
}
export function persistChoice(choice) {
  const value=JSON.stringify(choice);
  let saved=false;
  try {localStorage.setItem(storageKey,value);saved=localStorage.getItem(storageKey)===value;}catch{}
  try {sessionStorage.setItem(storageKey,value);}catch{}
  try {
    // Use a small essential cookie only if persistent local storage is unavailable.
    document.cookie=cookieKey+'='+(saved?'':encodeURIComponent(value))+'; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')+'; Max-Age='+(saved?0:Math.max(0,Math.floor((choice.expiresAt-Date.now())/1000)));
  }catch{}
}
