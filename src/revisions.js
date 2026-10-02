import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, stat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, join } from 'node:path';
import { parse } from 'yaml';

const run = promisify(execFile);
const git = (cwd, args) => run('git', args, {cwd, maxBuffer: 2_000_000}).then(result => result.stdout);
function articleText(source) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n([\s\S]*)$/);
  if (!match) return source.replace(/\r\n/g, '\n').trim();
  const metadata = parse(match[1]);
  return '# ' + String(metadata?.title || '') + '\n\n' + match[2].replace(/\r\n/g, '\n').trim();
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
export async function readPostRevision(file, source, showChanges = false) {
  const empty = {updated: null, changes: ''};
  try {
    const root = (await git(dirname(file), ['rev-parse', '--show-toplevel'])).trim();
    const path = relative(root, file).split('\\').join('/');
    const entries = (await git(root, ['log', '-n', '20', '--format=%H%x09%cI', '--', path])).trim().split('\n').filter(Boolean);
    if (!entries.length) return empty;
    const current = articleText(source);
    const history = [];
    for (const entry of entries) {
      const [commit, timestamp] = entry.split('\t');
      const text = articleText(await git(root, ['show', commit + ':' + path]));
      history.push({text, updated: new Date(timestamp)});
      if (history.length === 1 && text !== current) {
        const updated = (await stat(file)).mtime;
        return {updated, changes: showChanges ? await difference(text, current) : ''};
      }
      if (history.length > 1 && history.at(-2).text !== text) {
        const latest = history.at(-2);
        return {updated: latest.updated, changes: showChanges ? await difference(text, latest.text) : ''};
      }
    }
    return empty;
  } catch (error) {
    // Missing Git or shallow history must never fabricate previous content.
    return empty;
  }
}
