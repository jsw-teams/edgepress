#!/usr/bin/env node
import { access, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { acquireBuildLock, buildSite } from './build.js';
import { loadConfig } from './config.js';
import { slugify } from './content.js';
import { checkPages } from './page-check.js';
import { checkCompatibility, writeIterationPlan } from './maintenance.js';

const siteGitignore = ['node_modules/', 'dist/', '.edgepress/', '.wrangler/', '.dev.vars', '*.tgz', ''].join('\n');
const siteReadme = [
  '# My EdgePress site',
  '',
  'Static site source built with EdgePress. Use Node.js 22.12 or newer.',
  '',
  '## Start locally',
  '',
  '    npm install',
  '    edgepress server',
  '',
  'Edit localized pages in `content/pages/` and Markdown posts in `content/posts/`. Choose a shared layout with `edgepress theme list` and `edgepress theme use <name>`.',
  '',
  '## Deploy to Cloudflare Workers',
  '',
  'Push this source repository to GitHub, then connect the repository to Cloudflare Workers Builds. The `build` and `deploy` scripts in `package.json` generate the static files and deploy the Worker. Set a unique Worker name in `wrangler.jsonc` first.',
  '',
  'For a local deployment, run `npx wrangler login`, then `edgepress deploy`.',
  '',
  '## Use another static web server',
  '',
  'Run `edgepress generate` and upload the contents of `dist/` to the server document root. OpenResty and Nginx can serve the generated directories as static files. Worker API routes and service bindings need a Worker or an equivalent server-side route.',
  ''
].join('\n');

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
  let existingManifest = {};
  let packageManifestExists = false;
  try {
    const manifestPath = resolve(root, 'package.json');
    const manifestInfo = await lstat(manifestPath);
    if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) throw new Error('Refusing to edit an unsafe package.json path');
    packageManifestExists = true;
    existingManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!existingManifest || Array.isArray(existingManifest) || typeof existingManifest !== 'object') throw new Error('package.json must contain a JSON object');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const projectManifest = {
    ...existingManifest,
    name: existingManifest.name || 'my-edgepress-site',
    version: existingManifest.version || '1.0.0',
    private: existingManifest.private ?? true,
    type: 'module',
    scripts: {
      ...(existingManifest.scripts || {}),
      new: 'edgepress new',
      generate: 'edgepress generate',
      build: 'edgepress build',
      dev: 'edgepress server',
      preview: 'edgepress server',
      check: 'edgepress check',
      doctor: 'edgepress doctor',
      deploy: 'edgepress deploy'
    },
    dependencies: {
      ...(existingManifest.dependencies || {}),
      edgepress: packageData.version,
      wrangler: existingManifest.dependencies?.wrangler ?? packageData.devDependencies?.wrangler ?? '^4.129.1'
    }
  };
  for (const directory of directories) await cp(resolve(packageRoot, directory), resolve(root, directory), { recursive: true, errorOnExist: true });
  for (const file of files) {
    const destination = resolve(root, file);
    await mkdir(dirname(destination), { recursive: true });
    if (file === '.gitignore') await writeFile(destination, siteGitignore, { flag: 'wx' });
    else if (file === 'README.md') await writeFile(destination, siteReadme, { flag: 'wx' });
    else await cp(resolve(packageRoot, file), destination, { errorOnExist: true });
  }
  await mkdir(resolve(root, 'src'), { recursive: true });
  await cp(resolve(packageRoot, 'src/worker.js'), resolve(root, 'src/worker.js'), { errorOnExist: true });
  await writeFile(resolve(root, 'package.json'), JSON.stringify(projectManifest, null, 2) + '\n', { flag: packageManifestExists ? 'w' : 'wx' });
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
  if (action === 'create') {
    if (!requested) throw new Error('Usage: edgepress theme create <theme-name>');
    const id = slugify(requested);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Theme name must contain letters or numbers and may use spaces or hyphens.');
    const destination = resolve(themesDirectory, id);
    try { await lstat(destination); throw new Error('Theme already exists: ' + id); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    await cp(resolve(packageRoot, 'themes/default'), destination, { recursive: true, errorOnExist: true });
    const metadataPath = resolve(destination, 'theme.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.id = id;
    metadata.name = requested.trim();
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
    const packageManifestPath = resolve(destination, 'package.json');
    const packageManifest = {
      name: 'edgepress-theme-' + id,
      version: '1.0.0',
      description: 'A custom theme for EdgePress.',
      files: ['theme.json', 'layouts', 'assets', 'README.md'],
      edgepress: { theme: id }
    };
    await writeFile(packageManifestPath, JSON.stringify(packageManifest, null, 2) + '\n', 'utf8');
    const readmePath = resolve(destination, 'README.md');
    const readme = '# ' + id + '\n\nAn EdgePress theme package. Edit the shared layout and partials under `layouts/` and add theme styles and assets under `assets/`.\n\n' +
      'To install this theme in another EdgePress site, publish the package to npm and run:\n\n' +
      '    edgepress theme install edgepress-theme-' + id + '\n\n' +
      'Keep the skip link, one main landmark, labeled navigation, visible keyboard focus, and a page-level `h1` in the layout.\n';
    await writeFile(readmePath, readme, 'utf8');
    await writeFile(resolve(destination, 'assets/style.css'), '/* Add the colors, typography, spacing, and responsive rules for this theme here. */\n', 'utf8');
    console.log('Created an empty theme at themes/' + id + '. Edit its HTML partials and assets, then run edgepress theme use ' + id + '.');
    return;
  }
  if (action === 'install') {
    if (!requested) throw new Error('Usage: edgepress theme install <npm-package>[@version]');
    const packageSpecPattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[0-9][a-z0-9.+_-]*)?$/i;
    if (!packageSpecPattern.test(requested)) throw new Error('Theme must be an npm package name with an optional version.');
    const packageNameEnd = requested.lastIndexOf('@');
    const packageName = packageNameEnd > requested.indexOf('/') ? requested.slice(0, packageNameEnd) : requested;
    const tempDirectory = await mkdtemp(join(tmpdir(), 'edgepress-theme-'));
    try {
      await new Promise((resolveExit, reject) => {
        const child = spawn('npm', ['install', '--prefix', tempDirectory, '--ignore-scripts', '--no-audit', '--no-fund', requested], {
          cwd: config.root, env: process.env, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true
        });
        child.once('error', reject);
        child.once('exit', (code) => code === 0 ? resolveExit() : reject(new Error('npm could not install theme package ' + requested)));
      });
      const packageDirectory = resolve(tempDirectory, 'node_modules', ...packageName.split('/'));
      const packageInfo = await lstat(packageDirectory);
      if (!packageInfo.isDirectory() || packageInfo.isSymbolicLink()) throw new Error('Installed theme package is not a regular directory.');
      const themeRoot = await realpath(packageDirectory);
      const readPackageFile = async (name) => {
        const filePath = resolve(themeRoot, name);
        const info = await lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Theme package ' + name + ' must be a regular file.');
        const realPath = await realpath(filePath);
        const relativePath = relative(themeRoot, realPath);
        if (relativePath === '..' || relativePath.startsWith('..' + sep) || relativePath.startsWith(sep)) {
          throw new Error('Theme package ' + name + ' resolves outside the package directory.');
        }
        return readFile(realPath, 'utf8');
      };
      const metadata = JSON.parse(await readPackageFile('theme.json'));
      const packageManifest = JSON.parse(await readPackageFile('package.json'));
      const declaredId = metadata.id || packageManifest.edgepress?.theme || packageName.split('/').at(-1).replace(/^edgepress-theme-/, '');
      const id = slugify(declaredId);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Theme package must declare a safe id in theme.json or package.json#edgepress.theme.');
      const layoutFile = resolve(themeRoot, 'layouts/layout.html');
      const layoutInfo = await lstat(layoutFile);
      if (!layoutInfo.isFile() || layoutInfo.isSymbolicLink()) throw new Error('Theme package layouts/layout.html must be a regular file.');
      const layoutPath = await realpath(layoutFile);
      const relLayout = relative(themeRoot, layoutPath);
      if (relLayout === '..' || relLayout.startsWith('..' + sep) || relLayout.startsWith(sep)) {
        throw new Error('Theme package layouts/layout.html must be a regular file inside the package.');
      }
      const destination = resolve(themesDirectory, id);
      try { await lstat(destination); throw new Error('Theme already exists: ' + id); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await cp(themeRoot, destination, { recursive: true, errorOnExist: true, dereference: false });
      console.log('Installed ' + (metadata.name || packageName) + ' to themes/' + id + '. Select it with edgepress theme use ' + id + '.');
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (action !== 'use' || !requested) throw new Error('Usage: edgepress theme list | edgepress theme create <name> | edgepress theme install <npm-package>[@version] | edgepress theme use <theme-name>');
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

function showStatus(title, report) {
  console.log(title + ': ' + report.status);
  for (const issue of report.issues) console.log('- ' + issue.severity + ': ' + issue.message);
}

const [command, ...args] = process.argv.slice(2);
try {
  const config = command === 'new' || command === 'clean' || command === 'check' || command === 'doctor' || command === 'iterate'
    ? await loadConfig()
    : null;
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log('EdgePress commands: init, new, build, generate, server, check, doctor, iterate, theme, secret, security, deploy, clean');
  }
  else if (command === 'build' || command === 'generate') await buildSite();
  else if (command === 'init') await initializeProject();
  else if (command === 'preview' || command === 'dev' || command === 'server') await import('./preview.js');
  else if (command === 'deploy') {
    if (process.env.WORKERS_CI !== '1') await buildSite();
    await runWrangler('deploy', args);
  }
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
    await showReport('Page check', pageReport, resolve(config.root, 'tools/page-check.pdf'));
    showStatus('Compatibility check', compatibilityReport);
    if (pageReport.errors || compatibilityReport.issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
  } else if (command === 'doctor') {
    const report = await checkCompatibility(config);
    showStatus('Compatibility check', report);
    if (report.issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
  } else if (command === 'iterate') {
    await buildSite(config.root);
    const pageReport = await checkPages(config);
    const compatibilityReport = await checkCompatibility(config);
    const plan = await writeIterationPlan(config, pageReport, compatibilityReport);
    await showReport('Safe iteration plan', plan, resolve(config.resolvedPaths.cache, 'reports/iteration-plan.md'));
  } else throw new Error('Commands: init, build|generate, server, deploy, new, clean, check, doctor, iterate, theme list|create|install|use, security');
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
