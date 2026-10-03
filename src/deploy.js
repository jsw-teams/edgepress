import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {delimiter,dirname,resolve} from 'node:path';
export function deploymentCommand(platform, output = 'dist', args = []) {
  switch (platform) {
    case 'cloudflare': return ['wrangler', 'deploy', ...args];
    case 'vercel': return ['vercel', 'deploy', '--prod', ...args];
    case 'edgeone': return ['edgeone', 'pages', 'deploy', output, ...args];
    case 'esa': return ['esa-cli', 'deploy', '--assets', output, ...args];
    default: throw new Error('Platform must be cloudflare, vercel, edgeone, or esa');
  }
}
export async function deploySite(platform, output, args) {
  const command = deploymentCommand(platform, output, args);
  // npm exec resolves platform CLIs locally or installs them; platform authentication remains in its CLI.
  const windows = process.platform === 'win32';
  const executable = windows ? process.execPath : 'npm';
  const candidates = [process.env.npm_execpath?.replace(/npx-cli\.js$/i,'npm-cli.js'), ...[dirname(process.execPath),...(process.env.PATH || process.env.Path || '').split(delimiter)].map(directory=>resolve(directory,'node_modules/npm/bin/npm-cli.js'))];
  const npmCli = windows ? candidates.find(candidate=>candidate && existsSync(candidate)) : null;
  if(windows && !npmCli)throw new Error('npm CLI was not found. Install Node.js with npm or run deployment from npm run.');
  const parameters = [...(windows ? [npmCli] : []), 'exec', '--yes', '--', ...command];
  await new Promise((resolve, reject) => {
    const child = spawn(executable, parameters, {stdio:'inherit', windowsHide:true});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(platform + ' deployment failed: ' + code)));
  });
}
