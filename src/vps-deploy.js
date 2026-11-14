import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, posix, resolve } from 'node:path';
import { readSiteYaml } from './config.js';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}=?$/;

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
  const hostKeySha256 = nonempty(input.hostKeySha256, 'hostKeySha256');
  if (!FINGERPRINT.test(hostKeySha256)) throw new Error('deploy.vps.hostKeySha256 must be an SSH SHA256 host-key fingerprint');
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

export async function loadVpsDeploymentConfig(root = process.cwd()) {
  const site = await readSiteYaml(root);
  if (site.deploy !== undefined && (!site.deploy || typeof site.deploy !== 'object' || Array.isArray(site.deploy))) {
    throw new Error('config.yml deploy must be an object');
  }
  if (site.deploy && Object.keys(site.deploy).some(key => key !== 'vps')) {
    throw new Error('config.yml deploy only supports deploy.vps');
  }
  return validateVpsSettings(site.deploy?.vps);
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
        files.push({ local: fullPath, remote: child });
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
  if (isDirectory(attributes)) {
    const entries = await sftpCall(sftp, 'readdir', path);
    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue;
      if (!entry.filename || entry.filename.includes('/') || entry.filename.includes('\\')) {
        throw new Error('Invalid SFTP directory entry in ' + path);
      }
      await removeRemoteTree(sftp, posix.join(path, entry.filename));
    }
    await sftpCall(sftp, 'rmdir', path);
  } else {
    await sftpCall(sftp, 'unlink', path);
  }
}

export async function uploadStaticSite(sftp, output, remotePath, inventory = await inventorySite(output)) {
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
    for (const file of inventory.files) {
      await sftpCall(sftp, 'fastPut', file.local, posix.join(stage, file.remote), {
        concurrency: 4, chunkSize: 32768
      });
    }
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
        hostVerifier: publicKey => 'SHA256:' + createHash('sha256').update(publicKey).digest('base64').replace(/=+$/, '') ===
          settings.hostKeySha256.replace(/=+$/, '')
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
