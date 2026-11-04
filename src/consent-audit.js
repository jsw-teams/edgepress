export const defaultConsentCheck = 'new visitors start with every optional service off';

export function recordConsentDefaults(report, dimensions, expectedServices) {
  const check = report.consentUi?.results.find(item => item.method === 'fresh-browser');
  if (!check) return;
  const off = dimensions.consentExists && dimensions.consentServiceCount === expectedServices && dimensions.consentOptInDefault;
  check.passed = check.passed !== false && off;
}

export function finalizeConsentChecks(report) {
  const consent = report.consentUi;
  if (!consent || consent.status === 'not enabled') return;
  const checks = [...consent.results, ...(consent.visualChecks || [])];
  consent.checks = checks.length;
  consent.passed = checks.filter(item => item.passed === true).length;
  consent.status = checks.some(item => item.passed === false) ? 'fail' : checks.some(item => item.passed === null) ? 'incomplete' : 'pass';
  const defaults = consent.results.find(item => item.method === 'fresh-browser');
  if (!defaults || defaults.passed === true) return;
  const message = defaults.passed === false
    ? 'Consent UI requirement failed: ' + defaultConsentCheck + '.'
    : 'Default optional-service choices were not verified in a fresh browser context.';
  if (!report.issues.some(issue => issue.category === 'consent-ui' && issue.message === message)) {
    report.issues.push({severity: defaults.passed === false ? 'error' : 'warning', category: 'consent-ui', page: 'privacy manager', message});
  }
}
