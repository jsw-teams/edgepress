import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { builtinDocumentViewerAssets, builtinImageViewerAssets, builtinMediaViewerAssets } from '../src/lib/viewers.js';

test('EdgePress ships with zero runtime dependencies and built-in lightweight viewers', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.dependencies || {}, {});
  assert.ok(!manifest.files.includes('vendor'));
  for (const assets of [builtinDocumentViewerAssets(), builtinImageViewerAssets(), builtinMediaViewerAssets()]) {
    assert.ok(assets.length > 0);
    for (const asset of assets) {
      assert.ok(asset.path && asset.content.length > 0);
      assert.doesNotMatch(asset.content.toString('utf8'), /@file-viewer\/ppt|__DOCUMENT_PPT_ASSETS__|Flyfish Viewer|vendor-ppt|soffice/);
    }
  }
});
