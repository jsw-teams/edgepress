import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectImageDimensions,reserveImageDimensions} from '../src/image-dimensions.js';
test('local content images reserve their real aspect ratio without fetching other origins or replacing explicit dimensions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'image-dimensions-'));try{const source=join(root,'portrait.svg');await writeFile(source,'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"></svg>');const dimensions=await collectImageDimensions([{path:'images/p.svg',source}]);
 const rewrite=html=>reserveImageDimensions(html,dimensions,'chapter/index.html','https://site.example');assert.match(rewrite('<img src="../images/p.svg" alt="Portrait">'),/width="120" height="240"/);assert.match(rewrite('<img src="/images/p.svg" width="60">'),/height="120"/);assert.match(rewrite('<img src="/images/p.svg" height="80">'),/width="40"/);const explicit='<img src="/images/p.svg" width="60" height="60">';assert.equal(rewrite(explicit),explicit);assert.equal(rewrite('<img src="https://other.example/images/p.svg">'),'<img src="https://other.example/images/p.svg">');assert.equal(rewrite('<img src="/%ZZ.svg">'),'<img src="/%ZZ.svg">');
 assert.match(rewrite('<img src="/images/p.svg" loading="lazy">'),/style="aspect-ratio:120 \/ 240"/);
 const styled=rewrite('<img src="/images/p.svg" loading="lazy" style="border:0">');assert.match(styled,/style="border:0;aspect-ratio:120 \/ 240"/);assert.equal(rewrite(styled),styled);
 const authored='<img src="/images/p.svg" loading="lazy" width="60" height="60" style="aspect-ratio:1 / 1">';assert.equal(rewrite(authored),authored);
 const inert='<img data-src="/images/p.svg">';assert.equal(rewrite(inert),inert);assert.match(rewrite('<img data-width="60" src="/images/p.svg">'),/width="120" height="240"/);
 }finally{await rm(root,{recursive:true,force:true});}
});
