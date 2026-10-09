import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { extname } from 'node:path';
import { chromium, firefox } from 'playwright';
import { classifyLink, linkOrigin } from '../static/edgepress/external-links-policy.js';
import { loadConfig } from '../src/config.js';
import { loadLanguagePacks } from '../src/i18n.js';
import { collectAssets, rewriteAssetLinks } from '../src/assets.js';
import { createExtensions } from '../src/plugin-api.js';
import { renderLayout } from '../src/theme.js';

const settings = { enabled: true, siteUrl: 'https://site.test', trustedOrigins: ['https://trusted.test'] };

test('external links use exact origins and reject executable URLs, credentials and invalid trust settings', () => {
  for (const href of ['/article/', '#section', 'https://site.test/article/', 'https://trusted.test/path', 'mailto:hello@example.test', 'tel:+1234567']) assert.equal(classifyLink(href, settings, 'https://site.test/page/').kind, 'native');
  for (const href of ['https://trusted.test.attacker.test', 'https://child.trusted.test', 'http://trusted.test', 'https://trusted.test:8443', '//other.test/path']) assert.equal(classifyLink(href, settings, 'https://site.test/page/').kind, 'external');
  for (const href of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,hello', 'https://trusted.test@other.test/', 'file:///tmp/private']) assert.equal(classifyLink(href, settings, 'https://site.test/').kind, 'blocked');
  // A cross-origin <base> or an absolute GitHub file URL must not silently become trusted.
  const outsideBase = 'https://untrusted.test/embedded/';
  assert.equal(classifyLink('https://untrusted.test/file.mp4', settings, outsideBase).kind, 'external');
  assert.equal(classifyLink('/file.mp4', settings, outsideBase).kind, 'external');
  const githubFilm = 'https://github.com/jsw-teams/ai-video-production-workflow/blob/main/projects/guoqing/final.mp4';
  const githubTarget = classifyLink(githubFilm, settings, 'https://site.test/article/');
  assert.equal(githubTarget.kind, 'external');
  assert.equal(githubTarget.url, githubFilm);
  assert.equal(linkOrigin('https://trusted.test/'), 'https://trusted.test');
  for (const origin of ['https://*.test', 'https://trusted.test/path', 'https://user@trusted.test', 'javascript:alert(1)', 'https://trusted.test?next=other', 'https://trusted.test#hash']) assert.throws(() => linkOrigin(origin));
});

test('prompts are opt-in, localized and fingerprint their complete dependency graph', async () => {
  const config = await loadConfig(process.cwd());
  await loadLanguagePacks(config);
  const extensions = await createExtensions(config);
  const page = { title: 'External links', locale: 'en', urlPath: '/links/' };
  assert.ok(!(await renderLayout(config, extensions, page, '<main>Links</main>')).includes('edgepress-external-links-config'));
  config.site.externalLinks = settings;
  const html = await renderLayout(config, extensions, page, '<main>Links</main>');
  assert.ok(html.includes('edgepress-external-links-config'));
  const bundle = await collectAssets(config);
  assert.match(bundle.urlMap['/edgepress/external-links.js'], /\.[a-f0-9]{16}\.js$/);
  const runtime = bundle.assets.find(asset => '/' + asset.path === bundle.urlMap['/edgepress/external-links.js']).content.toString();
  assert.match(runtime, /external-links-policy\.[a-f0-9]{16}\.js/);
  assert.match(rewriteAssetLinks(html, bundle.urlMap), /external-links\.[a-f0-9]{16}\.css/);
});

test('site settings normalize exact origins and reject invalid prompt configuration', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edgepress-link-settings-'));
  try {
    await writeFile(resolve(root, 'edgepress.config.mjs'), 'export default { i18n: { defaultLocale: "en", languagePacks: [] } };');
    const consent = 'plugins:\n  consent:\n    enabled: false\n    proposedDate: 2026-10-09\n';
    await writeFile(resolve(root, 'config.yml'), consent + 'site:\n  url: https://site.test\n  externalLinks:\n    enabled: true\n    trustedOrigins: [https://trusted.test/, https://trusted.test]\n');
    assert.deepEqual((await loadConfig(root)).site.externalLinks.trustedOrigins, ['https://trusted.test']);
    for (const configuration of ['enabled: yes', 'trustedOrigins: [https://trusted.test/path]', 'trustedOrigins: [https://*.test]', 'trustedOrigins: [12]', 'enabled: true\n    redirect: https://other.test']) {
      await writeFile(resolve(root, 'config.yml'), consent + 'site:\n  url: https://site.test\n  externalLinks:\n    ' + configuration + '\n');
      await assert.rejects(loadConfig(root), /externalLinks|Trusted sites/);
    }
    await writeFile(resolve(root, 'config.yml'), consent + 'site:\n  externalLinks:\n    enabled: true\n');
    await assert.rejects(loadConfig(root), /site.url/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox]]) {
  test(name + ' preserves native links with localized keyboard-accessible theme-adaptive prompts', { timeout: 90000 }, async () => {
    const config = await loadConfig(process.cwd());
    config.site.url = settings.siteUrl;
    config.site.externalLinks = { enabled: true, trustedOrigins: settings.trustedOrigins };
    await loadLanguagePacks(config);
    const extensions = await createExtensions(config);
    const bundle = await collectAssets(config);
    const assets = new Map(bundle.assets.map(asset => ['/' + asset.path, asset]));
    const browser = await engine.launch({ headless: true, args: name === 'Chromium' ? ['--disable-extensions'] : [] });
    try {
      for (const [locale,title,back,proceed] of [['en', "You're leaving this site", 'Return', 'Continue to website'], ['zh-CN', '即将离开本站', '返回', '继续前往']]) {
        const context = await browser.newContext({ viewport: { width: 320, height: 720 }, colorScheme: 'dark', reducedMotion: 'reduce' });
        const page = await context.newPage();
        const requests = [];
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const content = '<main><a id="external" href="https://other.test/read?q=%3Cscript%3E#chapter">Other site</a><a id="github-film" href="https://github.com/jsw-teams/ai-video-production-workflow/blob/main/projects/guoqing/final.mp4">GitHub film</a><a id="long-url" href="https://other.test/path/' + 'a'.repeat(180) + '?x=1#part">Long URL</a><a id="root-url" href="https://other.test/">Site root</a><a id="trusted" href="https://trusted.test/path">Trusted site</a><a id="internal" href="#section">Inside</a><a id="new-tab" href="https://other.test/new" target="_blank">New tab</a><a id="download" href="https://other.test/file" download>Download</a><a id="auth" href="https://other.test/auth" data-external-link-skip>Sign in</a><section id="section">Section</section></main>';
        const html = rewriteAssetLinks(await renderLayout(config, extensions, { title: 'Links', locale, urlPath: '/links/' }, content.replace('<main>', '<div>').replace('</main>', '</div>')), bundle.urlMap);
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== settings.siteUrl) { requests.push(url.href); return route.fulfill({ contentType: 'text/html', body: '<title>Destination</title><p>Arrived</p>' }); }
          if (url.pathname === '/links/') return route.fulfill({ contentType: 'text/html', body: html });
          const asset = assets.get(url.pathname);
          if (!asset) return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[extname(url.pathname)] || 'application/octet-stream', body: asset.content || await readFile(asset.source) });
        });
        await page.goto(settings.siteUrl + '/links/');
        await page.locator('.privacy-reject').click();
        await page.addStyleTag({ content: 'body{background:#18252f;color:#e2e8f0} :root{--surface:#18252f;--paper:#18252f;--ink:#e2e8f0;--accent:#8fc7ff}' });
        const anchor = page.locator('#external');
        await anchor.focus(); await anchor.press('Enter');
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.equal(await dialog.getByRole('heading').textContent(), title);
        assert.equal(await dialog.locator('.edgepress-external-url').textContent(), 'https://other.test/read?q=%3Cscript%3E#chapter');
        assert.equal(await dialog.locator('.edgepress-external-url').count(), 1);
        assert.equal(await dialog.locator('.edgepress-external-domain, .edgepress-external-origin').count(), 0);
        assert.equal(await dialog.locator('.edgepress-external-url').evaluate(element => element.scrollWidth <= element.clientWidth), true);
        assert.equal(await dialog.getByRole('button', { name: back, exact: true }).evaluate(element => element === document.activeElement), true);
        assert.deepEqual(requests, []);
        assert.equal(await dialog.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(24, 37, 47)');
        assert.equal(await dialog.evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
        assert.equal(await dialog.locator('script').count(), 0);
        assert.equal(await anchor.getAttribute('href'), 'https://other.test/read?q=%3Cscript%3E#chapter');
        await page.keyboard.press('Tab');
        assert.equal(await dialog.getByRole('button', { name: proceed, exact: true }).evaluate(element => element === document.activeElement), true);
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert.equal(await dialog.getByRole('button', { name: proceed, exact: true }).evaluate(element => element === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await anchor.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.locator('main').evaluate(element => element.inert), false);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        await anchor.click();
        await dialog.waitFor();
        await page.evaluate(() => document.body.append(document.createElement('aside')));
        assert.equal(await page.locator('body > aside').evaluate(element => element.inert), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('body > aside').evaluate(element => element.inert), false);
        await page.locator('#github-film').click();
        await dialog.waitFor();
        assert.equal(await dialog.locator('.edgepress-external-url').textContent(), 'https://github.com/jsw-teams/ai-video-production-workflow/blob/main/projects/guoqing/final.mp4');
        assert.deepEqual(requests, [], 'The video host must not be contacted before visitor confirmation');
        await page.keyboard.press('Escape');
        await page.locator('#long-url').click();
        await dialog.waitFor();
        assert.equal(await dialog.locator('.edgepress-external-url').textContent(), 'https://other.test/path/' + 'a'.repeat(180) + '?x=1#part');
        assert.equal(await dialog.locator('.edgepress-external-url').evaluate(element => element.scrollWidth <= element.clientWidth), true);
        await page.keyboard.press('Escape');
        await page.locator('#root-url').click();
        await dialog.waitFor();
        assert.equal(await dialog.locator('.edgepress-external-url').textContent(), 'https://other.test/');
        assert.equal(await dialog.locator('.edgepress-external-url').count(), 1);
        await page.keyboard.press('Escape');
        await page.locator('#internal').click();
        assert.ok(page.url().endsWith('#section'));
        await anchor.click();
        await anchor.evaluate(element => element.href = 'https://changed.test/');
        await dialog.getByRole('button', { name: proceed, exact: true }).click();
        assert.deepEqual(requests, []);
        await anchor.evaluate(element => element.href = 'https://other.test/read');
        await anchor.click();
        await dialog.getByRole('button', { name: proceed, exact: true }).click();
        await page.getByText('Arrived', { exact: true }).waitFor();
        assert.deepEqual(requests, ['https://other.test/read']);
        await page.goto(settings.siteUrl + '/links/');
        await page.locator('#new-tab').click();
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('dialog').getByRole('button', { name: proceed, exact: true }).click();
        const popup = await popupPromise;
        await popup.waitForLoadState();
        assert.equal(await popup.evaluate(() => window.opener), null);
        await popup.close();
        for (const [selector, properties] of [['#external', { ctrlKey: true }], ['#external', { metaKey: true }], ['#external', { shiftKey: true }], ['#external', { button: 1 }], ['#download', {}], ['#auth', {}]]) {
          const native = await page.locator(selector).evaluate((element, properties) => {
            let intercepted = false;
            window.addEventListener('click', event => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...properties }));
            return !intercepted && document.querySelector('.edgepress-external-overlay').hidden;
          }, properties);
          assert.equal(native, true);
        }
        for (const properties of [{}, { ctrlKey: true }, { metaKey: true }, { button: 1 }]) {
          assert.equal(await page.evaluate(properties => {
            const unsafe = document.createElement('a');
            unsafe.href = 'javascript:window.unsafeNavigation=true';
            document.body.append(unsafe);
            let intercepted = false;
            window.addEventListener('click', event => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
            unsafe.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...properties }));
            unsafe.remove();
            return intercepted;
          }, properties), true);
        }
        await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' });
        await page.locator('#external').click();
        assert.equal(await page.getByRole('dialog').getByRole('button', { name: back, exact: true }).evaluate(element => getComputedStyle(element).appearance), 'none');
        await page.keyboard.press('Escape');
        await page.locator('#trusted').click();
        await page.getByText('Arrived', { exact: true }).waitFor();
        const noScript = await browser.newContext({ javaScriptEnabled: false });
        await noScript.route('**/*', route => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).hostname === 'other.test' ? '<p>Without scripts</p>' : html }));
        const plain = await noScript.newPage();
        await plain.goto(settings.siteUrl + '/links/');
        await plain.locator('#external').click();
        await plain.getByText('Without scripts', { exact: true }).waitFor();
        await noScript.close();
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally { await browser.close(); }
  });
}
