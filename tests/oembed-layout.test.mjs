import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { renderEmbed } from '../src/embed.js';
import { configureDataSaver, dataSaverHtml, dataSaverLayout } from '../src/data-saver.js';

test('embed entry stays compact until requested, retries failures and keeps keyboard focus without preconsent requests', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  config.site.dataSaver = { enabled:true, mode:'text', debug:false, detectSlowConnection:false, respectBrowserPreference:true };
  await configureDataSaver(config);
  const origin = 'https://embed-layout.test';
  const service = { id: 'shared-media', provider: 'oembed', enabled: true, name: 'Shared media', backendUrl: 'https://media.example.test' };
  config.browserPlugins.services = [service];
  const block = await renderEmbed({ integration: service.id, url: service.backendUrl + '/s/example', title: 'A meaningful shared story' }, { config, locale: 'en' });
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const theme of ['default', 'folio', 'signal']) for (const colorScheme of ['light', 'dark']) for (const mode of ['full','text']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      let calls = 0, requests = 0;
      const themeStyle = await readFile(resolve('themes',theme,'assets/style.css'));
      const textLayout = await dataSaverLayout(config,[{path:'style.css',content:themeStyle}]);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === service.backendUrl) {
          requests++;
          if (url.pathname === '/api') {
            calls++;
            await new Promise(resolve => setTimeout(resolve, 250));
            if (calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '1.0', type: 'rich', width: 640, height: 360, title: 'Shared story', html: '<iframe src="' + service.backendUrl + '/embed/example"></iframe>' }) });
          }
          return route.fulfill({ contentType: 'text/html', body: '<p>Shared story content</p>' });
        }
        assert.equal(url.origin, origin);
        if (url.pathname.endsWith('/choices.js')) return route.fulfill({ contentType: 'text/javascript', body: 'export function readChoice(){return {allowed:window.testAllowed?["shared-media"]:[]}}' });
        if (url.pathname === '/style.css') return route.fulfill({ contentType: 'text/css', body: await readFile(resolve('themes', theme, 'assets/style.css')) });
        if (url.pathname === '/edgepress/data-saver-layout.css') return route.fulfill({contentType:'text/css',body:textLayout.content});
        if (url.pathname === '/data-saver-theme.css') return route.fulfill({contentType:'text/css',body:await readFile(resolve('themes',theme === 'signal' ? 'folio' : theme,'assets/data-saver-theme.css'))});
        if (url.pathname.startsWith('/edgepress/')) return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: await readFile(resolve('static', '.' + url.pathname.replace('.aaaaaaaaaaaaaaaa',''))) });
        const html = '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><main>' + block + '</main><script id="edgepress-privacy-config" type="application/json">' + JSON.stringify({ privacy: { integrations: [service] }, ui: { embedNeedsConsent: 'Allow {service} to load media.', embedLoading: 'Loading {service}…', embedUnavailable: 'Media unavailable. Try again.', embedLoaded: 'Loaded {service}.' } }) + '</script><script type="module" src="/edgepress/oembed.aaaaaaaaaaaaaaaa.js"></script></body></html>';
        return route.fulfill({ contentType:'text/html', body:mode === 'text' ? dataSaverHtml(html,config) : html });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      await page.evaluate(() => document.addEventListener('edgepress:privacy-open', () => window.testOpened = (window.testOpened || 0) + 1));
      const entry = page.locator('[data-edgepress-oembed]');
      const button = entry.locator('[data-oembed-load]');
      assert.equal(await entry.locator('[data-oembed-status]').evaluate(element => element.getBoundingClientRect().height), 0);
      assert((await entry.boundingBox()).height < 300);
      assert.equal(requests, 0);
      await button.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.testOpened === 1);
      assert.equal(requests, 0);
      assert.equal(await button.isEnabled(), true);
      await page.evaluate(() => { window.testAllowed = true; });
      await button.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-edgepress-oembed]').getAttribute('aria-busy') === 'true');
      assert.equal(await button.isEnabled(), false);
      const pendingBounds = await entry.locator('[data-oembed-placeholder]').boundingBox();
      assert(mode === 'text' ? pendingBounds === null : pendingBounds.height <= 60);
      await entry.locator('[data-oembed-notice]').getByText('Media unavailable. Try again.', { exact: true }).waitFor();
      assert.equal(await button.isEnabled(), true);
      assert.equal(await entry.locator('[data-oembed-status]').evaluate(element => element.getBoundingClientRect().height), 0);
      await button.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-edgepress-oembed]').dataset.loaded === 'true');
      await page.frameLocator('iframe').getByText('Shared story content').waitFor();
      assert.equal(calls, 2);
      assert.equal(requests, 3);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'A meaningful shared story');
      assert.equal(await entry.getAttribute('aria-busy'), 'false');
      assert.equal(await button.count(), 0);
      assert.equal(await entry.locator('[data-oembed-notice]').isVisible(), false);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});
