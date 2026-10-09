export function linkOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Trusted sites must be exact HTTP(S) origins, without credentials, paths or wildcards');
  return url.origin;
}

export function classifyLink(value, settings, base) {
  let url;
  try { url = new URL(value, base); } catch { return { kind: 'blocked' }; }
  if (['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'filesystem:', 'about:'].includes(url.protocol) || url.username || url.password) return { kind: 'blocked' };
  if (!['http:', 'https:'].includes(url.protocol)) return { kind: 'native' };
  const origins = new Set([new URL(settings.siteUrl).origin, ...settings.trustedOrigins]);
  return { kind: origins.has(url.origin) ? 'native' : 'external', url: url.href, domain: url.host, origin: url.origin };
}
