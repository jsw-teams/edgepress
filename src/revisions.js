import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, stat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, join } from 'node:path';
import { parse } from 'yaml';
import {revisionImageReferences,revisionImageFile,revisionImageState,snapshotRevisionImages} from './revision-images.js';

const run = promisify(execFile);
const git = (cwd, args) => run('git', args, {cwd, maxBuffer: 2_000_000}).then(result => result.stdout);
function articleText(source) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n([\s\S]*)$/);
  if (!match) return source.replace(/\r\n/g, '\n').trim();
  const metadata = parse(match[1]);
  return '# ' + String(metadata?.title || '') + '\n\n' + (typeof metadata?.image==='string'?'![Cover]('+metadata.image+')\n\n':'') + match[2].replace(/\r\n/g, '\n').trim();
}
async function difference(before, after) {
  const folder = await mkdtemp(join(tmpdir(), 'edgepress-revision-'));
  const left = join(folder, 'before.md'), right = join(folder, 'after.md');
  try {
    await writeFile(left, before + '\n'); await writeFile(right, after + '\n');
    let output;
    try { output = await git(folder, ['diff', '--no-index', '--no-color', '--unified=3', '--', left, right]); }
    catch (error) { if (error.code !== 1) throw error; output = error.stdout; }
    return output.split('\n').filter(line => !/^(diff --git|index |--- |\+\+\+ )/.test(line)).join('\n').trim();
  } finally {
    await Promise.all([unlink(left).catch(()=>{}), unlink(right).catch(()=>{})]);
    await rmdir(folder);
  }
}

// Release numbering and front-matter-only changes do not change article history.
export async function readPostRevision(file, source, showChanges = false, assetsRoot = null) {
  const empty = {updated: null, changes: ''};
  try {
    const root = (await git(dirname(file), ['rev-parse', '--show-toplevel'])).trim();
    const path = relative(root, file).split('\\').join('/');
    const current = articleText(source),refs=await revisionImageReferences(current);
    const imagePaths=[...refs.keys()].map(href=>revisionImageFile(href,assetsRoot)).filter(Boolean).map(file=>relative(root,file).split('\\').join('/'));
    const entries = (await git(root, ['log', '-n', '20', '--format=%H%x09%cI', '--', path,...imagePaths])).trim().split('\n').filter(Boolean);
    if (!entries.length) return empty;
    const working={text:current,commit:null,images:await revisionImageState(current,assetsRoot,root,null,git)};
    const signature=state=>state.text+'\n'+JSON.stringify([...state.images].map(([href,image])=>[href,image.oid]));
    const result=async(before,after,updated)=>{
      if(!showChanges)return {updated,changes:''};
      let changes=await difference(before.text,after.text);
      for(const [href,image] of after.images){const old=before.images.get(href);if(old&&old.oid!==image.oid&&!changes.includes(href))changes+='\n-!['+old.alt.replace(/[\[\]\r\n]/g,'')+']('+href+')\n+!['+image.alt.replace(/[\[\]\r\n]/g,'')+']('+href+')';}
      const snapshots=await snapshotRevisionImages(before,after,changes,root,(cwd,args)=>run('git',args,{cwd,maxBuffer:20_000_000,encoding:'buffer'}).then(result=>result.stdout));
      return {updated,changes,...snapshots};
    };
    const history = [];
    for (const entry of entries) {
      const [commit, timestamp] = entry.split('\t');
      let text;try{text=articleText(await git(root,['show',commit+':'+path]));}catch{break;}
      const state={text,commit,updated:new Date(timestamp),images:await revisionImageState(text,assetsRoot,root,commit,git)};
      history.push(state);
      if (history.length === 1 && signature(state) !== signature(working)) {
        const updated = (await stat(file)).mtime;
        return result(state,working,updated);
      }
      if (history.length > 1 && signature(history.at(-2)) !== signature(state)) {
        const latest = history.at(-2);
        return result(state,latest,latest.updated);
      }
    }
    return empty;
  } catch (error) {
    // Missing Git or shallow history must never fabricate previous content.
    return empty;
  }
}
