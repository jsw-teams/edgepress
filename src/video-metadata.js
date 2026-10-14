import {readFile} from 'node:fs/promises';
import {posix} from 'node:path';

// Offline-generated sidecars keep duration and posters available without requesting media.
export async function collectVideoMetadata(assets) {
  const known = new Map(assets.map(item => [item.path, item])), result = new Map();
  for (const video of assets.filter(item => /\.(?:mp4|webm|ogv|ogg)$/i.test(item.path))) {
    const sidecar = known.get(video.path + '.json');
    if (!sidecar) continue;
    const data = JSON.parse((sidecar.content ?? await readFile(sidecar.source)).toString());
    const duration = Number(data.duration), width = Number(data.width), height = Number(data.height);
    if (![duration, width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid video metadata: ' + sidecar.path);
    if (typeof data.poster !== 'string' || /[\\?#\x00-\x1f]|^[a-z]+:|^\/\//i.test(data.poster)) throw new Error('Invalid video poster: ' + sidecar.path);
    const poster = posix.normalize(posix.join(posix.dirname(video.path), data.poster));
    if (!known.has(poster) || !/\.(?:jpe?g|png|webp|avif)$/i.test(poster)) throw new Error('Missing local video poster: ' + sidecar.path);
    result.set('/' + video.path, {duration, width, height, poster: '/' + poster});
  }
  return result;
}

export function reserveVideoMetadata(html, metadata, path, origin) {
  return html.replace(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi, (tag, attributes, content) => {
    const src = attributes.match(/\ssrc=["']([^"']+)["']/i)?.[1] ?? content.match(/<source\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
    if (!src) return tag;
    let url;
    try { url = new URL(src.replaceAll('&amp;', '&'), new URL('/' + path, origin)); } catch { return tag; }
    if (url.origin !== new URL(origin).origin) return tag;
    const data = metadata.get(decodeURI(url.pathname));
    if (!data) return tag;
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    for (const [name, value] of Object.entries({'data-duration': data.duration, poster: data.poster, width: data.width, height: data.height})) {
      if (!new RegExp('\\s' + name + '\\s*=', 'i').test(attributes)) attributes += ' ' + name + '="' + escape(value) + '"';
    }
    return '<video' + attributes + '>' + content + '</video>';
  });
}
