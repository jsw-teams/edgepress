import { builtinImageViewerAssets, builtinMediaViewerAssets } from './lib/viewers.js';
import { minifyCss } from './lib/css-tools.js';
import { minifyJs } from './lib/js-tools.js';

function minifyDescriptor(item) {
  const text = item.content.toString('utf8');
  const code = item.path.endsWith('.css') ? minifyCss(text) : minifyJs(text);
  return { ...item, content: Buffer.from(code, 'utf8') };
}

export async function imageViewerAssets() {
  return builtinImageViewerAssets().map(minifyDescriptor);
}

export async function mediaViewerAssets() {
  return builtinMediaViewerAssets().map(minifyDescriptor);
}
