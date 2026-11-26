import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { parse } from './lib/yaml.js';
import { unifiedDiff } from './lib/diff.js';
import { revisionImageReferences, revisionImageFile, revisionImageState, snapshotRevisionImages } from './revision-images.js';

const run = promisify(execFile);
const git = (cwd, args) => run('git', args, { cwd, maxBuffer: 2_000_000 }).then(result => result.stdout);
const repoRootCache = new Map();

async function cachedRepoRoot(directory) {
  if (repoRootCache.has(directory)) return repoRootCache.get(directory);
  const promise = git(directory, ['rev-parse', '--show-toplevel']).then(out => out.trim()).catch(() => null);
  repoRootCache.set(directory, promise);
  return promise;
}

function articleText(source) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n([\s\S]*)$/);
  if (!match) return source.replace(/\r\n/g, '\n').trim();
  const metadata = parse(match[1]);
  const body = match[2].replace(/\r\n/g, '\n').trim();
  // A post may expose the same cover in front matter and in its Markdown body.
  // Include the synthetic cover only when the body does not already reference it;
  // otherwise one edit produces two identical before/after passages.
  const image = typeof metadata?.image === 'string' && !body.includes('](' + metadata.image + ')')
    ? '![Cover](' + metadata.image + ')\n\n' : '';
  return '# ' + String(metadata?.title || '') + '\n\n' + image + body;
}

function difference(before, after) {
  return unifiedDiff(before, after, 3).trim();
}

// Release numbering and front-matter-only changes do not change article history.
export async function readPostRevision(file, source, showChanges = false, assetsRoot = null) {
  const empty = { updated: null, changes: '' };
  try {
    const root = await cachedRepoRoot(dirname(file));
    if (!root) return empty;
    const path = relative(root, file).split('\\').join('/');
    const current = articleText(source);
    const refs = await revisionImageReferences(current);
    const imagePaths = [...refs.keys()]
      .map(href => revisionImageFile(href, assetsRoot))
      .filter(Boolean)
      .map(item => relative(root, item).split('\\').join('/'));
    const entries = (await git(root, ['log', '-n', '20', '--format=%H%x09%cI', '--', path, ...imagePaths]))
      .trim().split('\n').filter(Boolean);
    if (!entries.length) return empty;
    const working = { text: current, commit: null, images: await revisionImageState(current, assetsRoot, root, null, git) };
    const signature = state => state.text + '\n' + JSON.stringify([...state.images].map(([href, image]) => [href, image.oid]));
    const result = async (before, after, updated) => {
      if (!showChanges) return { updated, changes: '' };
      let changes = difference(before.text, after.text);
      for (const [href, image] of after.images) {
        const old = before.images.get(href);
        if (old && old.oid !== image.oid && !changes.includes(href)) {
          changes += '\n-![' + old.alt.replace(/[\[\]\r\n]/g, '') + '](' + href + ')\n+![' + image.alt.replace(/[\[\]\r\n]/g, '') + '](' + href + ')';
        }
      }
      const snapshots = await snapshotRevisionImages(
        before, after, changes, root,
        (cwd, args) => run('git', args, { cwd, maxBuffer: 20_000_000, encoding: 'buffer' }).then(res => res.stdout)
      );
      return { updated, changes, ...snapshots };
    };
    const history = [];
    for (const entry of entries) {
      const [commit, timestamp] = entry.split('\t');
      let text;
      try { text = articleText(await git(root, ['show', commit + ':' + path])); } catch { break; }
      const state = { text, commit, updated: new Date(timestamp), images: await revisionImageState(text, assetsRoot, root, commit, git) };
      history.push(state);
      if (history.length === 1 && signature(state) !== signature(working)) {
        const updated = (await stat(file)).mtime;
        return result(state, working, updated);
      }
      if (history.length > 1 && signature(history.at(-2)) !== signature(state)) {
        const latest = history.at(-2);
        return result(state, latest, latest.updated);
      }
    }
    return empty;
  } catch {
    // Missing Git or shallow history must never fabricate previous content.
    return empty;
  }
}
