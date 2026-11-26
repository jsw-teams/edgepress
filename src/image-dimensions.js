import { readFile } from 'node:fs/promises';
import { imageSize } from './lib/image-size.js';
import { mapLimit } from './concurrency.js';

export async function collectImageDimensions(assets) {
  const result = new Map();
  await mapLimit(assets.filter(item => /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(item.path)), 8, async item => {
    try {
      let { width, height, orientation } = imageSize(item.content ?? await readFile(item.source));
      if ([5, 6, 7, 8].includes(orientation)) [width, height] = [height, width];
      if (width > 0 && height > 0) result.set('/' + item.path, { width, height });
    } catch {}
  });
  return result;
}

export function reserveImageDimensions(html, dimensions, path, origin) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const value = name => tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i'))?.[1];
    const src = value('src');
    if (!src) return tag;
    let url, key;
    try {
      url = new URL(src, new URL('/' + path, origin));
      key = decodeURI(url.pathname);
    } catch { return tag; }
    if (url.origin !== new URL(origin).origin) return tag;
    const size = dimensions.get(key);
    if (!size) return tag;
    const w = Number(value('width'));
    const h = Number(value('height'));
    if (w > 0 && h > 0) return tag;
    const additions = [];
    if (!value('width')) additions.push('width="' + Math.max(1, Math.round(h > 0 ? h * size.width / size.height : size.width)) + '"');
    if (!value('height')) additions.push('height="' + Math.max(1, Math.round(w > 0 ? w * size.height / size.width : size.height)) + '"');
    if (!additions.length) return tag;
    return tag.replace(/\s*\/?>$/, end => ' ' + additions.join(' ') + end);
  });
}

export function enhanceImageAttributes(html) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const value = name => tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i'))?.[1];
    if (!value('src')) return tag;
    const additions = [];
    if (!/\sdecoding\s*=/i.test(tag)) additions.push('decoding="async"');
    const cls = value('class') || '';
    const isCritical = value('fetchpriority') === 'high' || /\b(?:brand-mark|navigation-icon|hero-banner|hero-mascot)\b/.test(cls);
    if (!isCritical && !/\sloading\s*=/i.test(tag)) additions.push('loading="lazy"');
    if (!additions.length) return tag;
    return tag.replace(/\s*\/?>$/, end => ' ' + additions.join(' ') + end);
  });
}
