import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const site = resolve(process.argv[2] || process.cwd());
const output = resolve(site, 'dist');
const evidence = resolve(site, 'tools/brand-verification');
await mkdir(evidence, { recursive: true });
const configFile = resolve(site, 'edgepress.config.mjs');
const siteFile = resolve(site, 'config.yml');
const originalConfig = await readFile(configFile, 'utf8');
const originalSite = await readFile(siteFile, 'utf8');
const configuredTheme = originalSite.match(/^theme:\s*(\S+)/m)?.[1];
const defaultLocale = originalConfig.match(/defaultLocale:\s*["']([^"']+)/)?.[1];
assert.ok(defaultLocale, 'Default language must be declared.');
const themes = (await readdir(resolve(site, 'themes'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const locales = (await Promise.all((await readdir(resolve(site, 'content/pages/home'))).filter((name) => name.endsWith('.md')).map(async (name) =>
  (await readFile(resolve(site, 'content/pages/home', name), 'utf8')).match(/^lang:\s*(\S+)/m)?.[1]))).filter(Boolean);
const cli = await stat(resolve(site, 'src/cli.js')).then(() => resolve(site, 'src/cli.js')).catch(() => resolve(site, 'node_modules/edgepress/src/cli.js'));
async function build() {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, 'build'], { cwd: site, windowsHide: true });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.stderr.on('data', (chunk) => { text += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? done() : reject(new Error(text)));
  });
}
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
}
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    let path = resolve(output, '.' + pathname);
    const rel = relative(output, path);
    if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const results = [];
const failures = [];
try {
  for (const theme of themes) {
    if (configuredTheme) await writeFile(siteFile, originalSite.replace(/^theme:\s*\S+/m, 'theme: ' + theme));
    else await writeFile(configFile, originalConfig.replace(/(theme:\s*["'])themes\/[^"']+(["'])/, '$1themes/' + theme + '$2'));
    await build();
    const htmlFiles = (await filesIn(output)).filter((file) => file.endsWith('.html'));
    for (const file of htmlFiles) {
      const html = await readFile(file, 'utf8');
      assert.doesNotMatch(html, /<use\b|\/icons\.svg(?:#|["'])/i, 'Old sprite remains in ' + file);
      for (const match of html.matchAll(/<img\b[^>]*\bsrc="(\/[^"]+)"/g)) {
        const path = resolve(output, '.' + new URL(match[1], base).pathname);
        await stat(path);
      }
    }
    const article = await (async () => {
      for (const file of htmlFiles) if ((await readFile(file, 'utf8')).includes('<article class="post">')) return '/' + relative(output, file).split(sep).join('/').replace(/index\.html$/, '');
      return null;
    })();
    for (const scheme of ['light', 'dark']) {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 920 }, colorScheme: scheme });
        await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
        const page = await context.newPage();
        for (const locale of locales) {
          const prefix = locale === defaultLocale ? '/' : '/' + locale + '/';
          const paths = [prefix, prefix + 'archives/'];
          if (await stat(resolve(output, '.' + prefix + 'archives/page/2/index.html')).then(() => true).catch(() => false)) paths.push(prefix + 'archives/page/2/');
          if (await stat(resolve(output, '.' + prefix + 'edgepress/index.html')).then(() => true).catch(() => false)) paths.push(prefix + 'edgepress/');
          for (const path of paths) {
            await page.goto(base + path, { waitUntil: 'networkidle' });
            const measured = await page.evaluate(async () => {
              const images = [...document.querySelectorAll('img')];
              for (const image of images) image.loading = 'eager';
              await Promise.all(images.map((image) => image.decode().catch(() => {})));
              const icons = [...document.querySelectorAll('.icon-bitmap')];
              return {
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                brokenImages: images.filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
                inlineSvg: document.querySelectorAll('svg,use').length,
                iconSemantics: icons.every((image) => image.tagName === 'IMG' && image.alt === '' && image.getAttribute('aria-hidden') === 'true' && /\/edgepress\/icons\/[a-z-]+\.png$/.test(image.src)),
                rawLanguageCodes: [...document.querySelectorAll('.post-language')].some((element) => /^(?:en|zh-(?:CN|TW|SG))$/.test(element.textContent.trim())),
                cardGap: document.querySelector('.post-list') ? parseFloat(getComputedStyle(document.querySelector('.post-list')).rowGap) : null,
                cellGap: document.querySelector('.page-builder-cell') ? parseFloat(getComputedStyle(document.querySelector('.page-builder-cell')).rowGap) : null,
                filter: icons.length ? getComputedStyle(icons[0]).filter : null,
                h1: document.querySelectorAll('h1').length,
                ogImage: document.querySelector('meta[property="og:image"]')?.content,
                currentPage: document.querySelector('.pagination-current')?.getAttribute('aria-current')
              };
            });
            assert.equal(measured.overflow, false, theme + ' ' + path + ' overflows at ' + width);
            assert.deepEqual(measured.brokenImages, [], theme + ' ' + path + ' has broken images');
            assert.equal(measured.inlineSvg, 0);
            assert.equal(measured.iconSemantics, true);
            assert.equal(measured.rawLanguageCodes, false);
            assert.equal(measured.h1, 1);
            assert.match(measured.ogImage || '', /^https:\/\/.+\.png$/);
            if (measured.cardGap !== null) assert.ok(measured.cardGap >= 16);
            if (measured.cellGap !== null) assert.ok(measured.cellGap >= 16);
            if (measured.currentPage) assert.equal(measured.currentPage, 'page');
            if (theme === 'signal' || theme === 'lumen' && scheme === 'dark') assert.notEqual(measured.filter, 'none');
            results.push({ theme, scheme, width, locale, path, ...measured });
            if (path === prefix && locale === defaultLocale) {
              await page.screenshot({ path: resolve(evidence, 'home-' + theme + '-' + width + '-' + scheme + '.png'), fullPage: true });
              await page.keyboard.press('Tab');
              assert.equal(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), true, 'Skip link must be first keyboard target');
              if (await page.locator('.privacy-settings-button').count()) {
                if (await page.locator('.privacy-panel').isVisible()) await page.locator('.privacy-close').click();
                await page.locator('.privacy-settings-button').click();
                assert.equal(await page.locator('.privacy-settings-button').getAttribute('aria-expanded'), 'true');
                assert.equal(await page.locator('.privacy-panel').isVisible(), true);
                assert.equal(await page.locator('.privacy-panel svg').count(), 0);
                const contrasts = await page.evaluate(() => {
                  const luminance = (color) => {
                    const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
                      value /= 255;
                      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                    });
                    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
                  };
                  return [...document.querySelectorAll('.privacy-settings-button,.privacy-accept,.privacy-reject')].map((button) => {
                    const style = getComputedStyle(button);
                    const foreground = luminance(style.color);
                    const background = luminance(style.backgroundColor);
                    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
                  });
                });
                assert.ok(contrasts.every((ratio) => ratio >= 4.5), theme + ' privacy button contrast: ' + contrasts.join(', '));
                await page.locator('.privacy-close').click();
                assert.equal(await page.locator('.privacy-panel').isVisible(), false);
                await page.screenshot({ path: resolve(evidence, 'home-' + theme + '-' + width + '-' + scheme + '.png'), fullPage: true });
              }
            }
          }
        }
        if (article) {
          await page.goto(base + article, { waitUntil: 'networkidle' });
          if (await page.locator('.privacy-panel').isVisible()) await page.locator('.privacy-close').click();
          if (await page.locator('.post-toc-toggle').count()) {
            await page.evaluate(() => window.scrollTo(0, 400));
            await page.locator('.post-toc-toggle').waitFor({ state: 'visible' });
            assert.equal(await page.locator('.post-toc-toggle img').count(), 1);
            await page.locator('.post-toc-toggle').click();
            assert.equal(await page.locator('.post-toc-panel').isVisible(), true);
            await page.locator('.post-toc-close').click();
          }
        }
        await context.close();
      }
    }
    console.log(theme + ': image references, layouts, locales, light/dark, keyboard and bitmap controls passed.');
  }
} catch (error) {
  failures.push(error.message);
  process.exitCode = 1;
  console.error(error.stack);
} finally {
  await writeFile(configFile, originalConfig);
  await writeFile(siteFile, originalSite);
  await build();
  await browser.close();
  await new Promise((done) => server.close(done));
  await writeFile(resolve(evidence, 'browser-report.json'), JSON.stringify({ status: failures.length ? 'fail' : 'pass', cases: results.length, results, failures,
    limitations: ['Browser measurements use desktop Edge and simulated viewports/color schemes. Physical devices and assistive screen readers were not tested.'] }, null, 2) + '\n');
}
