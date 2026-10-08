import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
export async function imageViewerAssets(){
 const [js,css]=await Promise.all([
  build({entryPoints:[require.resolve('@jsw-teams/media-viewer/lightbox')],bundle:true,minify:true,write:false,format:'esm',target:'es2022',legalComments:'eof'}),
  build({entryPoints:[require.resolve('@jsw-teams/media-viewer/image-styles')],bundle:true,minify:true,write:false})
 ]);
 return [{path:'edgepress/image-viewer-lib.js',content:Buffer.from(js.outputFiles[0].contents),sourceName:'media-viewer component'},{path:'edgepress/image-viewer.css',content:Buffer.from(css.outputFiles[0].contents),sourceName:'media-viewer component'}];
}

export async function mediaViewerAssets() {
 const descriptors = [];
 for (const [entry, path, format] of [['gallery', 'media-gallery-lib.js', 'esm'], ['video', 'media-player-lib.js', 'esm'], ['styles', 'media-player.css', undefined]]) {
  const result = await build({entryPoints:[require.resolve('@jsw-teams/media-viewer/' + entry)],bundle:true,minify:true,write:false,format,target:'es2022',legalComments:'eof',plugins:entry === 'gallery' ? [{name:'shared-lightbox',setup(builder){builder.onResolve({filter:/^\.\/lightbox\.js$/},()=>({path:'./image-viewer-lib.js',external:true}));}}] : []});
  descriptors.push({path:'edgepress/' + path,content:Buffer.from(result.outputFiles[0].contents),sourceName:'media-viewer component'});
 }
 return descriptors;
}
