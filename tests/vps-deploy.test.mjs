import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { inventorySite, uploadStaticSite, validateVpsSettings } from '../src/vps-deploy.js';

const fingerprint = 'SHA256:' + 'A'.repeat(43);
const example = { host: '203.0.113.42', username: 'deploy', remotePath: '/var/www/example', passwordEnv: 'DEPLOY_PASSWORD', hostKeySha256: fingerprint };

test('VPS configuration permits password, environment password and private key', () => {
  assert.equal(validateVpsSettings(example).port, 22);
  assert.equal(validateVpsSettings({ ...example, passwordEnv: undefined, password: 'secret' }).password, 'secret');
  assert.equal(validateVpsSettings({ ...example, passwordEnv: undefined, privateKey: '~/.ssh/id_ed25519' }).privateKey, '~/.ssh/id_ed25519');
  assert.equal(validateVpsSettings({ ...example, port: 2222 }).port, 2222);
});

test('VPS configuration rejects unsafe targets, missing credentials and unpinned hosts', () => {
  for (const remotePath of ['/', '/var/../etc', 'relative/path', '//server/share', '/var/./www', '/var/site\nbad']) {
    assert.throws(() => validateVpsSettings({ ...example, remotePath }), /remotePath/);
  }
  assert.throws(() => validateVpsSettings({ ...example, hostKeySha256: undefined }), /hostKeySha256/);
  assert.throws(() => validateVpsSettings({ ...example, passwordEnv: undefined }), /exactly one/);
  assert.throws(() => validateVpsSettings({ ...example, password: 'also-secret' }), /exactly one/);
  assert.throws(() => validateVpsSettings({ ...example, host: 'hostname;id' }), /host/);
  assert.throws(() => validateVpsSettings({ ...example, passwordEnv: 'INVALID-NAME' }), /passwordEnv/);
  assert.throws(() => validateVpsSettings({ ...example, other: 123 }), /Unsupported/);
});

test('inventory enumerates generated files and rejects symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-deploy-test-'));
  try {
    await mkdir(join(root, 'blog'));
    await writeFile(join(root, 'index.html'), '<h1>Hello</h1>');
    await writeFile(join(root, 'blog', 'index.html'), 'Blog');
    const inventory = await inventorySite(root);
    assert.equal(inventory.files.length, 2);
    assert.equal(inventory.bytes, 18);
    assert.deepEqual(inventory.directories, ['blog']);
    await symlink(join(root, 'index.html'), join(root, 'linked.html'));
    await assert.rejects(inventorySite(root), /symlink/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fakeSftp({ failPublish = false } = {}) {
  const items = new Map([
    ['/var', 'dir'],
    ['/var/www', 'dir'],
    ['/var/www/example', 'dir'],
    ['/var/www/example/old.html', 'file']
  ]);
  const actions = [];
  let publishFailed = false;
  const missing = () => Object.assign(new Error('No such file'), { code: 2 });
  function callback(cb, error, value) { queueMicrotask(() => cb(error, value)); }
  const api = {
    actions, items,
    lstat(path, cb) {
      const type = items.get(path);
      callback(cb, type ? null : missing(), type ? { isDirectory: () => type === 'dir', isSymbolicLink: () => false } : undefined);
    },
    readdir(path, cb) {
      const names = [...items.keys()].filter(p => p !== path && posix.dirname(p) === path)
        .map(p => ({ filename: posix.basename(p) }));
      callback(cb, null, names);
    },
    mkdir(path, cb) { actions.push(['mkdir', path]); items.set(path, 'dir'); callback(cb, null); },
    fastPut(local, remote, options, cb) { actions.push(['put', remote]); items.set(remote, 'file'); callback(cb, null); },
    rename(from, to, cb) {
      actions.push(['rename', from, to]);
      if (failPublish && !publishFailed && from.includes('edgepress-stage')) {
        publishFailed = true;
        callback(cb, new Error('simulated publish failure'));
        return;
      }
      const moved = [...items.entries()].filter(([path]) => path === from || path.startsWith(from + '/'));
      for (const [path] of moved) items.delete(path);
      for (const [path, type] of moved) items.set(to + path.slice(from.length), type);
      callback(cb, null);
    },
    unlink(path, cb) { actions.push(['unlink', path]); items.delete(path); callback(cb, null); },
    rmdir(path, cb) { actions.push(['rmdir', path]); items.delete(path); callback(cb, null); }
  };
  return api;
}

test('SFTP stages the complete dist, swaps it and removes stale content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-deploy-test-'));
  try {
    await writeFile(join(root, 'index.html'), 'new site');
    const sftp = fakeSftp();
    const result = await uploadStaticSite(sftp, root, '/var/www/example');
    assert.equal(result.files, 1);
    assert.equal(sftp.items.get('/var/www/example/index.html'), 'file');
    assert.equal(sftp.items.has('/var/www/example/old.html'), false);
    assert.equal([...sftp.items.keys()].some(path => path.includes('edgepress-backup')), false);
    assert.equal(sftp.actions.filter(action => action[0] === 'rename').length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('SFTP restores the original site when publication rename fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-deploy-test-'));
  try {
    await writeFile(join(root, 'index.html'), 'new site');
    const sftp = fakeSftp({ failPublish: true });
    await assert.rejects(uploadStaticSite(sftp, root, '/var/www/example'), /simulated publish failure/);
    assert.equal(sftp.items.get('/var/www/example/old.html'), 'file');
    assert.equal(sftp.items.has('/var/www/example/index.html'), false);
    assert.equal([...sftp.items.keys()].some(path => path.includes('edgepress-stage')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
