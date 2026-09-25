import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function versionAtLeast(current, minimum) {
  const currentParts = current.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  if (currentParts.length !== 3 || minimumParts.length !== 3 || [...currentParts, ...minimumParts].some((part) => !Number.isInteger(part))) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] !== minimumParts[index]) return currentParts[index] > minimumParts[index];
  }
  return true;
}

export async function checkCompatibility(config) {
  const root = config.root;
  const manifest = await readJson(resolve(root, 'project-compatibility.json'));
  const wranglerText = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');
  const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
  const issues = [];
  const nodeVersion = process.versions.node;
  const minimumNodeVersion = manifest.requirements.nodeMinimumVersion || (manifest.requirements.nodeMajor + '.0.0');
  if (!versionAtLeast(nodeVersion, minimumNodeVersion)) {
    issues.push({ severity: 'error', message: 'Build requires Node.js ' + minimumNodeVersion + ' or newer.' });
  }
  const workerDate = String(wrangler.compatibility_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workerDate)) {
    issues.push({ severity: 'error', message: 'wrangler.jsonc needs a valid compatibility_date.' });
  } else if (workerDate < manifest.requirements.minimumWorkersDate) {
    issues.push({ severity: 'error', message: 'Workers compatibility_date is older than the supported minimum.' });
  }
  if (!wrangler.assets || !wrangler.assets.directory || wrangler.assets.binding !== 'ASSETS') {
    issues.push({ severity: 'error', message: 'Configure the ASSETS binding and static assets directory in Wrangler.' });
  }
  const workerSource = await readFile(resolve(root, 'src/worker.js'), 'utf8');
  if (/from\s+['"]node:|require\s*\(\s*['"]node:/i.test(workerSource)) {
    issues.push({ severity: 'error', message: 'The Worker entry imports a Node.js built-in; keep build-only APIs out of src/worker.js.' });
  }
  const first = wrangler.assets?.run_worker_first;
  if (!Array.isArray(first) || !first.includes('/api/*')) {
    issues.push({ severity: 'warning', message: 'Keep Worker-first routing limited to API paths so static pages bypass script execution.' });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: issues.some((issue) => issue.severity === 'error') ? 'fail' : issues.length ? 'warning' : 'pass',
    runtime: { node: process.versions.node, workersDate: workerDate || 'missing' },
    requirements: manifest.requirements,
    features: manifest.features,
    issues
  };
  return report;
}

export async function writeIterationPlan(config, pageReport, compatibilityReport) {
  const actions = [];
  for (const issue of pageReport.issues) {
    actions.push({ source: 'page-check', severity: issue.severity, action: 'Review ' + issue.page + ': ' + issue.message });
  }
  for (const issue of compatibilityReport.issues) {
    actions.push({ source: 'compatibility', severity: issue.severity, action: issue.message });
  }
  actions.push({
    source: 'security',
    severity: 'info',
    action: 'Review dependency advisories with edgepress security; update dependencies in a reviewed branch.'
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'report-only',
    status: actions.some((item) => item.severity === 'error') ? 'review-required' : 'ready-for-review',
    actions,
    safety: {
      sourceFilesChanged: false,
      dependenciesChanged: false,
      deploymentTriggered: false
    }
  };
  const directory = resolve(config.resolvedPaths.cache, 'reports');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'iteration-plan.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(resolve(directory, 'iteration-plan.md'), [
    '# EdgePress iteration plan',
    '',
    'Mode: report only. No source, dependency, or deployment changes were made.',
    '',
    ...actions.map((item) => '- [' + item.severity.toUpperCase() + '] ' + item.action)
  ].join('\n'), 'utf8');
  return report;
}
