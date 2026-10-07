import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadConfig} from '../src/config.js';
import {loadLanguagePacks} from '../src/i18n.js';
import {createExtensions} from '../src/plugin-api.js';
import {renderLayout} from '../src/theme.js';
import {renderBlocks} from '../src/page-blocks.js';
import {reserveImageDimensions} from '../src/image-dimensions.js';

test('Edge reports no unnamed form fields or unsized lazy images in responsive pages',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const config=await loadConfig(root);await loadLanguagePacks(config);
  config.site.url='https://edge-issues.invalid';
  config.resolvedPaths.theme=config.realPaths.theme=resolve(root,'themes/default');
  config.site.navigation=[{key:'projects',url:'/projects/',labels:{en:'Projects'},children:[{key:'demo',url:'/demo/',labels:{en:'Demo'}}]}];
  config.site.footerNavigation=[{key:'more',url:'/more/',labels:{en:'More'},children:[{key:'help',url:'/help/',labels:{en:'Help'}}]}];
  const blocks=await renderBlocks([{columns:2,cells:Array.from({length:2},()=>[{type:'media-text',mediaType:'image',src:'/preview.svg',alt:'Demo',title:'Demo',text:'A responsive local preview.',animationSrc:'/demo.mp4'}])}],{config,locale:'en',site:{posts:[],pages:[]}});
  const html=reserveImageDimensions(await renderLayout(config,await createExtensions(config),{locale:'en',title:'Demo',urlPath:'/'},'<h1>Demo</h1><article class="page-builder">'+blocks+'</article>'),new Map([['/preview.svg',{width:1200,height:750}]]),'index.html',config.site.url);
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  try{
    for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());assert.equal(url.origin,config.site.url);
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
        // Delay decoding: layout and the browser audit must succeed before bytes arrive.
        if(url.pathname==='/preview.svg')return;
        const path=url.pathname==='/style.css'?resolve(root,'themes/default/assets/style.css'):resolve(root,'static','.'+url.pathname);
        const types={'.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml'};
        try{return route.fulfill({body:await readFile(path),contentType:types[extname(path)]||'application/octet-stream'});}
        catch{return route.fulfill({status:404,body:''});}
      });
      const page=await context.newPage(),cdp=await context.newCDPSession(page),issues=[];
      cdp.on('Audits.issueAdded',({issue})=>{
        if(issue.code==='LazyLoadImageIssue'||issue.details.genericIssueDetails?.errorType==='FormEmptyIdAndNameAttributesForInputError')issues.push(issue);
      });
      await cdp.send('Audits.enable');await page.goto(config.site.url,{waitUntil:'domcontentloaded'});
      await page.locator('.privacy-panel').waitFor({state:'visible'});
      await page.locator('[data-navigation-select]').first().waitFor({state:'visible'});
      const fields=await page.locator('input,select,textarea').evaluateAll(nodes=>nodes.map(node=>node.id||node.name));
      assert.ok(fields.length>=5);assert.ok(fields.every(Boolean));assert.equal(new Set(fields).size,fields.length);
      for(const image of await page.locator('img[loading=lazy]').all()){
        const box=await image.boundingBox();assert.ok(box.width>0&&box.height>0);
        assert.ok(Math.abs(box.width/box.height-1200/750)<.01);
        assert.equal(await image.evaluate(node=>node.naturalWidth),0);
      }
      // Exercise both runtime photo paths without contacting a provider.
      const photos=await page.evaluate(async()=>{
        const {trustedEmbed,trustedProviderEmbed}=await import('/edgepress/oembed.js');
        const data={version:'1.0',type:'photo',url:location.origin+'/preview.svg',width:1200,height:750,title:'Photo'};
        const images=[trustedEmbed(data,location.origin,document),trustedProviderEmbed(data,{backendUrl:location.origin},document),trustedEmbed({...data,width:undefined,height:undefined},location.origin,document)];
        document.querySelector('main').append(...images);
        return images.map(image=>({width:Number(image.getAttribute('width')),height:Number(image.getAttribute('height')),ratio:image.style.aspectRatio}));
      });
      assert.equal(photos[0].width,1200);assert.equal(photos[1].height,750);assert.match(photos[2].ratio,/4\s*\/\s*3/);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.deepEqual(issues,[],`${width}px Edge Issues`);
      await context.close();
    }
  }finally{await browser.close();}
});
