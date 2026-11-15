import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const testsDirectory = resolve(root, 'tests');
const mode = process.argv.includes('--browser') ? 'browser' : 'unit';
const files = (await readdir(testsDirectory))
  .filter(file => file.endsWith('.test.mjs'))
  .sort();
const browserPattern = /(?:from\s*['"]playwright['"]|require\(\s*['"]playwright['"]\s*\))/;
const selected = [];
for (const file of files) {
  const source = await readFile(resolve(testsDirectory, file), 'utf8');
  if (browserPattern.test(source) === (mode === 'browser')) selected.push(resolve(testsDirectory, file));
}

if (mode === 'browser') {
  try { await import('playwright'); }
  catch {
    console.error('Optional browser tests need Playwright. Install it locally with `npm install --no-save --package-lock=false playwright`, then install the browsers you want to test.');
    process.exit(2);
  }
}

if (!selected.length) {
  console.error(`No ${mode} test files were found.`);
  process.exit(2);
}

console.log(`Running ${selected.length} ${mode} test files${mode === 'browser' ? ' (optional)' : ''}.`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...selected], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true
});
process.exit(result.status ?? 1);
