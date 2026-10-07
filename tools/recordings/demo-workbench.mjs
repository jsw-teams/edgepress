// Recording-only workbench. Commands execute the real standalone EdgePress CLI;
// Geany edits the actual generated file. Nothing is installed into production.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {guest,guestPath,typeCommand,editFile,openApp,activate} from './vm-desktop.mjs';
import {parse,stringify} from 'yaml';

export async function workbench({artifact,packageRoot,photoPath,locale,context,embedding=false}){
 const upstream=resolve(packageRoot),root=resolve(artifact,(embedding?'embedding-example-':'edgepress-example-')+locale);
 assert.ok(root.startsWith(resolve(artifact)+sep));await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
 const cli=resolve(upstream,'src/cli.js');
 async function run(args){return new Promise((done,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:root,windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);child.once('error',reject);child.once('exit',code=>code===0?done(output):reject(Error(output)));});}
 await run(['init']);
 const chinese=locale!=='en',title=embedding?(chinese?'散步中的瞬间':'Photos from our walk'):(chinese?'海边的下午':'An afternoon by the water');
 const settings=parse(await readFile(resolve(root,'config.yml'),'utf8'));settings.site.title=chinese?'我的写作空间':'My writing space';settings.site.description=chinese?'用文字和照片记录生活。':'Stories and photographs from everyday life.';settings.site.navigation=settings.site.navigation.filter(item=>['home','posts','search'].includes(item.key));settings.site.footerNavigation=[];settings.plugins.consent.services=[];await writeFile(resolve(root,'config.yml'),stringify(settings));
 await writeFile(resolve(root,'edgepress.config.mjs'),'export default '+JSON.stringify({paths:{content:'content',static:'static',theme:'themes/default',output:'dist',cache:'.recording-cache'},permalink:'/:year/:month/:slug/',i18n:{defaultLocale:locale,languagePacks:[chinese?'en':'zh-CN']},plugins:['plugins/consent/index.js']})+';\n');
 if(chinese){await cp(resolve(root,'languages/packs/zh-CN.json'),resolve(root,'languages/base/zh-CN.json'));await cp(resolve(root,'languages/base/en.json'),resolve(root,'languages/packs/en.json'));}
 // Use a small, real writing site so the recording starts at its article list.
 await rm(resolve(root,'content/posts'),{recursive:true,force:true});await mkdir(resolve(root,'content/posts'),{recursive:true});
 await rm(resolve(root,'content/pages'),{recursive:true,force:true});await mkdir(resolve(root,'content/pages/home'),{recursive:true});
 await writeFile(resolve(root,'content/pages/home',locale.toLowerCase()+'.md'),'---\n'+stringify({title:settings.site.title,lang:locale,slug:'home',homepage:true,blocks:[{columns:1,cells:[[{type:'hero',eyebrow:chinese?'生活里的小事':'Notes from everyday life',title:settings.site.title,text:settings.site.description}]]},{columns:1,cells:[[{type:'post-list',title:chinese?'最近的文章':'Recent stories',category:'uncategorized',count:3}]]}]})+'---\n');
 if(embedding){settings.plugins.consent.services=[{id:'ishare',provider:'oembed',backendUrl:'https://ishare.js.gripe',enabled:true,name:chinese?'爱分享':'ishare',purpose:chinese?'在你同意后显示作者分享的图片与视频。':'Show the author’s shared photos and videos after you agree.',dataCategories:chinese?'请求的媒体和 IP 地址。':'Requested media and IP address.',recipient:'ishare',retention:chinese?'直到发布者删除。':'Until the publisher deletes it.',privacyUrl:'https://ishare.js.gripe/privacy/'}];await writeFile(resolve(root,'config.yml'),stringify(settings));}
 await mkdir(resolve(root,'content/assets/photos'),{recursive:true});await cp(photoPath,resolve(root,'content/assets/photos/seaside.jpg'));
 let file=null,port;
 const terminalTitle='EdgePress '+locale;
 const {loadConfig}=await import(pathToFileURL(resolve(upstream,'src/config.js')));const {readDocuments}=await import(pathToFileURL(resolve(upstream,'src/content.js')));
 const rc=resolve(root,'.recording-bashrc');
 const shellRoot="'"+guestPath(root).replaceAll("'","'\\''")+"'";
 await writeFile(rc,'export PATH=/opt/recording/node_modules/.bin:/usr/local/bin:/usr/bin:/bin\ncd -- '+shellRoot+'\nexport WRANGLER_SEND_METRICS=false\nexport PS1="❯ "\n');
 await guest(['ln','-s','/opt/recording/node_modules',guestPath(resolve(root,'node_modules'))]);
 await openApp(['xterm','-T',terminalTitle,'-fa','Monospace','-fs','16','-bg','#17212c','-fg','#e8edf2','-geometry','106x30+60+40','-e','bash','--rcfile',guestPath(rc)],terminalTitle);
 await new Promise(done=>setTimeout(done,800));
 async function findPost(){const documents=await readDocuments(await loadConfig(root));const article=documents.find(item=>item.kind==='posts'&&item.title===title);if(article)file=article.file;return article;}
 async function createPost(){await run(['new','post',title]);const article=await findPost();assert.ok(article);return file;}
 async function newPost(){await typeCommand(root,terminalTitle,"edgepress new post '"+title+"'");for(let attempt=0;attempt<30;attempt++){const article=await findPost();if(article)return;await new Promise(done=>setTimeout(done,300));}throw Error('CLI did not create the post');}
 async function editPost(body){assert.ok(file);const front=(await readFile(file,'utf8')).split('---')[1];await editFile(root,file,'---'+front+'---\n\n'+body+'\n');}
 async function startServer({omitWait=task=>task()}={}){
  const {createServer}=await import('node:net');const socket=createServer();await new Promise(done=>socket.listen(0,'127.0.0.1',done));port=socket.address().port;await new Promise(done=>socket.close(done));
  await typeCommand(root,terminalTitle,'edgepress server --port '+port);
  await new Promise(done=>setTimeout(done,1600));
  await omitWait(async()=>{for(let attempt=0;attempt<180;attempt++){try{const response=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(1200)});if(response.ok)return;}catch{}await new Promise(done=>setTimeout(done,500));}throw Error('Guest preview did not become ready');});
 }
 async function dispose(){for(const title of [terminalTitle,'Geany']){try{const ids=await guest(['xdotool','search','--onlyvisible','--name',title]);for(const id of ids.split(/\s+/)){const pid=await guest(['xdotool','getwindowpid',id]);if(/^\d+$/.test(pid))await guest(['kill','-TERM',pid]);}}catch{}}}
 const content=chinese?'## 海边的下午\n\n走到海边时，雨刚停。潮水很轻，远处的山还藏在云里。\n\n![雨后的海岸](/photos/seaside.jpg)\n\n下次还想沿着这条路走远一点。':'## An afternoon by the water\n\nThe rain had just stopped. Small waves reached the shore, and the mountains were still tucked into the clouds.\n\n![The coast after the rain](/photos/seaside.jpg)\n\nNext time, I want to follow this path a little farther.';
 await context.route('https://edgepress-demo.test/**',async route=>{
  try{
  assert.ok(port,'Start the real guest preview before opening the website');
  const request=route.request(),url=new URL(request.url()),response=await fetch('http://127.0.0.1:'+port+url.pathname+url.search);
  const headers=Object.fromEntries(response.headers);delete headers['content-encoding'];delete headers['content-length'];
  return await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
  }catch(error){if(!route.request().isNavigationRequest())return route.abort();throw error;}
 });
 return {title,content,createPost,newPost,editPost,startServer,dispose,activateTerminal:()=>activate(terminalTitle),async publishedPath(){const article=await findPost();assert.ok(article);return article.path;}};
}
