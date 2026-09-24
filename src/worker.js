const MAX_BACKEND_BODY_BYTES = 1_000_000;

const json = (data, status = 200, headers = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers }
});

async function readBoundedBody(body, limit) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function backendEndpoint(baseValue, requestUrl) {
  let endpoint;
  try { endpoint = new URL(baseValue); } catch { return null; }
  const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if ((!['https:', 'http:'].includes(endpoint.protocol) || (endpoint.protocol !== 'https:' && !localHttp)) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
  const incoming = new URL(requestUrl);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  endpoint.pathname = basePath + incoming.pathname;
  endpoint.search = incoming.search;
  endpoint.hash = '';
  return endpoint;
}

async function readApiBody(request) {
  if (!request.body) return new Uint8Array();
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) return { error: 'invalid_content_length', status: 400 };
    if (length > MAX_BACKEND_BODY_BYTES) return { error: 'payload_too_large', status: 413 };
  }
  const body = await readBoundedBody(request.body, MAX_BACKEND_BODY_BYTES);
  return body === null ? { error: 'payload_too_large', status: 413 } : body;
}

async function proxyConfiguredBackend(request, env, requestUrl) {
  const endpoint = backendEndpoint(env.BACKEND_URL, requestUrl);
  if (!endpoint || typeof env.BACKEND_TOKEN !== 'string' || !env.BACKEND_TOKEN.trim()) {
    return json({ error: 'backend_unavailable' }, 503);
  }
  const body = await readApiBody(request);
  if (body?.error) return json({ error: body.error }, body.status);
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'content-type', 'if-match', 'if-none-match']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set('authorization', 'Bearer ' + env.BACKEND_TOKEN);
  const upstream = new Request(endpoint, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : body,
    redirect: 'manual'
  });
  return await noStore(await fetch(upstream));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') {
        return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
      }
      return json({ status: 'ok', service: 'edgepress' });
    }

    if (url.pathname.startsWith('/api/v1/')) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, PUT, PATCH, DELETE' });
      }
      if (request.body && request.method === 'GET') return json({ error: 'body_not_allowed' }, 400);
      if (env.BACKEND) {
        const body = await readApiBody(request);
        if (body?.error) return json({ error: body.error }, body.status);
        const backendRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body ? body : undefined
        });
        return await noStore(await env.BACKEND.fetch(backendRequest));
      }
      if (env.BACKEND_URL || env.BACKEND_TOKEN) return await proxyConfiguredBackend(request, env, request.url);
      return json({ error: 'backend_unavailable' }, 503);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 403 || /(?:^|\/)403\.html$/i.test(url.pathname)) return assetResponse;
    const locale = url.pathname.match(/^\/([A-Za-z0-9-]+)\//)?.[1];
    const errorPaths = [locale ? '/' + locale + '/403.html' : '', '/403.html'].filter(Boolean);
    for (const path of [...new Set(errorPaths)]) {
      const errorPage = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
      if (!errorPage.ok) continue;
      const headers = new Headers(errorPage.headers);
      headers.set('Cache-Control', 'no-store');
      headers.delete('Content-Length');
      return new Response(errorPage.body, { status: 403, headers });
    }
    return assetResponse;
  }
};
