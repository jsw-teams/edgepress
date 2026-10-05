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
