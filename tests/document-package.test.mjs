import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

test('cloud dependency is pinned to a published source commit and excludes the removed PPT engine', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const source = manifest.dependencies['@jsw-teams/document-viewer'];
  assert.match(source, /^https:\/\/codeload\.github\.com\/jsw-teams\/document-viewer\/tar\.gz\/[a-f0-9]{40}$/);
  assert.equal(lock.packages['node_modules/@jsw-teams/document-viewer'].resolved, source);
  assert.ok(!manifest.files.includes('vendor'));
  assert.ok(!lock.packages['node_modules/@file-viewer/ppt']);
  assert.equal(manifest.overrides['@file-viewer/doc'].dompurify, '3.4.16');
  const sanitizerVersions = Object.entries(lock.packages).filter(([path]) => path.endsWith('node_modules/dompurify')).map(([, dependency]) => dependency.version);
  assert.deepEqual(sanitizerVersions, ['3.4.16']);
  const require = createRequire(import.meta.url);
  const root = resolve(dirname(require.resolve('@jsw-teams/document-viewer')), '..');
  const component = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.ok(!component.dependencies['@file-viewer/ppt']);
  assert.equal(component.dependencies.cfb, '1.2.2');
  for (const path of ['src/ppt/parser.js', 'src/ppt/worker.js', 'src/renderers/ppt.js', 'src/icons.js', 'src/sheets/columns.js', 'src/sheets/column-controls.js', 'src/lucide-license.txt', 'tools/assets.mjs', 'NOTICE.md']) {
    const content = await readFile(resolve(root, path), 'utf8');
    assert.ok(content.length);
    if (/\.(?:js|mjs)$/.test(path)) assert.doesNotMatch(content, /@file-viewer\/ppt|__DOCUMENT_PPT_ASSETS__|Flyfish Viewer|vendor-ppt|soffice/);
  }
});
