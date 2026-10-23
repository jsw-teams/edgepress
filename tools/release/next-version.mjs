import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const versionPattern = /^(\d{4})\.(0?[1-9]|1[0-2])\.([1-9]\d*)$/;

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = versionPattern.exec(value.replace(/^v/, ''));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), iteration: Number(match[3]) };
}

export function nextReleaseVersion({ currentVersion, publishedVersions = [], tags = [], now = new Date() }) {
  const iso = now.toISOString();
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!parseVersion(currentVersion)) throw new Error('package.json must use YYYY.M.update-number with update-number >= 1');
  const history = [currentVersion, ...publishedVersions, ...tags].map(parseVersion).filter(Boolean);
  if (history.some(value => value.year > year || value.year === year && value.month > month)) {
    throw new Error('A future-month version already exists; refusing a non-monotonic npm release');
  }
  const last = Math.max(0, ...history.filter(value => value.year === year && value.month === month).map(value => value.iteration));
  return `${year}.${month}.${last + 1}`;
}

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const registryJSON = execFileSync('npm', ['view', pkg.name, 'versions', '--json'], { encoding: 'utf8', timeout: 60000 });
  const registryVersions = JSON.parse(registryJSON);
  const publishedVersions = Array.isArray(registryVersions) ? registryVersions : [registryVersions];
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const version = nextReleaseVersion({ currentVersion: pkg.version, publishedVersions, tags });
  const result = `version=${version}\ntag=v${version}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, result);
  else process.stdout.write(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
