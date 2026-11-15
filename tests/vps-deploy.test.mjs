import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { join, posix } from 'node:path';
import { createHostKeyVerifier, inventorySite, loadVpsDeploymentConfig, uploadStaticSite, validateVpsSettings } from '../src/vps-deploy.js';

const fingerprint = 'SHA256:' + 'A'.repeat(43);
const example = { host: '203.0.113.42', username: 'deploy', remotePath: '/var/www/example', passwordEnv: 'DEPLOY_PASSWORD', hostKeySha256: fingerprint };

test('VPS configuration permits password, environment password and private key', () => {
  assert.equal(validateVpsSettings(example).port, 22);
  assert.equal(validateVpsSettings({ ...example, passwordEnv: undefined, password: 'secret', hostKeySha256: undefined }).password, 'secret');
  assert.equal(validateVpsSettings({ ...example, passwordEnv: undefined, password: 'p:@# $: 中文', hostKeySha256: undefined }).password, 'p:@# $: 中文');
  assert.equal(validateVpsSettings({ ...example, passwordEnv: undefined, privateKey: '~/.ssh/id_ed25519' }).privateKey, '~/.ssh/id_ed25519');
  assert.equal(validateVpsSettings({ ...example, port: 2222 }).port, 2222);
});

test('VPS configuration rejects unsafe targets, missing credentials and invalid pins', () => {
  for (const remotePath of ['/', '/var/../etc', 'relative/path', '//server/share', '/var/./www', '/var/site\nbad']) {
    assert.throws(() => validateVpsSettings({ ...example, remotePath }), /remotePath/);
  }
  assert.equal(validateVpsSettings({ ...example, hostKeySha256: undefined }).hostKeySha256, undefined);
  assert.throws(() => validateVpsSettings({ ...example, hostKeySha256: 'SHA256:invalid' }), /hostKeySha256/);
  assert.throws(() => validateVpsSettings({ ...example, passwordEnv: undefined }), /exactly one/);
  assert.throws(() => validateVpsSettings({ ...example, password: 'also-secret' }), /exactly one/);
  assert.throws(() => validateVpsSettings({ ...example, host: 'hostname;id' }), /host/);
  assert.throws(() => validateVpsSettings({ ...example, passwordEnv: 'INVALID-NAME' }), /passwordEnv/);
  assert.throws(() => validateVpsSettings({ ...example, other: 123 }), /Unsupported/);
});

test('VPS config loads named multi-node targets with unique destinations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-vps-targets-'));
  try {
    await writeFile(join(root, 'config.yml'), [
      'deploy:',
      '  vps:',
      '    targets:',
      '      - name: NYC',
      '        host: 192.0.2.10',
      '        username: root',
      '        remotePath: /var/www/site',
      '        passwordEnv: NYC_PASSWORD',
      '      - name: LAX',
      '        host: 192.0.2.11',
      '        username: root',
      '        remotePath: /var/www/site',
      '        passwordEnv: LAX_PASSWORD',
      ''
    ].join('\n'));
    const config = await loadVpsDeploymentConfig(root);
    assert.deepEqual(config.targets.map(({ name, host }) => [name, host]), [['NYC', '192.0.2.10'], ['LAX', '192.0.2.11']]);
    await writeFile(join(root, 'config.yml'), [
      'deploy:',
      '  vps:',
      '    targets:',
      '      - name: NYC',
      '        host: 192.0.2.10',
      '        username: root',
      '        remotePath: /var/www/site',
      '        passwordEnv: NYC_PASSWORD',
      '      - name: NYC',
      '        host: 192.0.2.11',
      '        username: root',
      '        remotePath: /var/www/site',
      '        passwordEnv: LAX_PASSWORD',
      ''
    ].join('\n'));
    await assert.rejects(loadVpsDeploymentConfig(root), /target names must be unique/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('optional host-key verification accepts only the pinned SSH key', () => {
  assert.equal(createHostKeyVerifier(undefined), undefined);
  const key = Buffer.from('sample SSH server public key');
  const fingerprint = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
  const verifier = createHostKeyVerifier(fingerprint);
  assert.equal(verifier(key), true);
  assert.equal(verifier(Buffer.from('different key')), false);
  assert.throws(() => createHostKeyVerifier('invalid'), /hostKeySha256/);
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

function fakeSftp({ failPublish = false, corruptUpload = false, uploadDelay = 0 } = {}) {
  const items = new Map([
    ['/var', 'dir'],
    ['/var/www', 'dir'],
    ['/var/www/example', 'dir'],
    ['/var/www/example/old.html', 'file']
  ]);
  const actions = [];
  const sizes = new Map();
  let publishFailed = false;
  let activeUploads = 0;
  let maxActiveUploads = 0;
  const missing = () => Object.assign(new Error('No such file'), { code: 2 });
  function callback(cb, error, value) { queueMicrotask(() => cb(error, value)); }
  const api = {
    actions, items,
    get maxActiveUploads() { return maxActiveUploads; },
    lstat(path, cb) {
      const type = items.get(path);
      callback(cb, type ? null : missing(), type ? { isDirectory: () => type === 'dir', isSymbolicLink: () => false, size: sizes.get(path) ?? 0 } : undefined);
    },
    readdir(path, cb) {
      const names = [...items.keys()].filter(p => p !== path && posix.dirname(p) === path)
        .map(p => ({ filename: posix.basename(p), attrs: { isDirectory: () => items.get(p) === 'dir', isSymbolicLink: () => false } }));
      callback(cb, null, names);
    },
    mkdir(path, cb) { actions.push(['mkdir', path]); items.set(path, 'dir'); callback(cb, null); },
    createWriteStream(remote) {
      let size = 0;
      activeUploads++;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      return new Writable({
        write(chunk, encoding, cb) { size += chunk.length; cb(); },
        final(cb) {
          const finish = () => {
            actions.push(['put', remote]);
            items.set(remote, 'file');
            sizes.set(remote, corruptUpload ? size + 1 : size);
            activeUploads--;
            cb();
          };
          if (uploadDelay) setTimeout(finish, uploadDelay);
          else finish();
        }
      });
    },
    rename(from, to, cb) {
      actions.push(['rename', from, to]);
      if (failPublish && !publishFailed && from.includes('edgepress-stage')) {
        publishFailed = true;
        callback(cb, new Error('simulated publish failure'));
        return;
      }
      const moved = [...items.entries()].filter(([path]) => path === from || path.startsWith(from + '/'));
      const oldSizes = moved.map(([path]) => sizes.get(path));
      for (const [path] of moved) { items.delete(path); sizes.delete(path); }
      moved.forEach(([path, type], i) => {
        const destination = to + path.slice(from.length);
        items.set(destination, type);
        if (oldSizes[i] !== undefined) sizes.set(destination, oldSizes[i]);
      });
      callback(cb, null);
    },
    unlink(path, cb) { actions.push(['unlink', path]); items.delete(path); sizes.delete(path); callback(cb, null); },
    rmdir(path, cb) { actions.push(['rmdir', path]); items.delete(path); sizes.delete(path); callback(cb, null); }
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

test('SFTP prevents a site swap when a streamed file has the wrong size', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-deploy-test-'));
  try {
    await writeFile(join(root, 'index.html'), 'new site');
    const sftp = fakeSftp({ corruptUpload: true });
    await assert.rejects(uploadStaticSite(sftp, root, '/var/www/example'), /size mismatch/);
    assert.equal(sftp.items.get('/var/www/example/old.html'), 'file');
    assert.equal([...sftp.items.keys()].some(path => path.includes('edgepress-stage')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('SFTP deploys several files concurrently while verifying each completed upload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'edgepress-deploy-test-'));
  try {
    await Promise.all(Array.from({ length: 20 }, (_, index) => writeFile(join(root, 'file-' + index + '.txt'), 'file ' + index)));
    const sftp = fakeSftp({ uploadDelay: 15 });
    const result = await uploadStaticSite(sftp, root, '/var/www/example');
    assert.equal(result.files, 20);
    assert.ok(sftp.maxActiveUploads > 1);
    assert.ok(sftp.maxActiveUploads <= 8);
    assert.equal([...sftp.items.keys()].filter(path => path.startsWith('/var/www/example/file-')).length, 20);
  } finally { await rm(root, { recursive: true, force: true }); }
});
