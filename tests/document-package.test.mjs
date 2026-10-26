import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

test('cloud dependency follows published release ranges and excludes the removed PPT engine', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const source = manifest.dependencies['@jsw-teams/document-viewer'];
  assert.match(source, /^git\+https:\/\/github\.com\/jsw-teams\/document-viewer\.git#semver:\^2026\.10\.1$/);
  assert.ok(!manifest.files.includes('vendor'));
  assert.match(manifest.overrides['@file-viewer/doc'].dompurify,/^\^3\./);
  const require = createRequire(import.meta.url);
  const root = resolve(dirname(require.resolve('@jsw-teams/document-viewer')), '..');
  const component = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.ok(!component.dependencies['@file-viewer/ppt']);
  assert.match(component.dependencies.cfb, /^\^1\./);
  for (const path of ['src/ppt/parser.js', 'src/ppt/worker.js', 'src/renderers/ppt.js', 'src/icons.js', 'src/sheets/columns.js', 'src/sheets/column-controls.js', 'src/lucide-license.txt', 'tools/assets.mjs', 'NOTICE.md']) {
    const content = await readFile(resolve(root, path), 'utf8');
    assert.ok(content.length);
    if (/\.(?:js|mjs)$/.test(path)) assert.doesNotMatch(content, /@file-viewer\/ppt|__DOCUMENT_PPT_ASSETS__|Flyfish Viewer|vendor-ppt|soffice/);
  }
});
