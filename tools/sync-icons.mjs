import { readFile, copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../',import.meta.url));
const output = resolve(root,'content/assets/edgepress/icons');
const library = resolve(root,'node_modules/lucide-static');
const source = await readFile(resolve(root,'src/icons.js'),'utf8');
const names = [...source.slice(source.indexOf('new Set(['),source.indexOf(']);')).matchAll(/'([a-z0-9-]+)'/g)].map(match=>match[1]);
const mappings = {github:'code-xml'};
await mkdir(output,{recursive:true});
for(const name of names) await copyFile(resolve(library,'icons',(mappings[name]||name)+'.svg'),resolve(output,name+'.svg'));
await copyFile(resolve(library,'LICENSE'),resolve(output,'LICENSE.txt'));
const {version} = JSON.parse(await readFile(resolve(library,'package.json'),'utf8'));
await import('node:fs/promises').then(({writeFile}) => writeFile(resolve(output,'provenance.json'),JSON.stringify({library:'lucide-static',version,source:'https://github.com/lucide-icons/lucide',mappings},null,2)+'\n'));
for(const filename of await readdir(output)) if(filename.endsWith('.png')) await unlink(resolve(output,filename));
console.log('Copied '+names.length+' Lucide icons at '+version);
