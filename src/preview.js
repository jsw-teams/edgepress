import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSite } from './build.js';
import { loadConfig } from './config.js';
import { previewOptions, startPreviewServer } from './preview-server.js';

const watchedDirectories = ['content', 'languages', 'plugins', 'src', 'static', 'themes'];
const watchedFiles = ['config.yml', 'edgepress.config.mjs', 'wrangler.jsonc'];
const ignoredNames = new Set(['.edgepress', '.git', '.wrangler', 'dist', 'node_modules', 'tools']);

async function sourceSnapshot(root) {
  const values = [];
  for (const name of watchedFiles) {
    try {
      const info = await stat(resolve(root, name));
      values.push(name + ':' + info.size + ':' + info.mtimeMs);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      values.push(name + ':missing');
    }
  }
  async function visit(directory, relativePath) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ignoredNames.has(entry.name)) continue;
      const file = resolve(directory, entry.name);
      const relativeFile = relativePath ? relativePath + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(file, relativeFile);
      else if (entry.isFile()) {
        const info = await stat(file);
        values.push(relativeFile + ':' + info.size + ':' + info.mtimeMs);
      }
    }
  }
  for (const name of watchedDirectories) await visit(resolve(root, name), name);
  return values.join('\n');
}

export async function startPreview(options = []) {
  const { port } = previewOptions(options);
  const config = await loadConfig();
  const root = config.root;
  const outputDir = config.resolvedPaths.output;

  async function rebuild() {
    await buildSite(root, { preview: true });
  }

  await rebuild();
  let snapshot = await sourceSnapshot(root);
  const preview = await startPreviewServer({
    root,
    port,
    outputDir,
    locales: config.i18n.locales,
    defaultLocale: config.i18n.defaultLocale
  });
  console.log('Local preview: http://127.0.0.1:' + port + '/');
  console.log('Pages editor: ' + preview.url + ' (Ctrl+C to stop)');
  let stopped = false;
  let scanning = false;
  let rebuilding = false;
  let rebuildAgain = false;
  let debounce;

  async function scheduleBuild() {
    if (stopped) return;
    if (rebuilding) {
      rebuildAgain = true;
      return;
    }
    rebuilding = true;
    do {
      rebuildAgain = false;
      try {
        await rebuild();
      } catch (error) {
        console.error('Preview rebuild failed; the last successful output remains available.\n' + (error?.stack || error));
      }
    } while (rebuildAgain && !stopped);
    rebuilding = false;
  }

  const poll = setInterval(async () => {
    if (scanning || stopped) return;
    scanning = true;
    try {
      const next = await sourceSnapshot(root);
      if (next !== snapshot) {
        snapshot = next;
        clearTimeout(debounce);
        debounce = setTimeout(scheduleBuild, 300);
      }
    } catch (error) {
      console.error('Preview source scan failed: ' + error.message);
    } finally {
      scanning = false;
    }
  }, 800);

  async function stop() {
    if (stopped) return;
    stopped = true;
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    clearInterval(poll);
    clearTimeout(debounce);
    await preview.close();
    while (rebuilding || scanning) await new Promise(done => setTimeout(done, 50));
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return { url: 'http://127.0.0.1:' + port + '/', editorUrl: preview.url, close: stop };
}
