import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, posix, resolve } from 'node:path';
import { readSiteYaml } from './config.js';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}=?$/;
const UPLOAD_CONCURRENCY = 8;

async function mapConcurrent(items, concurrency, operation) {
  let next = 0;
  let failure;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure) {
      const index = next++;
      if (index >= items.length) return;
      try { await operation(items[index], index); }
      catch (error) { failure ??= error; }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
}

function nonempty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('deploy.vps.' + name + ' must be a non-empty string');
  return value.trim();
}

export function validateVpsSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Configure deploy.vps in config.yml before running edgepress d');
  }
  const allowed = new Set(['host', 'port', 'username', 'remotePath', 'password', 'passwordEnv', 'privateKey', 'passphrase', 'passphraseEnv', 'hostKeySha256']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error('Unsupported deploy.vps option: ' + key);
  }
  const host = nonempty(input.host, 'host');
  if (!/^[A-Za-z0-9.:-]+$/.test(host) || host.includes('..')) throw new Error('deploy.vps.host must be a hostname or IP address');
  const username = nonempty(input.username, 'username');
  if (!/^[A-Za-z0-9_.-]+$/.test(username) || username.startsWith('-')) throw new Error('deploy.vps.username is invalid');
  const port = input.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('deploy.vps.port must be an integer between 1 and 65535');
  const remotePath = nonempty(input.remotePath, 'remotePath');
  if (!remotePath.startsWith('/') || remotePath.startsWith('//') || remotePath === '/' ||
      /[\\\x00-\x1f\x7f]/.test(remotePath) || remotePath.split('/').some(part => part === '.' || part === '..') ||
      posix.normalize(remotePath.replace(/\/+$/, '')) !== remotePath.replace(/\/+$/, '')) {
    throw new Error('deploy.vps.remotePath must be an absolute, normalized VPS directory other than /');
  }
  const hostKeySha256 = input.hostKeySha256 === undefined ? undefined : nonempty(input.hostKeySha256, 'hostKeySha256');
  if (hostKeySha256 !== undefined && !FINGERPRINT.test(hostKeySha256)) {
    throw new Error('deploy.vps.hostKeySha256 must be an SSH SHA256 host-key fingerprint');
  }
  const auth = ['password', 'passwordEnv', 'privateKey'].filter(key => input[key] !== undefined);
  if (auth.length !== 1) throw new Error('Set exactly one of deploy.vps.password, passwordEnv or privateKey');
  for (const key of [...auth, 'passphrase', 'passphraseEnv']) {
    if (input[key] !== undefined) nonempty(input[key], key);
  }
  if (input.passwordEnv !== undefined && !ENV_NAME.test(input.passwordEnv)) throw new Error('deploy.vps.passwordEnv must be an environment-variable name');
  if (input.passphraseEnv !== undefined && !ENV_NAME.test(input.passphraseEnv)) throw new Error('deploy.vps.passphraseEnv must be an environment-variable name');
  if (input.passphrase !== undefined && input.passphraseEnv !== undefined) throw new Error('Set only one private-key passphrase source');
  if ((input.passphrase !== undefined || input.passphraseEnv !== undefined) && input.privateKey === undefined) {
    throw new Error('Private-key passphrases require deploy.vps.privateKey');
  }
  return { ...input, host, username, port, remotePath: remotePath.replace(/\/+$/, ''), hostKeySha256 };
}

export function createHostKeyVerifier(fingerprint) {
  if (fingerprint === undefined) return undefined;
  if (typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint)) {
    throw new Error('deploy.vps.hostKeySha256 must be an SSH SHA256 host-key fingerprint');
  }
  const expected = fingerprint.replace(/=+$/, '');
  return publicKey => 'SHA256:' + createHash('sha256').update(publicKey).digest('base64').replace(/=+$/, '') === expected;
}

export async function loadVpsDeploymentConfig(root = process.cwd()) {
  const site = await readSiteYaml(root);
  if (site.deploy !== undefined && (!site.deploy || typeof site.deploy !== 'object' || Array.isArray(site.deploy))) {
    throw new Error('config.yml deploy must be an object');
  }
  if (site.deploy && Object.keys(site.deploy).some(key => key !== 'vps')) {
    throw new Error('config.yml deploy only supports deploy.vps');
  }
  const input = site.deploy?.vps;
  if (input && typeof input === 'object' && !Array.isArray(input) && Object.hasOwn(input, 'targets')) {
    if (Object.keys(input).some(key => key !== 'targets')) {
      throw new Error('When deploy.vps.targets is used, put connection settings on each target');
    }
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      throw new Error('deploy.vps.targets must be a non-empty list');
    }
    const names = new Set();
    const destinations = new Set();
    const targets = input.targets.map((target, index) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new Error('deploy.vps.targets[' + index + '] must be an object');
      }
      const name = nonempty(target.name, 'targets[' + index + '].name');
      if (!/^[A-Za-z0-9_-]+$/.test(name) || names.has(name)) {
        throw new Error('deploy.vps target names must be unique and use letters, numbers, _ or -');
      }
      names.add(name);
      const { name: _name, ...connection } = target;
      const settings = validateVpsSettings(connection);
      const destination = settings.host + ':' + settings.remotePath;
      if (destinations.has(destination)) throw new Error('deploy.vps targets must have unique host and remotePath pairs');
      destinations.add(destination);
      return { name, ...settings };
    });
    return { targets };
  }
  return validateVpsSettings(input);
}

async function credentials(settings, root) {
  if (settings.password !== undefined) return { password: settings.password };
  if (settings.passwordEnv !== undefined) {
    const password = process.env[settings.passwordEnv];
    if (!password) throw new Error('Missing VPS password environment variable: ' + settings.passwordEnv);
    return { password };
  }
  const supplied = settings.privateKey;
  const expanded = supplied === '~' ? homedir() :
    supplied.startsWith('~/') || supplied.startsWith('~\\') ? join(homedir(), supplied.slice(2)) : supplied;
  const keyPath = isAbsolute(expanded) ? expanded : resolve(root, expanded);
  const info = await lstat(keyPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('deploy.vps.privateKey must point to a regular private-key file');
  const privateKey = await readFile(keyPath);
  let passphrase = settings.passphrase;
  if (settings.passphraseEnv !== undefined) {
    passphrase = process.env[settings.passphraseEnv];
    if (!passphrase) throw new Error('Missing VPS passphrase environment variable: ' + settings.passphraseEnv);
  }
  return { privateKey, ...(passphrase === undefined ? {} : { passphrase }) };
}

export async function inventorySite(output) {
  const info = await lstat(output);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The generated output must be a regular directory');
  const directories = [];
  const files = [];
  let bytes = 0;
  async function visit(path, relativePath) {
    const entries = await readdir(path, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = join(path, entry.name);
      const child = relativePath ? relativePath + '/' + entry.name : entry.name;
      const attributes = await lstat(fullPath);
      if (attributes.isSymbolicLink()) throw new Error('Refusing to deploy an output symlink: ' + child);
      if (attributes.isDirectory()) {
        directories.push(child);
        await visit(fullPath, child);
      } else if (attributes.isFile()) {
        files.push({ local: fullPath, remote: child, bytes: attributes.size });
        bytes += attributes.size;
      } else {
        throw new Error('Unsupported generated output entry: ' + child);
      }
    }
  }
  await visit(output, '');
  if (!files.length) throw new Error('The generated output directory is empty');
  return { directories, files, bytes };
}

function sftpCall(sftp, action, ...args) {
  return new Promise((resolvePromise, reject) => {
    sftp[action](...args, (error, value) => error ? reject(error) : resolvePromise(value));
  });
}

async function remoteStat(sftp, path) {
  try { return await sftpCall(sftp, 'lstat', path); }
  catch (error) {
    if (error.code === 2 || error.code === 'ENOENT') return null;
    throw error;
  }
}

function isDirectory(attributes) {
  return typeof attributes?.isDirectory === 'function' && attributes.isDirectory() &&
    !(typeof attributes.isSymbolicLink === 'function' && attributes.isSymbolicLink());
}

async function removeRemoteTree(sftp, path) {
  const attributes = await remoteStat(sftp, path);
  if (!attributes) return;
  if (!isDirectory(attributes)) return sftpCall(sftp, 'unlink', path);
  const files = [];
  const directories = [path];
  async function collect(directory) {
    const entries = await sftpCall(sftp, 'readdir', directory);
    const childDirectories = [];
    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue;
      if (!entry.filename || entry.filename.includes('/') || entry.filename.includes('\\')) {
        throw new Error('Invalid SFTP directory entry in ' + directory);
      }
      const child = posix.join(directory, entry.filename);
      const childAttributes = entry.attrs ?? await remoteStat(sftp, child);
      if (!childAttributes) continue;
      if (isDirectory(childAttributes)) {
        directories.push(child);
        childDirectories.push(child);
      } else {
        files.push(child);
      }
    }
    await mapConcurrent(childDirectories, UPLOAD_CONCURRENCY, collect);
  }
  await collect(path);
  await mapConcurrent(files, 32, file => sftpCall(sftp, 'unlink', file));
  const depths = [...new Set(directories.map(directory => directory.split('/').length))].sort((a, b) => b - a);
  for (const depth of depths) {
    await mapConcurrent(directories.filter(directory => directory.split('/').length === depth), UPLOAD_CONCURRENCY,
      directory => sftpCall(sftp, 'rmdir', directory));
  }
}

export async function uploadStaticSite(sftp, output, remotePath, inventory = null) {
  inventory ??= await inventorySite(output);
  const parent = posix.dirname(remotePath);
  if (!isDirectory(await remoteStat(sftp, parent))) {
    throw new Error('VPS destination parent must already be a writable directory: ' + parent);
  }
  const existing = await remoteStat(sftp, remotePath);
  if (existing && !isDirectory(existing)) throw new Error('VPS destination must be a directory, not a file or symlink');
  const suffix = randomUUID();
  const name = posix.basename(remotePath);
  const stage = posix.join(parent, '.' + name + '.edgepress-stage-' + suffix);
  const backup = posix.join(parent, '.' + name + '.edgepress-backup-' + suffix);
  let movedOriginal = false;
  let published = false;
  await sftpCall(sftp, 'mkdir', stage);
  try {
    for (const directory of inventory.directories) {
      await sftpCall(sftp, 'mkdir', posix.join(stage, directory));
    }
    let uploadedCount = 0;
    await mapConcurrent(inventory.files, UPLOAD_CONCURRENCY, async file => {
      const destination = posix.join(stage, file.remote);
      await pipeline(createReadStream(file.local), sftp.createWriteStream(destination, { flags: 'w', mode: 0o644 }));
      const uploaded = await remoteStat(sftp, destination);
      if (!uploaded || uploaded.size !== file.bytes) throw new Error('SFTP upload size mismatch: ' + file.remote);
      uploadedCount++;
      if (uploadedCount % 50 === 0 || uploadedCount === inventory.files.length) {
        console.log('VPS upload progress: ' + uploadedCount + '/' + inventory.files.length + ' files');
      }
    });
    if (existing) {
      await sftpCall(sftp, 'rename', remotePath, backup);
      movedOriginal = true;
    }
    try {
      await sftpCall(sftp, 'rename', stage, remotePath);
      published = true;
    } catch (error) {
      if (movedOriginal) {
        try {
          await sftpCall(sftp, 'rename', backup, remotePath);
          movedOriginal = false;
        } catch (restoreError) {
          throw new AggregateError([error, restoreError], 'VPS deployment failed and the original directory could not be restored; backup: ' + backup);
        }
      }
      throw error;
    }
  } finally {
    if (!published) {
      try { await removeRemoteTree(sftp, stage); }
      catch (error) { console.warn('Could not clean up the incomplete VPS staging directory: ' + stage + ' (' + error.message + ')'); }
    }
  }
  if (movedOriginal) {
    try { await removeRemoteTree(sftp, backup); }
    catch (error) { console.warn('Deployed successfully, but old VPS files remain in ' + backup + ': ' + error.message); }
  }
  return { files: inventory.files.length, bytes: inventory.bytes };
}

export async function deployVps(output, settings, { dryRun = false, root = process.cwd() } = {}) {
  const inventory = await inventorySite(output);
  if (dryRun) {
    console.log('VPS dry run: ' + inventory.files.length + ' files (' + inventory.bytes + ' bytes) from ' + output +
      ' to ' + settings.username + '@' + settings.host + ':' + settings.remotePath + '; no connection or upload');
    return { files: inventory.files.length, bytes: inventory.bytes };
  }
  if (!settings.hostKeySha256) {
    console.warn('VPS SSH host key is not verified; set deploy.vps.hostKeySha256 to enable server identity checking.');
  }
  const auth = await credentials(settings, root);
  const ssh2 = await import('ssh2');
  const Client = ssh2.Client ?? ssh2.default.Client;
  const client = new Client();
  // Keep an error listener active after the connection becomes ready.
  client.on('error', () => {});
  try {
    await new Promise((resolvePromise, reject) => {
      client.once('ready', resolvePromise);
      client.once('error', reject);
      client.connect({
        host: settings.host,
        port: settings.port,
        username: settings.username,
        ...auth,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        ...(settings.hostKeySha256 ? { hostVerifier: createHostKeyVerifier(settings.hostKeySha256) } : {})
      });
    });
    const sftp = await new Promise((resolvePromise, reject) =>
      client.sftp((error, channel) => error ? reject(error) : resolvePromise(channel)));
    const result = await uploadStaticSite(sftp, output, settings.remotePath, inventory);
    console.log('VPS deployed: ' + result.files + ' files to ' + settings.host + ':' + settings.remotePath);
    return result;
  } finally {
    client.end();
  }
}
