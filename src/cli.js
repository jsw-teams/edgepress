#!/usr/bin/env node
import { reportDirectory } from './report-path.js';
import { publicationTimestamp } from './publication-time.js';
import { access, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { acquireBuildLock, buildSite } from './build.js';
import { loadConfig } from './config.js';
import { readDocuments, slugify } from './content.js';
import { createPage } from './page-scaffold.js';
import { checkPages } from './page-check.js';
import { checkCompatibility, writeIterationPlan } from './maintenance.js';
import { loadLanguagePacks, translate } from './i18n.js';
import { postTemplate } from './post-template.js';
import { deploySite } from './deploy.js';
import { deployVps, loadVpsDeploymentConfig } from './vps-deploy.js';
import { formatPages } from '../tools/assets/format-pages.mjs';

const siteGitignore = ['node_modules/', 'dist/', '.edgepress/', '.wrangler/', '.dev.vars', '.vercel/', '.netlify/', '.edgeone/', '.esa/', '.env', '.env.*', '!.env.example', '*.tgz', ''].join('\n');
const siteReadme = [
  '# My EdgePress site',
  '',
  'Static site source built with EdgePress (zero runtime dependencies, Node.js 22.12+).',
  '',
  '## Quick start',
  '',
  '    npm install',
  '    npx edgepress s',
  '',
  'Create an article with `npx edgepress new "My first article"`. Open the printed file and write Markdown below the second `---` line.',
  'Run `npx edgepress s` to preview your site and edit Pages at `http://127.0.0.1:8787/__edgepress/`.',
  'Run `npx edgepress g` to build static files into `dist/`.',
  '',
  '## Deploy',
  '',
  'Push this repository to GitHub and connect it to Cloudflare, Vercel, Netlify, EdgeOne Pages, or ESA Pages.',
  'Use `npm run build` as the build command and `dist` as the output directory.',
  'For an SSH/SFTP VPS, configure `deploy.vps` in your private `config.yml` and run `npx edgepress d`.',
  ''
].join('\n');

function printHelp() {
  console.log([
    'EdgePress — zero-dependency static site builder',
    '',
    'Everyday commands:',
    '  edgepress s [--port 8787]           Preview locally and open the Pages editor',
    '  edgepress g                         Build static files into dist/',
    '  edgepress new "Title"               Create a new Markdown post',
    '  edgepress new page "Title" [opts]   Create a new JSON page (--lang, --slug)',
    '  edgepress d [--dry-run] [--target]  Build and deploy to configured VPS targets',
    '',
    'Site management:',
    '  edgepress init                      Create a new EdgePress site in this folder',
    '  edgepress status                    Show active theme, locales, and content counts',
    '  edgepress theme list|use|create|install',
    '  edgepress deploy [cloudflare|vercel|netlify|edgeone|esa|vps]',
    '  edgepress check | doctor | clean | iterate | security'
  ].join('\n'));
}

async function initializeProject() {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = process.cwd();
  const directories = ['content', 'languages', 'plugins', 'static', 'themes'];
  const files = ['.gitignore', 'README.md', 'config.yml', 'edgepress.config.mjs', 'project-compatibility.json', 'wrangler.jsonc', 'vercel.json', 'edgeone.json', 'esa.jsonc', 'netlify.toml'];
  const destinations = [...directories, ...files];
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
  const overrides = {
    ...(packageData.overrides || {}),
    ...(existingManifest.overrides || {})
  };
  const dependencies = {
    ...(existingManifest.dependencies || {}),
    edgepress: packageData.version,
    ...(existingManifest.dependencies?.wrangler ? { wrangler: existingManifest.dependencies.wrangler } : packageData.devDependencies?.wrangler ? { wrangler: packageData.devDependencies.wrangler } : {})
  };
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
      status: 'edgepress status',
      check: 'edgepress check',
      doctor: 'edgepress doctor',
      deploy: 'edgepress deploy',
      'deploy:cloudflare': 'edgepress deploy cloudflare',
      'deploy:netlify': 'edgepress deploy netlify',
      'deploy:vercel': 'edgepress deploy vercel',
      'deploy:edgeone': 'edgepress deploy edgeone',
      'deploy:esa': 'edgepress deploy esa',
      'deploy:vps': 'edgepress d',
      'deploy:local': 'edgepress server'
    },
    ...(Object.keys(overrides).length ? { overrides } : {}),
    dependencies
  };
  for (const directory of directories) await cp(resolve(packageRoot, directory), resolve(root, directory), { recursive: true, errorOnExist: true });
  await formatPages(root, { write: true, schemaPath: resolve(root, 'node_modules/edgepress/schemas/pages.schema.json') });
  for (const file of files) {
    const destination = resolve(root, file);
    await mkdir(dirname(destination), { recursive: true });
    if (file === '.gitignore') await writeFile(destination, siteGitignore, { flag: 'wx' });
    else if (file === 'README.md') await writeFile(destination, siteReadme, { flag: 'wx' });
    else await cp(resolve(packageRoot, file), destination, { errorOnExist: true });
  }
  await writeFile(resolve(root, 'package.json'), JSON.stringify(projectManifest, null, 2) + '\n', { flag: packageManifestExists ? 'w' : 'wx' });
  console.log('Created an EdgePress site. Run npm install, then npx edgepress s.');
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
  if (action === 'list' || !action) {
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
    const readme = '# ' + id + '\n\nAn EdgePress theme package. Edit layouts under `layouts/` and styles under `assets/`.\n\n' +
      'To install this theme in another EdgePress site, publish it to npm and run:\n\n' +
      '    edgepress theme install edgepress-theme-' + id + '\n';
    await writeFile(readmePath, readme, 'utf8');
    await writeFile(resolve(destination, 'assets/style.css'), '/* Add colors, typography, spacing, and responsive rules here. */\n', 'utf8');
    console.log('Created theme at themes/' + id + '. Select it with: edgepress theme use ' + id);
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
      console.log('Installed ' + (metadata.name || packageName) + ' to themes/' + id + '. Select it with: edgepress theme use ' + id);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (action !== 'use' || !requested) throw new Error('Usage: edgepress theme list | create <name> | install <npm-package>[@version] | use <theme-name>');
  const selected = installed.find((theme) => theme.id === requested);
  if (!selected) throw new Error('Theme not found. Run edgepress theme list to see installed themes.');

  // If config.yml defines top-level `theme:`, update it directly so both config files stay consistent.
  const yamlFile = resolve(config.root, 'config.yml');
  try {
    const yamlInfo = await lstat(yamlFile);
    if (yamlInfo.isFile() && !yamlInfo.isSymbolicLink()) {
      const yamlSource = await readFile(yamlFile, 'utf8');
      if (/^theme\s*:/m.test(yamlSource)) {
        const updatedYaml = yamlSource.replace(/^theme\s*:.*$/m, 'theme: ' + selected.id);
        await writeFile(yamlFile, updatedYaml, 'utf8');
        console.log('Selected theme ' + selected.id + ' in config.yml.');
        return;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

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

async function newPage(args, config) {
  let lang, slug;
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--lang' || arg === '--slug') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + arg);
      if (arg === '--lang') lang = args[++i];
      else slug = args[++i];
    } else if (arg.startsWith('--')) throw new Error('Unknown new pages option: ' + arg);
    else words.push(arg);
  }
  const title = words.join(' ').trim();
  if (!title) throw new Error('Usage: edgepress new pages "Page title" [--lang en] [--slug page-slug]');
  const page = await createPage(config.root, {
    title, lang, slug, locales: config.i18n.locales, defaultLocale: config.i18n.defaultLocale
  });
  console.log('Created Page: ' + relative(config.root, page.file));
  console.log('Preview and edit Pages with: edgepress s');
}

async function createPost(title, config) {
  if (!title) throw new Error('Usage: edgepress new post "Post title"');
  const releaseLock = await acquireBuildLock(config.resolvedPaths.cache);
  try {
    if (title.length > 160 || /[\x00-\x1f\x7f]/.test(title)) throw new Error('Post title must be one line of at most 160 characters.');
    await loadLanguagePacks(config);
    const timestamp = publicationTimestamp(new Date(), config.site.timeZone);
    const today = timestamp.slice(0, 10);
    const folder = resolve(config.resolvedPaths.content, 'posts', today + '-' + slugify(title));
    const locale = config.i18n.defaultLocale;
    const file = resolve(folder, locale.toLowerCase() + '.md');
    await mkdir(folder, { recursive: true });
    const body = postTemplate(title, timestamp, locale, translate(config, locale, 'postStarter'));
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
    console.log(translate(config, locale, 'postCreated').replace('{file}', relative(config.root, file)));
    console.log(translate(config, locale, 'postNextSteps'));
    console.log(translate(config, locale, 'postPreview'));
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
    const toolsDirectory = await reportDirectory(config.root, false);
    if (toolsDirectory) try {
      const info = await lstat(toolsDirectory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Refusing to clean reports through an unsafe tools path: ' + toolsDirectory);
      await rm(resolve(toolsDirectory, 'page-check.pdf'), { force: true });
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

async function showSiteStatus(config) {
  const docs = await readDocuments(config);
  const posts = docs.filter(d => d.kind === 'posts').length;
  const pages = docs.filter(d => d.kind === 'pages').length;
  console.log('Site: ' + config.site.title + (config.site.url ? ' (' + config.site.url + ')' : ''));
  console.log('Theme: ' + relative(config.root, config.resolvedPaths.theme).replace(/\\/g, '/'));
  console.log('Locales: ' + config.i18n.locales.join(', '));
  console.log('Content: ' + pages + ' page files, ' + posts + ' post files');
  console.log('Node.js: ' + process.versions.node + ' (concurrency: ' + config.concurrency + ')');
}

async function showReport(title, report, reportPath) {
  console.log(title + ': ' + report.status);
  console.log('Report: ' + reportPath);
}

function showStatus(title, report) {
  console.log(title + ': ' + report.status);
  for (const issue of report.issues) console.log('- ' + issue.severity + ': ' + issue.message);
}

async function deployConfiguredVps(args) {
  let dryRun = false;
  const requestedTargets = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--target') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for --target');
      requestedTargets.push(...args[++i].split(',').map(v => v.trim()).filter(Boolean));
    } else if (arg.startsWith('--target=')) {
      requestedTargets.push(...arg.slice('--target='.length).split(',').map(v => v.trim()).filter(Boolean));
    } else {
      throw new Error('Usage: edgepress d [--dry-run] [--target NAME] (or edgepress deploy vps)');
    }
  }
  const settings = await loadVpsDeploymentConfig();
  const built = await buildSite();
  let targets = settings.targets || [{ name: settings.host, ...settings }];
  if (requestedTargets.length) {
    const wanted = new Set(requestedTargets.map(n => n.toLowerCase()));
    targets = targets.filter(t => wanted.has(t.name.toLowerCase()));
    if (!targets.length) throw new Error('No matching VPS target found for: ' + requestedTargets.join(', '));
  }
  const failures = [];
  await Promise.all(targets.map(async (target) => {
    const { name, ...connection } = target;
    try {
      console.log('VPS target ' + name + (dryRun ? ' (dry run)' : ''));
      await deployVps(built.output, connection, { dryRun });
    } catch (error) {
      failures.push(new Error(name + ': ' + (error?.message || String(error)), { cause: error }));
    }
  }));
  if (failures.length) throw new AggregateError(failures, failures.length + ' VPS deployment target(s) failed');
}

const [command, ...args] = process.argv.slice(2);
try {
  const config = ['new', 'clean', 'check', 'doctor', 'iterate', 'status'].includes(command)
    ? await loadConfig()
    : null;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
  }
  else if (command === 'build' || command === 'generate' || command === 'g') await buildSite();
  else if (command === 'init') await initializeProject();
  else if (command === 'status') await showSiteStatus(config);
  else if (['preview', 'dev', 'server', 's', 'editor', 'edit'].includes(command)) {
    const options = command === 'editor' && /^\d+$/.test(args[0] || '') ? ['--port', ...args] : args;
    await (await import('./preview.js')).startPreview(options);
  }
  else if (command === 'd') await deployConfiguredVps(args);
  else if (command === 'deploy') {
    const platform = args[0] && !args[0].startsWith('-') ? args.shift() : 'cloudflare';
    if (platform === 'vps') await deployConfiguredVps(args);
    else {
      const built = process.env.WORKERS_CI === '1' ? { output: (await loadConfig()).resolvedPaths.output } : await buildSite();
      await deploySite(platform, built.output, args);
    }
  }
  else if (command === 'theme') await manageTheme(args, await loadConfig());
  else if (command === 'security') await runSecurityAudit();
  else if (command === 'new') {
    if (args[0] === 'pages' || args[0] === 'page') await newPage(args.slice(1), config);
    else await createPost((args[0] === 'post' ? args.slice(1) : args).join(' ').trim(), config);
  }
  else if (command === 'clean') await clean(config);
  else if (command === 'check') {
    await buildSite(config.root);
    const pageReport = await checkPages(config);
    const compatibilityReport = await checkCompatibility(config);
    await showReport('Page check', pageReport, resolve(config.root, 'tools/reports/page-check.pdf'));
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
  } else {
    console.error('Unknown command: ' + command + '\n');
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
