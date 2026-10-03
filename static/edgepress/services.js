import {readChoice} from './plugins/consent/choices.js';
export async function callService(id, action, options = {}) {
  const config = JSON.parse(document.getElementById('edgepress-privacy-config')?.textContent || '{}');
  const service = config.privacy?.integrations?.find(item => item.id === id && item.provider === 'external-api');
  if (!service || !readChoice(config)?.allowed.includes(id)) throw new Error('Service requires visitor consent: ' + id);
  const base = new URL(service.backendUrl);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Invalid service URL');
  if (typeof action !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(action)) throw new Error('Invalid service action');
  if (base.search || base.hash) throw new Error('Service endpoint must not contain a query or fragment');
  const endpoint = base.pathname === '/' ? new URL('/api', base) : base;
  const headers = new Headers(options.headers);
  headers.set('X-Service-Action', action);
  // Visitors authenticate with the service. Operator secrets never enter config.yml.
  return fetch(endpoint, {...options, headers, cache:'no-store', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer'});
}
