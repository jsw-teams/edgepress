import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { createExtensions } from '../src/plugin-api.js';
import { renderBlocks } from '../src/page-blocks.js';
import { renderLayout } from '../src/theme.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect width="300" height="900" fill="#7d9688"/></svg>';
const landscape = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#b6b09a"/></svg>';

test('theme layouts keep navigation, portrait media, columns and floating controls readable', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['default', 'atelier', 'signal', 'folio']) {
      const config = await loadConfig(root);
      await loadLanguagePacks(config);
      config.resolvedPaths.theme = config.realPaths.theme = resolve(root, 'themes', theme);
      config.site.title = config.site.header.brandLabel = 'Signal';
      config.site.navigation = ['home', 'archives', 'search'].map(key => ({ key, url: '@' + key }));
      config.site.navigation.push({ key: 'about', url: '/about/', labels: { en: 'About', 'zh-CN': '关于' } });
      const extensions = await createExtensions(config);
      const blocks = [
        { columns: 1, cells: [[{ type: 'hero', title: 'A readable magazine spread', text: 'A whole paragraph introducing the current issue.',
          bannerSrc: '/landscape.svg', bannerAlt: 'Landscape fixture', bannerWidth: 1200, bannerHeight: 675,
          bannerWebpSrcset: undefined }]] },
        { columns: 2, cells: [[{ type: 'image', src: '/portrait.svg', alt: 'Complete portrait fixture', caption: 'A complete caption below the image.' }],
          [{ type: 'code', title: 'Local command', code: 'npm run build' }]] },
        { columns: 1, cells: [[{ type: 'media-text', mediaType: 'image', src: '/portrait.svg', alt: 'Another complete portrait',
          caption: 'No crop and no horizontal overflow.', placement: 'right', title: 'Media with text', text: 'A complete argument stays alongside the illustration.' }]] }
      ];
      const content = await renderBlocks(blocks, { config, locale: 'en', site: { posts: [], pages: [] }, isHomepage: true });
      const controls = '<div class="post-toc-widget"><button class="post-toc-toggle">Contents</button><div class="post-toc-panel" hidden><ol><li><a href="#main">Section</a></li></ol></div></div>' +
        '<form class="local-search-form"><div class="local-search-controls"><input type="search" aria-label="Search"><button>Search</button></div></form>';
      const html = await renderLayout(config, extensions, { title: 'Fixture', locale: 'en', urlPath: '/' }, '<article class="page-builder">' + content + controls + '</article>');
      const context = await browser.newContext();
      await context.route('**/*', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: await readFile(resolve(root, 'themes', theme, 'assets/style.css')) });
        if (path === '/portrait.svg' || path === '/landscape.svg') return route.fulfill({ contentType: 'image/svg+xml', body: path === '/portrait.svg' ? portrait : landscape });
        if (path.startsWith('/folio/')) return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(root, 'themes', theme, 'assets', '.' + path)) });
        try { return route.fulfill({ body: await readFile(resolve(root, 'static', '.' + path)), contentType: path.endsWith('.js') ? 'text/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }); }
        catch { return route.fulfill({ status: 404, body: '' }); }
      });
      const page = await context.newPage();
      for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.goto('https://layout.invalid/');
        await page.locator('.privacy-settings-button').waitFor();
        const label = `${theme} ${width} ${colorScheme}`;
        assert.equal(await page.locator('main h1').count(), 1, label);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': overflow');
        const brand = await page.locator('.brand').boundingBox();
        const locale = await page.locator('.locale-nav').boundingBox();
        const nav = await page.locator('.primary-navigation').boundingBox();
        const overlaps = (a,b) => a.x < b.x+b.width-1 && a.x+a.width > b.x+1 && a.y < b.y+b.height-1 && a.y+a.height > b.y+1;
        assert(!overlaps(brand,locale) && !overlaps(brand,nav) && !overlaps(locale,nav), label + ': header overlap');
        for (const image of await page.locator('.image-block img,.media-text-block img,.hero-banner').all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(img => img.decode());
          const ratio = await image.evaluate(img => { const box = img.getBoundingClientRect(); return box.width / box.height / (img.naturalWidth / img.naturalHeight); });
          assert(Math.abs(ratio-1) < .01, label + ': image cropped or distorted (' + ratio + ')');
        }
        const figure = await page.locator('.image-block').boundingBox();
        const cell = await page.locator('.image-block').locator('..').boundingBox();
        assert(Math.abs(figure.x-cell.x) < 1 && Math.abs(figure.width-cell.width) < 1, label + ': figure inset');
        const copy = await page.locator('.code-widget').boundingBox();
        const copyCell = await page.locator('.code-widget').locator('..').boundingBox();
        assert(Math.abs(copy.x-copyCell.x) < 1, label + ': code inset');
        assert(!overlaps(await page.locator('.post-toc-toggle').boundingBox(), await page.locator('.privacy-settings-button').boundingBox()), label + ': controls overlap');
        assert.equal(await page.locator('.post-toc-panel ol').evaluate(list => getComputedStyle(list).listStyleType), 'none', label + ': numbered TOC');
        assert(await page.locator('input[type="search"]').evaluate(input => {
          const style = getComputedStyle(input);
          const luminance = value => { const rgb = value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; };
          const a=luminance(style.color),b=luminance(style.backgroundColor);
          return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
        }), label + ': unreadable input');
        if (theme === 'folio' && width === 1440) {
          const title = await page.locator('.hero-main').boundingBox();
          const image = await page.locator('.hero-banner').boundingBox();
          assert(image.x >= title.x + title.width, label + ': spread does not have two columns');
        }
      }
      await context.close();
    }
  } finally { await browser.close(); }
});
