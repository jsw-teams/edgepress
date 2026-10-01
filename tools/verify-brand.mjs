import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { parse } from 'yaml';

const root = resolve(process.argv[2] || '.');
const settingsPath = resolve(root, 'config.yml');
const original = await readFile(settingsPath, 'utf8');
const buildSettingsPath = resolve(root, 'edgepress.config.mjs');
const originalBuildSettings = await readFile(buildSettingsPath, 'utf8');
const originalTheme = parse(original).theme;
const buildConfig = await import('file:///' + resolve(root, 'edgepress.config.mjs').replaceAll('\\', '/'));
const activeTheme = originalTheme || buildConfig.default.paths.theme.split('/').at(-1);
const cli = resolve(root, root.endsWith('www.jsw.ac.cn') ? 'node_modules/edgepress/src/cli.js' : 'src/cli.js');
const output = resolve(root, 'dist');
const evidence = resolve(root, 'tools/brand-previews');
await mkdir(evidence, { recursive: true });
const report = { generatedAt: new Date().toISOString(), activeTheme, checks: [], failures: [] };
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/__icon-sizes') {
      const icons = (await readdir(resolve(output, 'edgepress/icons'))).filter(x => x.endsWith('.png'));
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><html><head><title>Icon readability</title><style>body{font:14px system-ui;background:#faf7ee;color:#24382d}body.dark{background:#18241f;color:#cae4d1}.row{display:flex;align-items:center;gap:22px;margin:12px}.name{width:140px}img{object-fit:contain}</style></head><body>' + icons.map(name => '<div class="row"><span class="name">' + name + '</span>' + [16,20,24,32].map(size => '<picture><source media="(prefers-color-scheme:dark)" srcset="/edgepress/icons/dark/' + name + '"><img alt="" src="/edgepress/icons/' + name + '" width="' + size + '" height="' + size + '"></picture>').join('') + '</div>').join('') + '<script>if(matchMedia("(prefers-color-scheme:dark)").matches)document.body.className="dark"</script></body></html>');
      return;
    }
    let target = resolve(output, '.' + path);
    ensure(target === output || target.startsWith(output + sep), 'Unsafe path');
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    response.setHeader('content-type', mime[extname(target)] || 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end('Missing'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const build = () => {
  const result = spawnSync(process.execPath, [cli, 'build'], { cwd: root, encoding: 'utf8' });
  ensure(result.status === 0, result.stderr || result.stdout);
};
async function walk(folder) {
  const files=[];
  for (const item of await readdir(folder, { withFileTypes:true })) {
    const file=resolve(folder,item.name);
    if (item.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}
try {
  const themes=(await readdir(resolve(root,'themes'),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
  for (const theme of themes) {
    if (root.endsWith('www.js.gripe')) {
      await writeFile(settingsPath, original.replace(/^theme:.*\r?\n/m, '') + '\ntheme: ' + theme + '\n');
    } else {
      await writeFile(buildSettingsPath, originalBuildSettings.replace(/theme:\s*["'][^"']+["']/, 'theme: "themes/' + theme + '"'));
    }
    build();
    const htmlFiles=(await walk(output)).filter(x=>x.endsWith('.html'));
    let references=0;
    for (const file of htmlFiles) {
      const html=await readFile(file,'utf8');
      ensure(!/<svg\b|<use\b|icons\.svg|edgepress-mark\.svg|js-gripe\.svg|brand-mark\.svg/i.test(html),'SVG icon remains: '+relative(output,file));
      for (const match of html.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)) {
        for (const candidate of match[1].split(',')) {
          let url=candidate.trim().split(/\s+/)[0].replaceAll('&amp;','&');
          if (!/\.(png|webp|ico|svg)(?:[?#]|$)/i.test(url)) continue;
          if (/^https?:/.test(url)) { if (!url.startsWith(parse(original).site.url+'/')) continue; url=new URL(url).pathname; }
          if (!url.startsWith('/')) continue;
          await stat(resolve(output, '.' + decodeURIComponent(url.split(/[?#]/)[0]))).catch(()=>{throw new Error('Missing resource '+url+' in '+relative(output,file));});
          references++;
        }
      }
    }
    const locales=buildConfig.default.i18n;
    const homes=['/', ...(locales.languagePacks || []).map(locale=>'/'+locale+'/')];
    const urls=[...homes,'/archives/','/search/'];
    if (root.endsWith('www.js.gripe')) urls.push(...homes.map(home=>home+'edgepress/'));
    for (const colorScheme of ['light','dark']) {
      for (const width of [390,1440]) {
        const context=await browser.newContext({ colorScheme, viewport:{width,height:900}, reducedMotion:'reduce' });
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const missing=[];
        page.on('response',response=>{ if(response.status()>=400 && /\.(png|webp|css|js|ico)/.test(response.url())) missing.push(response.url()); });
        for (const url of urls) {
          await page.goto(address+url,{waitUntil:'networkidle'});
          await page.evaluate(()=>document.fonts.ready);
          const state=await page.evaluate(()=>({
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            missing:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),
            main:document.querySelectorAll('main').length,
            h1:document.querySelectorAll('h1').length,
            background:getComputedStyle(document.body).backgroundColor,
            icons:[...document.querySelectorAll('.icon-bitmap')].map(i=>({alt:i.alt,hidden:i.getAttribute('aria-hidden'),src:i.currentSrc,width:i.getBoundingClientRect().width})),
            unlabeled:[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length
          }));
          ensure(!state.overflow, `${theme} ${colorScheme} ${width} ${url}: horizontal overflow`);
          ensure(!state.missing.length, 'Broken images '+JSON.stringify(state.missing));
          ensure(state.main===1 && state.h1===1, 'Landmarks/title count in '+url);
          ensure(state.unlabeled===0,'Unnamed button in '+url);
          const rgb=state.background.match(/[\d.]+/g).slice(0,3).map(Number);
          ensure(colorScheme==='dark' ? rgb.reduce((a,b)=>a+b,0)<240 : rgb.reduce((a,b)=>a+b,0)>500,'Page palette in '+url+': '+state.background);
          ensure(state.icons.every(i=>i.alt===''&&i.hidden==='true'),'Icon semantics in '+url);
          ensure(state.icons.every(i=>colorScheme==='dark' ? i.src.includes('/icons/dark/') : !i.src.includes('/icons/dark/')),'Icon palette in '+url);
          if (url==='/' && theme===activeTheme) {
            await page.keyboard.press('Tab');
            ensure(await page.locator('.skip-link').evaluate(link=>link===document.activeElement),'Skip link keyboard focus');
            await page.locator('.skip-link').evaluate(link=>link.blur());
            const closePrivacy=page.locator('.privacy-close');
            if (await closePrivacy.isVisible()) await closePrivacy.click();
            await page.screenshot({path:resolve(evidence,`home-${theme}-${width}-${colorScheme}.png`),fullPage:true});
          }
          if (url==='/archives/') {
            const post=page.locator('.post-card h2 a').first();
            if (await post.count()) {
              await post.click();
              await page.waitForLoadState('networkidle');
              ensure(await page.locator('.post-toc-icon').count()<=1,'Duplicate contents icon');
              if (await page.locator('.post-toc-icon').count()) ensure((await page.locator('.post-toc-icon').getAttribute('alt'))==='','Contents icon alt');
            }
          }
        }
        ensure(!errors.length,'Browser errors '+JSON.stringify(errors));
        ensure(!missing.length,'HTTP resource failures '+JSON.stringify(missing));
        report.checks.push({theme,colorScheme,width,urls:urls.length,references,status:'pass'});
        await context.close();
      }
    }
  }
  await writeFile(settingsPath,original);
  await writeFile(buildSettingsPath,originalBuildSettings);
  build();
  for (const colorScheme of ['light','dark']) {
    const page=await browser.newPage({colorScheme,viewport:{width:800,height:1200}});
    await page.goto(address+'/__icon-sizes',{waitUntil:'networkidle'});
    await page.screenshot({path:resolve(evidence,'icons-'+colorScheme+'.png'),fullPage:true});
    await page.close();
  }
} catch(error) { report.failures.push(error.message); process.exitCode=1; }
finally {
  await writeFile(settingsPath,original);
  await writeFile(buildSettingsPath,originalBuildSettings);
  build();
  await browser.close();
  await new Promise(done=>server.close(done));
  await writeFile(resolve(root,'tools/brand-verification.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({root,checks:report.checks.length,failures:report.failures},null,2));
