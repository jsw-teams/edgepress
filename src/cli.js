#!/usr/bin/env node
import { access, cp, lstat, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { acquireBuildLock, buildSite } from './build.js';
import { loadConfig } from './config.js';
import { slugify } from './content.js';
import { checkPages } from './page-check.js';
import { checkCompatibility, writeIterationPlan } from './maintenance.js';

async function initializeProject() {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = process.cwd();
  const directories = ['content', 'languages', 'plugins', 'static', 'themes'];
  const files = ['.gitignore', 'README.md', 'config.yml', 'edgepress.config.mjs', 'project-compatibility.json', 'wrangler.jsonc'];
  const destinations = [...directories, ...files, 'src/worker.js'];
  const existing = [];
  for (const relativePath of destinations) {
    try { await access(resolve(root, relativePath)); existing.push(relativePath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (existing.length) throw new Error('EdgePress init found existing project paths and made no changes: ' + existing.join(', '));

  const packageData = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  const repositoryUrl = packageData.repository?.url;
  if (typeof repositoryUrl !== 'string') throw new Error('EdgePress init needs the project package to declare its GitHub repository.');
  const repository = new URL(repositoryUrl.replace(/\.git$/, ''));
  if (repository.hostname !== 'github.com') throw new Error('EdgePress init needs the project package to declare its GitHub repository.');
  const repositoryPath = repository.pathname.replace(/^\/+|\/+$/g, '');
  const projectManifest = {
    name: 'my-edgepress-site',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      new: 'edgepress new',
      build: 'edgepress build',
      dev: 'edgepress server',
      preview: 'edgepress server',
      check: 'edgepress check',
      doctor: 'edgepress doctor',
      deploy: 'edgepress deploy'
    },
    dependencies: {
      edgepress: 'github:' + repositoryPath + '#v' + packageData.version,
      wrangler: packageData.devDependencies?.wrangler ?? '^4.129.1'
    }
  };
  for (const directory of directories) await cp(resolve(packageRoot, directory), resolve(root, directory), { recursive: true, errorOnExist: true });
  for (const file of files) {
    const source = file === '.gitignore' ? resolve(packageRoot, 'templates/gitignore') : resolve(packageRoot, file);
    await cp(source, resolve(root, file), { errorOnExist: true });
  }
  await mkdir(resolve(root, 'src'), { recursive: true });
  await cp(resolve(packageRoot, 'src/worker.js'), resolve(root, 'src/worker.js'), { errorOnExist: true });
  await writeFile(resolve(root, 'package.json'), JSON.stringify(projectManifest, null, 2) + '\n', { flag: 'wx' });
  console.log('Created an EdgePress site. Next run npm install, then edgepress server.');
}

async function runWrangler(command, args = []) {
  const wrangler = resolve(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');
  await access(wrangler);
  await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [wrangler, command, ...args], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveExit();
      else process.exitCode = code ?? 1, resolveExit();
    });
  });
}

async function runSecurityAudit() {
  await new Promise((resolveExit, reject) => {
    const child = spawn('npm', ['audit', '--audit-level=moderate'], {
      cwd: process.cwd(), env: process.env, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveExit();
      else process.exitCode = code ?? 1, resolveExit();
    });
  });
}

async function manageTheme(args, config) {
  const [action, requested] = args;
  const themesDirectory = resolve(config.root, 'themes');
  const entries = (await readdir(themesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name));
  const installed = [];
  for (const entry of entries) {
    try {
      const metadata = JSON.parse(await readFile(resolve(themesDirectory, entry.name, 'theme.json'), 'utf8'));
      installed.push({ id: entry.name, name: metadata.name || entry.name, path: 'themes/' + entry.name });
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  if (action === 'list') {
    for (const theme of installed) console.log((config.resolvedPaths.theme === resolve(config.root, theme.path) ? '* ' : '  ') + theme.id + ' (' + theme.name + ')');
    return;
  }
  if (action !== 'use' || !requested) throw new Error('Usage: edgepress theme list | edgepress theme use <theme-name>');
  const selected = installed.find((theme) => theme.id === requested);
  if (!selected) throw new Error('Theme not found. Run edgepress theme list to see installed themes.');
  const configFile = resolve(config.root, 'edgepress.config.mjs');
  const info = await lstat(configFile);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('Refusing to edit an unsafe edgepress.config.mjs path');
  const source = await readFile(configFile, 'utf8');
  const pathsBlock = source.match(/(paths\s*:\s*\{)([^}]*)(\})/s);
  if (!pathsBlock || !/^\s*theme\s*:/m.test(pathsBlock[2])) {
    throw new Error('Could not safely find paths.theme in edgepress.config.mjs; set it manually.');
  }
  const updatedPaths = pathsBlock[2].replace(/(^\s*theme\s*:\s*)(["'])[^"']*\2/m, '$1"' + selected.path + '"');
  const updated = source.replace(pathsBlock[0], pathsBlock[1] + updatedPaths + pathsBlock[3]);
  await writeFile(configFile, updated, 'utf8');
  console.log('Selected theme ' + selected.id + '.');
}

async function createPost(title, config) {
  if (!title) throw new Error('Usage: edgepress new "Post title"');
  const releaseLock = await acquireBuildLock(config.resolvedPaths.cache);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const folder = resolve(config.resolvedPaths.content, 'posts', today + '-' + slugify(title));
    const locale = config.i18n.defaultLocale;
    const file = resolve(folder, locale.toLowerCase() + '.md');
    await mkdir(folder, { recursive: true });
    const body = '---\ntitle: ' + JSON.stringify(title) + '\ndate: ' + today + '\nlang: ' + locale + '\ntags: []\n---\n\n# ' + title + '\n\nWrite your post here.\n';
    let handle;
    try { handle = await open(file, 'wx'); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Post already exists: ' + file);
      throw error;
    }
    let writeError;
    try { await handle.writeFile(body, 'utf8'); }
    catch (error) { writeError = error; }
    await handle.close();
    if (writeError) {
      await rm(file, { force: true });
      throw writeError;
    }
    console.log('Created ' + file);
  } finally {
    await releaseLock();
  }
}

async function clean(config) {
  const cache = config.resolvedPaths.cache;
  const releaseLock = await acquireBuildLock(cache);
  try {
    for (const target of [config.resolvedPaths.output]) {
      try {
        const info = await lstat(target);
        if (info.isSymbolicLink()) throw new Error('Refusing to clean a symbolic-link output path: ' + target);
        await rm(target, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const toolsDirectory = resolve(config.root, 'tools');
    try {
      const info = await lstat(toolsDirectory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Refusing to clean reports through an unsafe tools path: ' + toolsDirectory);
      for (const name of ['page-check.json', 'page-check.md', 'page-check.pdf', 'page-check-visual.html']) {
        await rm(resolve(toolsDirectory, name), { force: true });
      }
      const screenshots = resolve(toolsDirectory, 'page-check-screenshots');
      try {
        const screenshotsInfo = await lstat(screenshots);
        if (screenshotsInfo.isSymbolicLink() || !screenshotsInfo.isDirectory()) throw new Error('Refusing to clean an unsafe screenshot path: ' + screenshots);
        await rm(screenshots, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let entries = [];
    try { entries = await readdir(cache); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await Promise.all(entries.filter((entry) => entry !== 'build.lock')
      .map((entry) => rm(resolve(cache, entry), { recursive: true, force: true })));
  } finally {
    await releaseLock();
  }
  console.log('Removed generated output and reports.');
}

async function showReport(title, report, reportPath) {
  console.log(title + ': ' + report.status);
  console.log('Report: ' + reportPath);
}

const [command, ...args] = process.argv.slice(2);
try {
  const config = command === 'new' || command === 'clean' || command === 'check' || command === 'doctor' || command === 'iterate'
    ? await loadConfig()
    : null;
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log('EdgePress commands: init, new, build, server, check, doctor, iterate, theme, secret, security, deploy, clean');
  }
  else if (command === 'build') await buildSite();
  else if (command === 'init') await initializeProject();
  else if (command === 'preview' || command === 'dev' || command === 'server') await import('./preview.js');
  else if (command === 'deploy') { await buildSite(); await runWrangler('deploy', args); }
  else if (command === 'secret') {
    if (!['put', 'delete', 'list'].includes(args[0])) throw new Error('Usage: edgepress secret put|delete|list [name]');
    await runWrangler('secret', args);
  }
  else if (command === 'theme') await manageTheme(args, await loadConfig());
  else if (command === 'security') await runSecurityAudit();
  else if (command === 'new') await createPost(args.join(' ').trim(), config);
  else if (command === 'clean') await clean(config);
  else if (command === 'check') {
    await buildSite(config.root);
    const pageReport = await checkPages(config);
    const compatibilityReport = await checkCompatibility(config);
    await showReport('Page check', pageReport, resolve(config.root, 'tools/page-check.md'));
    await showReport('Compatibility check', compatibilityReport, resolve(config.resolvedPaths.cache, 'reports/compatibility.md'));
    if (pageReport.errors || compatibilityReport.issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
  } else if (command === 'doctor') {
    const report = await checkCompatibility(config);
    await showReport('Compatibility check', report, resolve(config.resolvedPaths.cache, 'reports/compatibility.md'));
    if (report.issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
  } else if (command === 'iterate') {
    await buildSite(config.root);
    const pageReport = await checkPages(config);
    const compatibilityReport = await checkCompatibility(config);
    const plan = await writeIterationPlan(config, pageReport, compatibilityReport);
    await showReport('Safe iteration plan', plan, resolve(config.resolvedPaths.cache, 'reports/iteration-plan.md'));
  } else throw new Error('Commands: init, build, server, deploy, new, clean, check, doctor, iterate, theme, security');
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
