// Recording-only workbench. Commands execute the real standalone EdgePress CLI;
// Monaco edits the actual generated file. Nothing is installed into production.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm,cp,symlink} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {parse,stringify} from 'yaml';

export async function workbench({artifact,packageRoot,editorRoot,photoPath,locale,context,embedding=false}){
 const upstream=resolve(packageRoot),root=resolve(artifact,(embedding?'embedding-example-':'edgepress-example-')+locale);
 assert.ok(root.startsWith(resolve(artifact)+sep));await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
 const cli=resolve(upstream,'src/cli.js');
 async function run(args){return new Promise((done,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:root,windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);child.once('error',reject);child.once('exit',code=>code===0?done(output):reject(Error(output)));});}
 await run(['init']);await symlink(resolve(upstream,'node_modules'),resolve(root,'node_modules'),'junction');
 const chinese=locale!=='en',title=chinese?'你好世界':'Hello world';
 const settings=parse(await readFile(resolve(root,'config.yml'),'utf8'));settings.site.title=chinese?'我的写作空间':'My writing space';settings.site.description=chinese?'用文字和照片记录生活。':'Stories and photographs from everyday life.';settings.site.navigation=settings.site.navigation.filter(item=>['home','posts','search'].includes(item.key));settings.site.footerNavigation=[];settings.plugins.consent.services=[];await writeFile(resolve(root,'config.yml'),stringify(settings));
 await writeFile(resolve(root,'edgepress.config.mjs'),'export default '+JSON.stringify({paths:{content:'content',static:'static',theme:'themes/default',output:'dist',cache:'.recording-cache'},permalink:'/:year/:month/:slug/',i18n:{defaultLocale:locale,languagePacks:[chinese?'en':'zh-CN']},plugins:['plugins/consent/index.js']})+';\n');
 if(chinese){await cp(resolve(root,'languages/packs/zh-CN.json'),resolve(root,'languages/base/zh-CN.json'));await cp(resolve(root,'languages/base/en.json'),resolve(root,'languages/packs/en.json'));}
 // Use a small, real writing site so the recording starts at its article list.
 await rm(resolve(root,'content/posts'),{recursive:true,force:true});await mkdir(resolve(root,'content/posts'),{recursive:true});
 await rm(resolve(root,'content/pages'),{recursive:true,force:true});await mkdir(resolve(root,'content/pages/home'),{recursive:true});
 await writeFile(resolve(root,'content/pages/home',locale.toLowerCase()+'.md'),'---\n'+stringify({title:settings.site.title,lang:locale,slug:'home',homepage:true,blocks:[{columns:1,cells:[[{type:'hero',eyebrow:chinese?'生活里的小事':'Notes from everyday life',title:settings.site.title,text:settings.site.description}]]},{columns:1,cells:[[{type:'post-list',title:chinese?'最近的文章':'Recent stories',category:'uncategorized',count:3}]]}]})+'---\n');
 if(embedding){settings.plugins.consent.services=[{id:'ishare',provider:'oembed',backendUrl:'https://ishare.js.gripe',enabled:true,name:chinese?'爱分享':'ishare',purpose:chinese?'在你同意后显示作者分享的图片与视频。':'Show the author’s shared photos and videos after you agree.',dataCategories:chinese?'请求的媒体和 IP 地址。':'Requested media and IP address.',recipient:'ishare',retention:chinese?'直到发布者删除。':'Until the publisher deletes it.',privacyUrl:'https://ishare.js.gripe/privacy/'}];await writeFile(resolve(root,'config.yml'),stringify(settings));}
 await mkdir(resolve(root,'content/assets/photos'),{recursive:true});await cp(photoPath,resolve(root,'content/assets/photos/seaside.jpg'));
 let file=null;
 const monaco=resolve(editorRoot,'min/vs');
 const {loadConfig}=await import(pathToFileURL(resolve(upstream,'src/config.js')));const {readDocuments}=await import(pathToFileURL(resolve(upstream,'src/content.js')));
 let server,serverOutput='',port;
 async function createPost(){const output=await run(['new','post',title]);const match=output.match(/content[^\r\n]+\.md/);assert.ok(match);file=resolve(root,match[0]);assert.ok(file.startsWith(root+sep));return output;}
 async function startServer(){
  assert.ok(!server,'Only one preview per fixture');
  const {createServer}=await import('node:net');const socket=createServer();await new Promise(done=>socket.listen(0,'127.0.0.1',done));port=socket.address().port;await new Promise(done=>socket.close(done));
  server=spawn(process.execPath,[cli,'server','--port',String(port)],{cwd:root,windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  server.stdout.on('data',value=>serverOutput+=value);server.stderr.on('data',value=>serverOutput+=value);
  for(let tick=0;tick<120;tick++){if(server.exitCode!==null)throw Error(serverOutput);try{const response=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(1500)});if(response.ok)return serverOutput;}catch{}await new Promise(done=>setTimeout(done,500));}
  throw Error('Preview did not become ready: '+serverOutput);
 }
 async function dispose(){if(!server||server.exitCode!==null)return;if(process.platform==='win32')await new Promise(done=>{const stop=spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true});stop.once('exit',done);});else server.kill('SIGTERM');}
 const content=chinese?'## 海边的下午\n\n走到海边时，雨刚停。潮水很轻，远处的山还藏在云里。\n\n![雨后的海岸](/photos/seaside.jpg)\n\n下次还想沿着这条路走远一点。':'## An afternoon by the water\n\nThe rain had just stopped. Small waves reached the shore, and the mountains were still tucked into the clouds.\n\n![The coast after the rain](/photos/seaside.jpg)\n\nNext time, I want to follow this path a little farther.';
 const html=`<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>EdgePress writing workspace</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;background:#181c25;color:#e1e6ee;font:16px system-ui}.bar{height:54px;display:flex;gap:12px;align-items:center;padding:0 22px;border-bottom:1px solid #394050;background:#242a36}.bar strong{margin-right:auto}.bar button{font:inherit;color:inherit;border:0;border-radius:6px;padding:8px 15px;background:#333c4d;cursor:pointer}.bar button.active{background:#176b66;color:white}.panel{height:calc(100vh - 54px);padding:30px 32px}#terminal{font:21px/1.7 ui-monospace,Consolas,monospace}.command{display:flex;gap:12px;color:#8dd1c6}.command input{width:100%;border:0;outline:none;background:transparent;color:#f0f3f7;font:inherit}#output{font:17px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#c5cdd8;max-height:490px;overflow:auto}#editor-panel{padding:0}#file-path{height:42px;padding:10px 20px;background:#202531;color:#d1d8e3;font:14px Consolas,monospace}#editor{height:calc(100% - 42px)}[hidden]{display:none!important}.saved{font-size:14px;color:#9ed6c1}</style><header class="bar"><strong>EdgePress</strong><button class="active" id="terminal-tab">${chinese?'终端':'Terminal'}</button><button id="editor-tab">${chinese?'文章':'Article'}</button><span id="saved" class="saved"></span></header><main><section id="terminal" class="panel"><div class="command"><span>❯</span><input id="command" aria-label="Command" autocomplete="off" spellcheck="false"></div><pre id="output"></pre></section><section id="editor-panel" class="panel" hidden><div id="file-path"></div><div id="editor"></div></section></main><script src="/monaco/vs/loader.js"></script><script>require.config({paths:{vs:'/monaco/vs'}});let editor;window.commandDone=false;window.fileSaved=false;const terminal=document.querySelector('#terminal'),editorPanel=document.querySelector('#editor-panel'),input=document.querySelector('#command'),output=document.querySelector('#output');input.addEventListener('keydown',async event=>{if(event.key!=='Enter')return;event.preventDefault();input.disabled=true;window.commandDone=false;output.textContent='';const response=await fetch('/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:input.value})});const data=await response.json();output.textContent=data.output;output.scrollTop=output.scrollHeight;input.disabled=false;window.commandDone=true;});document.querySelector('#terminal-tab').onclick=()=>{terminal.hidden=false;editorPanel.hidden=true;document.querySelector('#terminal-tab').className='active';document.querySelector('#editor-tab').className='';input.value='';output.textContent='';input.focus();};document.querySelector('#editor-tab').onclick=async()=>{terminal.hidden=true;editorPanel.hidden=false;document.querySelector('#terminal-tab').className='';document.querySelector('#editor-tab').className='active';const data=await fetch('/article').then(r=>r.json());document.querySelector('#file-path').textContent=data.file;require(['vs/editor/editor.main'],()=>{editor=monaco.editor.create(document.querySelector('#editor'),{value:data.source,language:'markdown',theme:'vs-dark',fontSize:19,lineHeight:30,minimap:{enabled:false},wordWrap:'on',autoIndent:'none',formatOnPaste:false,automaticLayout:true,scrollBeyondLastLine:false});window.editor=editor;editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,async()=>{await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:editor.getValue()})});document.querySelector('#saved').textContent=${JSON.stringify(chinese?'已保存':'Saved')};window.fileSaved=true;});});};</script></html>`;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.hostname!=='edgepress-demo.test')return route.fallback();
  if(url.pathname==='/workbench/')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/run'){
   const command=request.postDataJSON().command;
   if(command===`edgepress new post '${title}'`)return route.fulfill({json:{output:await createPost()}});
   else if(command==='edgepress server')return route.fulfill({json:{output:await startServer()}});
   else throw Error('Unapproved recording command: '+command);

  }
  if(url.pathname==='/article'){assert.ok(file);return route.fulfill({json:{file:file.slice(root.length+1).replaceAll('\\','/'),source:await readFile(file,'utf8')}});}
  if(url.pathname==='/save'){assert.ok(file);await writeFile(file,request.postDataJSON().source);return route.fulfill({json:{saved:true}});}
  if(!url.pathname.startsWith('/monaco/vs/')){assert.ok(port,'Pages must come from edgepress server');const response=await fetch('http://127.0.0.1:'+port+url.pathname+url.search);const headers=Object.fromEntries(response.headers);delete headers['content-encoding'];delete headers['content-length'];return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});}
  const target=resolve(monaco,'.'+url.pathname.slice('/monaco/vs'.length));
  const base=url.pathname.startsWith('/monaco/vs/')?monaco:resolve(root,'dist');assert.ok(target.startsWith(base+sep));const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(target)]||'application/octet-stream',body:await readFile(target)});
 });
 return {title,content,createPost,startServer,dispose,async publishedPath(){const documents=await readDocuments(await loadConfig(root));const article=documents.find(item=>item.kind==='posts'&&item.title===title);assert.ok(article);if(!embedding)assert.ok(article.markdown.includes(content));return article.path;}};
}
