import {lstat, mkdir, realpath} from 'node:fs/promises';
import {resolve, relative, isAbsolute, sep} from 'node:path';

export async function reportDirectory(root, create = true) {
  const project = await realpath(root);
  for (const directory of [resolve(root, 'tools'), resolve(root, 'tools/reports')]) {
    try {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Report directory must be a real directory: ' + directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return null;
      await mkdir(directory);
    }
    const path = await realpath(directory), local = relative(project, path);
    if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw new Error('Report directory must stay inside the project root');
  }
  return resolve(root, 'tools/reports');
}
