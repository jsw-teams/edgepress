import { access, readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSite } from './build.js';
import { loadConfig } from './config.js';
import { checkPages } from './page-check.js';

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

function cliArgs(args) {
  const options = [...args];
  if (!options.some((value) => value === '--ip' || value.startsWith('--ip='))) options.push('--ip', '127.0.0.1');
  if (!options.some((value) => value === '--port' || value.startsWith('--port='))) options.push('--port', '8787');
  return options;
}

async function main() {
  const config = await loadConfig();
  const root = config.root;
  const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
  await access(wrangler);

  async function rebuild() {
    await buildSite(root, { preview: true });
    const currentConfig = await loadConfig(root);
    const report = await checkPages(currentConfig);
    console.log('Accessibility and agent-friendliness PDF report: ' + report.status +
      ' (' + report.accessibility.status + ', ' + report.agentFriendliness.status + ')');
  }

  await rebuild();
  let snapshot = await sourceSnapshot(root);
  const commandOffset = ['preview', 'dev', 'server'].includes(process.argv[2]) ? 3 : 2;
  const args = [wrangler, 'dev', ...cliArgs(process.argv.slice(commandOffset))];
  let child;
  let stopped = false;
  let restarting = false;
  let scanning = false;
  let rebuilding = false;
  let rebuildAgain = false;
  let debounce;

  function startWrangler() {
    if (stopped) return;
    child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
    const started = child;
    started.once('error', (error) => {
      console.error('Could not start Wrangler preview: ' + error.message);
      if (!restarting) stop();
      process.exitCode = 1;
    });
    started.once('exit', (code) => {
      if (child === started) child = null;
      if (stopped || restarting) return;
      console.error('Wrangler preview exited' + (code === null ? '' : ' with code ' + code) + '.');
      stop();
      if (code !== 0) process.exitCode = code ?? 1;
    });
  }

  async function stopWrangler() {
    const current = child;
    child = null;
    if (!current || current.exitCode !== null || current.signalCode !== null) return;
    await new Promise((resolveExit) => {
      const timeout = setTimeout(() => {
        if (current.exitCode === null) current.kill('SIGKILL');
        resolveExit();
      }, 5000);
      current.once('exit', () => {
        clearTimeout(timeout);
        resolveExit();
      });
      current.kill();
    });
  }

  startWrangler();

  async function scheduleBuild() {
    if (stopped) return;
    if (rebuilding) {
      rebuildAgain = true;
      return;
    }
    rebuilding = true;
    do {
      rebuildAgain = false;
      restarting = true;
      try {
        await stopWrangler();
        await rebuild();
      } catch (error) {
        console.error('Preview rebuild failed; the last successful output remains available.\n' + (error?.stack || error));
      } finally {
        restarting = false;
        startWrangler();
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
        debounce = setTimeout(scheduleBuild, 400);
      }
    } catch (error) {
      console.error('Preview source scan failed: ' + error.message);
    } finally {
      scanning = false;
    }
  }, 900);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(poll);
    clearTimeout(debounce);
    void stopWrangler();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
