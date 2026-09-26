import { access, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { addVisualEvidence } from './report-visuals.js';
import { renderMarkdown, renderMarkdownExcerpt } from './markdown.js';

async function htmlFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('Build output is missing. Run npm run build first.'); throw error; }
  const result = [];
  for (const entry of entries) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await htmlFiles(file));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') result.push(file);
  }
  return result;
}

async function allFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const result = [];
  for (const entry of entries) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await allFiles(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

function hasAccessibleName(attributes, inner) {
  if (/\baria-label\s*=\s*["'][^"']+\s*["']/i.test(attributes)) return true;
  if (inner.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim()) return true;
  return /<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(inner);
}

async function exists(path) {
  try { await access(path); return true; }
  catch { return false; }
}

async function contentDocuments(output, config) {
  const documents = new Map();
  for (const locale of config.i18n.locales) {
    const prefix = locale === config.i18n.defaultLocale ? '' : locale + '/';
    let entries;
    try { entries = JSON.parse(await readFile(resolve(output, prefix + 'search.json'), 'utf8')); }
    catch { continue; }
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!['post', 'page'].includes(entry.type) || typeof entry.url !== 'string') continue;
      let pathname;
      try { pathname = decodeURIComponent(new URL(entry.url, 'https://edgepress.invalid').pathname); }
      catch { continue; }
      const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      const target = resolve(output, ...segments, 'index.html');
      documents.set(target, { type: entry.type, title: String(entry.title || ''), url: entry.url });
    }
  }
  return documents;
}

async function markdownFeatureCoverage(root, files, sourceByFile) {
  const expected = [
    ['headings 2 through 6', /<h2\b[\s\S]*?<h3\b[\s\S]*?<h4\b[\s\S]*?<h5\b[\s\S]*?<h6\b/i],
    ['Setext heading syntax', /<h2\b[^>]*>Setext (?:heading level two|二级标题示例)<\/h2>/i],
    ['paragraphs and hard line breaks', /<p\b[\s\S]*?<br\s*\/?\s*>/i],
    ['hyphen, asterisk, and underscore thematic breaks', (html) => (html.match(/<hr\b/gi) || []).length >= 3],
    ['emphasis and strong emphasis', /<em\b[\s\S]*?<\/em>[\s\S]*?<strong\b[\s\S]*?<\/strong>/i],
    ['strikethrough', /<del\b[\s\S]*?<\/del>/i],
    ['inline and fenced code', /<code\b[\s\S]*?<\/code>[\s\S]*?<pre\b[\s\S]*?<code\b[^>]*class="language-js"/i],
    ['tilde-fenced and four-space-indented code', /class="language-text"[\s\S]*?<pre\b[^>]*><code[^>]*>const indented =/i],
    ['code spans containing a literal backtick', (html) => html.includes('<code>`</code>')],
    ['escaped Markdown punctuation and character references', /\\\*[\s\S]*?&lt;[\s\S]*?&amp;/i],
    ['inline and reference links', /href="\/quick-start\/"/i],
    ['GFM automatic links', /href="https:\/\/www\.markdownguide\.org\//i],
    ['angle-bracket, www, and email automatic links', /href="https:\/\/commonmark\.org"[\s\S]*?href="http:\/\/www\.example\.com"[\s\S]*?href="mailto:team@example\.com"/i],
    ['images with alternative text', /<img\b[^>]*src="\/edgepress-markdown-guide\.svg"[^>]*alt="[^"]+"/i],
    ['image-shaped video Markdown syntax documented', (html) => html.includes('field-recording.mp4')],
    ['nested lists with inline formatting', /<li>[\s\S]*?<strong\b[\s\S]*?<ol\b[\s\S]*?<li>/i],
    ['task lists with accessible status names', /markdown-task-status" role="img" aria-label="[^"]+"/i],
    ['lists nested inside block quotes', /<blockquote>[\s\S]*?<ul\b[\s\S]*?<\/blockquote>/i],
    ['nested block quotes', /<blockquote>[\s\S]*?<blockquote>/i],
    ['tables and inline table syntax', /<table\b[\s\S]*?<th\b[\s\S]*?<em\b[\s\S]*?<\/table>/i],
    ['safe semantic inline HTML', /<kbd>Ctrl<\/kbd>/i],
    ['sanitization of active script markup', (html) => !/<script\b[^>]*>alert\(/i.test(html)]
  ];
  const videoMarkdown = '![A kite crossing a field](https://media.example.org/field-recording.mp4 "Wind test")';
  const videoHtml = await renderMarkdown(videoMarkdown);
  const excerptHtml = await renderMarkdownExcerpt('A **formatted** excerpt with _emphasis_ and `code`.');
  let unsafeVideoRejected = false;
  try { await renderMarkdown('![Unsafe video](javascript:alert(1).mp4)'); }
  catch { unsafeVideoRejected = true; }
  const videoChecks = [
    ['image-shaped video syntax renders an accessible native player with deferred media',
      /<video controls playsinline preload="none" aria-label="A kite crossing a field"><source src="https:\/\/media\.example\.org\/field-recording\.mp4" type="video\/mp4"/i.test(videoHtml)],
    ['video title renders as a caption', /<figcaption>Wind test<\/figcaption>/i.test(videoHtml)],
    ['unsafe video URL is rejected', unsafeVideoRejected],
    ['post-list excerpt preserves inline Markdown formatting', /<strong>formatted<\/strong>[\s\S]*?<em>emphasis<\/em>[\s\S]*?<code>code<\/code>/i.test(excerptHtml)]
  ];
  const guides = files.filter((file) => /markdown-syntax-guide\/index\.html$/i.test(file.replace(/\\/g, '/')));
  const documents = guides.map((file) => {
    const html = sourceByFile.get(file) || '';
    const content = html.match(/<div class="post-content">([\s\S]*?)<\/div>/i)?.[1] || '';
    const checks = [
      ...expected.map(([feature, matcher]) => ({ feature, passed: typeof matcher === 'function' ? matcher(content) : matcher.test(content) })),
      ...videoChecks.map(([feature, passed]) => ({ feature, passed }))
    ];
    return { path: relative(root, file).replace(/\\/g, '/'), checks, passed: checks.filter((item) => item.passed).length };
  });
  return {
    status: guides.length && documents.every((document) => document.checks.every((item) => item.passed)) ? 'pass' : 'fail',
    checks: (expected.length + videoChecks.length) * Math.max(1, guides.length),
    passed: documents.reduce((total, document) => total + document.passed, 0),
    documents
  };
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

async function resolveLocalLink(output, pageFile, href) {
  let url;
  try { url = new URL(href, 'https://edgepress.invalid/' + relative(output, pageFile).split(sep).join('/')); }
  catch { return null; }
  if (url.origin !== 'https://edgepress.invalid') return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return { broken: true, target: href }; }
  const clean = pathname.replace(/^\/+/, '');
  const candidates = [];
  if (!clean || clean.endsWith('/')) candidates.push(resolve(output, clean, 'index.html'));
  else if (extname(clean)) candidates.push(resolve(output, clean));
  else candidates.push(resolve(output, clean + '.html'), resolve(output, clean, 'index.html'));
  for (const candidate of candidates) {
    if (!candidate.startsWith(output + sep)) continue;
    if (await exists(candidate)) {
      let fragment = url.hash.slice(1);
      try { fragment = decodeURIComponent(fragment); }
      catch { return { broken: true, target: href }; }
      return { file: candidate, fragment };
    }
  }
  return { broken: true, target: href };
}

function auditSummary(checks, findings) {
  const errors = findings.filter((issue) => issue.severity === 'error').length;
  const warnings = findings.length - errors;
  return {
    status: errors ? 'fail' : warnings ? 'warning' : 'pass',
    score: checks ? Math.floor((checks - findings.length) / checks * 100) : 100,
    checks,
    errors,
    warnings
  };
}

export async function checkPages(config) {
  const output = config.resolvedPaths.output;
  const files = await htmlFiles(output);
  const contentMap = await contentDocuments(output, config);
  const issues = [];
  const auditFindings = { accessibility: [], agentFriendliness: [] };
  const auditChecks = { accessibility: 0, agentFriendliness: 0 };
  const pageIds = new Map();
  const sourceByFile = new Map();
  const metrics = { htmlBytes: 0, stylesheets: 0, blockingStylesheets: 0, scripts: 0, blockingScripts: 0 };
  const inspect = (category, fails, severity, page, message) => {
    auditChecks[category] += 1;
    if (!fails) return;
    const finding = { severity, category, page, message };
    issues.push(finding);
    auditFindings[category].push(finding);
  };
  const addFinding = (severity, category, page, message) => issues.push({ severity, category, page, message });

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    sourceByFile.set(file, html);
    pageIds.set(file, new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])));
    metrics.htmlBytes += Buffer.byteLength(html);
  }
  const markdownRendering = await markdownFeatureCoverage(output, files, sourceByFile);
  if (!markdownRendering.documents.length) {
    addFinding('error', 'markdown-rendering', 'content/posts', 'The Markdown syntax guide post was not generated.');
  }
  for (const document of markdownRendering.documents) {
    for (const check of document.checks.filter((item) => !item.passed)) {
      addFinding('error', 'markdown-rendering', document.path, 'Markdown syntax did not render: ' + check.feature + '.');
    }
  }
  for (const file of files) {
    const html = sourceByFile.get(file);
    const page = relative(output, file).split(sep).join('/');
    inspect('accessibility', !/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html), 'error', page, 'Missing document language (html lang).');
    inspect('accessibility', !/<main\b/i.test(html), 'error', page, 'Missing main landmark.');
    const h1Count = [...html.matchAll(/<h1\b/gi)].length;
    inspect('accessibility', h1Count !== 1, 'warning', page, 'Expected exactly one h1 heading.');
    inspect('agentFriendliness', h1Count !== 1, 'warning', page, 'A single page-level heading helps identify the page topic.');
    for (const match of html.matchAll(/<nav\b([^>]*)>/gi)) {
      inspect('accessibility', !/\baria-label\s*=\s*["'][^"']+/.test(match[1]), 'warning', page, 'Navigation landmark has no accessible label.');
    }
    inspect('agentFriendliness', !/<title>\s*[^<]+\s*<\/title>/i.test(html), 'error', page, 'Missing or empty page title.');
    inspect('agentFriendliness', !/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(html), 'warning', page, 'Missing meta description.');
    const canonical = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i)?.[0] ?? '';
    const canonicalHref = canonical.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    inspect('agentFriendliness', !canonicalHref || (config.site.url && !canonicalHref.startsWith(config.site.url)), 'warning', page, 'Missing or non-canonical URL metadata.');
    const jsonLd = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    let validStructuredData = false;
    try { validStructuredData = Boolean(jsonLd && JSON.parse(jsonLd)?.['@context'] === 'https://schema.org'); } catch { validStructuredData = false; }
    inspect('agentFriendliness', !validStructuredData, 'warning', page, 'Missing or invalid Schema.org JSON-LD.');

    const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    inspect('accessibility', new Set(ids).size !== ids.length, 'warning', page, 'Duplicate HTML id values were found.');
    let previousHeading = 0;
    let skippedHeadingLevel = false;
    for (const match of html.matchAll(/<h([1-6])\b/gi)) {
      const level = Number(match[1]);
      if (previousHeading && level > previousHeading + 1) skippedHeadingLevel = true;
      previousHeading = level;
    }
    inspect('accessibility', skippedHeadingLevel, 'warning', page, 'Heading levels skip one or more steps.');

    for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
      inspect('accessibility', !/\balt\s*=/.test(match[1]), 'error', page, 'Image is missing an alt attribute.');
    }
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      inspect('accessibility', !hasAccessibleName(match[1], match[2]), 'error', page, 'Link has no accessible name.');
      if (/\btarget\s*=\s*["']_blank["']/i.test(match[1]) && !/\brel\s*=\s*["'][^"']*noopener/i.test(match[1])) {
        inspect('accessibility', true, 'warning', page, 'A new-tab link should include rel="noopener".');
      }
      const href = match[1].match(/\bhref\s*=\s*["']([^"']+)\s*["']/i)?.[1];
      if (!href || /^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
      const target = await resolveLocalLink(output, file, href);
      if (target?.broken) {
        inspect('accessibility', true, 'error', page, 'Broken internal link: ' + href);
        inspect('agentFriendliness', true, 'error', page, 'Broken internal link: ' + href);
      } else if (target?.file) {
        inspect('agentFriendliness', false, 'warning', page, 'Internal link resolves: ' + href);
        if (target.fragment && extname(target.file).toLowerCase() === '.html') {
          let idsForTarget = pageIds.get(target.file);
          if (!idsForTarget) {
            const targetHtml = sourceByFile.get(target.file) ?? await readFile(target.file, 'utf8');
            idsForTarget = new Set([...targetHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((item) => item[1]));
            pageIds.set(target.file, idsForTarget);
          }
          inspect('accessibility', !idsForTarget.has(target.fragment), 'warning', page, 'Link fragment not found: ' + href);
        }
      }
    }

    for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
      if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(match[1])) continue;
      metrics.stylesheets += 1;
      const media = match[1].match(/\bmedia\s*=\s*["']([^"']+)["']/i)?.[1].trim().toLowerCase();
      if (!media || media === 'all') metrics.blockingStylesheets += 1;
      const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
      if (/\.css(?:[?#]|$)/i.test(href) && !/\.[a-f0-9]{16}\.css(?:[?#]|$)/i.test(href)) {
        addFinding('warning', 'performance', page, 'Stylesheet URL is not content-fingerprinted: ' + href);
      }
    }
    for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
      if (!/\bsrc\s*=/.test(match[1])) continue;
      metrics.scripts += 1;
      if (!/\b(?:async|defer)\b/i.test(match[1]) && !/\btype\s*=\s*["']module["']/i.test(match[1])) {
        metrics.blockingScripts += 1;
        addFinding('warning', 'performance', page, 'External script may block rendering; use defer, async, or a module script.');
      }
    }
  }

  const all = await allFiles(output);
  const hashedAssets = all.filter((file) => /\.[a-f0-9]{16}\.(?:css|js)$/i.test(file))
    .map((file) => relative(output, file).split(sep).join('/'));
  const styleFiles = all.filter((file) => extname(file).toLowerCase() === '.css');
  let styles = '';
  if (styleFiles.length) {
    styles = (await Promise.all(styleFiles.map((file) => readFile(file, 'utf8')))).join('\n');
    inspect('accessibility', !/:focus(?:-visible)?\s*\{[^}]*outline/i.test(styles), 'warning', 'theme', 'No visible keyboard focus outline was found in the generated CSS.');
  } else {
    inspect('accessibility', true, 'warning', 'theme', 'No stylesheet was found to inspect for keyboard focus styles.');
  }

  const consentConfig = config.browserPlugins.consent;
  const consentUiChecks = [];
  if (consentConfig.enabled) {
    const consentCheck = (name, passed) => consentUiChecks.push({ name, passed });
    let managerScript = '';
    const managerAsset = all.find((file) => {
      const path = relative(output, file).split(sep).join('/');
      return /^edgepress\/plugins\/consent\/manager\.[a-f0-9]{16}\.js$/i.test(path);
    });
    if (managerAsset) {
      try { managerScript = await readFile(managerAsset, 'utf8'); }
      catch { /* The missing manager is reported below. */ }
    }
    const htmlWithConsent = files.filter((file) => {
      const html = sourceByFile.get(file) || '';
      return html.includes('edgepress-privacy-config') && /\/edgepress\/plugins\/consent\/manager\.[a-f0-9]{16}\.js/i.test(html);
    });
    consentCheck('privacy controls are injected on every generated page', files.length > 0 && htmlWithConsent.length === files.length);
    consentCheck('consent manager script was generated', Boolean(managerScript));
    consentCheck('service disclosure supports data categories, recipient, and retention',
      managerScript.includes('serviceDataCategories') && managerScript.includes('serviceRecipient') && managerScript.includes('serviceRetention'));
    consentCheck('stored choices are tied to proposed and effective dates',
      managerScript.includes('proposedDate: consent.proposedDate') && managerScript.includes('effectiveDate: consent.effectiveDate'));
    consentCheck('new visitors start with every optional service off', managerScript.includes('checkbox.checked = false'));
    consentCheck('accept and reject controls share the same component styling',
      /\.privacy-panel \.privacy-accept,\.privacy-manager \.privacy-panel \.privacy-reject\s*\{[^}]*background:[^}]*\}/.test(styles));
    const componentClass = /(?:^|[\s>+~])\.privacy-(?:manager|panel|settings-button|close|intro|essential|details|service-preview|preview-item|category|service-settings|service-setting|service-toggle|service-toggle-text|service-disclosures|actions|accept|reject|manage|save|empty|policy-link|controller)(?=$|[^\w-])/;
    let scoped = true;
    for (const match of styles.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const selector = match[1].trim();
      if (componentClass.test(selector) && !selector.includes('.privacy-manager')) scoped = false;
    }
    consentCheck('consent component CSS selectors stay within the manager', scoped);
  }
  const consentUi = consentConfig.enabled
    ? {
        status: consentUiChecks.every((item) => item.passed) ? 'pass' : 'fail',
        checks: consentUiChecks.length,
        passed: consentUiChecks.filter((item) => item.passed).length,
        results: consentUiChecks
      }
    : { status: 'not enabled', checks: 0, passed: 0, results: [] };
  for (const check of consentUiChecks.filter((item) => !item.passed)) {
    issues.push({ severity: 'error', category: 'consent-ui', page: 'privacy manager', message: 'Consent UI requirement failed: ' + check.name + '.' });
  }

  let robots = '';
  let sitemap = '';
  let llms = '';
  try { robots = await readFile(resolve(output, 'robots.txt'), 'utf8'); } catch { /* Checked below. */ }
  try { sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8'); } catch { /* Checked below. */ }
  inspect('agentFriendliness', !robots.includes('User-agent: *') || !robots.includes('Sitemap:'), 'warning', 'robots.txt', 'robots.txt should identify the sitemap and a default crawler rule.');
  for (const crawler of config.site.agentSeo.enabled ? config.site.agentSeo.agentCrawlers : []) {
    inspect('agentFriendliness', !robots.includes('User-agent: ' + crawler), 'warning', 'robots.txt', 'robots.txt does not include the configured agent crawler: ' + crawler);
  }
  inspect('agentFriendliness', !sitemap.includes('<urlset') || !sitemap.includes('<url>'), 'warning', 'sitemap.xml', 'The XML sitemap is missing or contains no URLs.');
  if (config.site.agentSeo.enabled && config.site.agentSeo.llmsTxt) {
    try { llms = await readFile(resolve(output, 'llms.txt'), 'utf8'); } catch { /* Checked below. */ }
    inspect('agentFriendliness', !llms.startsWith('# ') || !llms.includes('## Project pages'), 'warning', 'llms.txt', 'The configured llms.txt discovery file is missing or incomplete.');
  }

  if (!config.site.url || new URL(config.site.url).hostname.endsWith('example.com')) {
    addFinding('warning', 'publication-readiness', 'config.yml', 'Replace the example site URL with the published site URL.');
  }
  if (!config.privacy.controller.name.trim() || !config.privacy.controller.contact.trim()) {
    addFinding('warning', 'publication-readiness', 'config.yml', 'Add the real site operator name and privacy contact before publishing the privacy policy.');
  }

  const accessibility = auditSummary(auditChecks.accessibility, auditFindings.accessibility);
  const agentFriendliness = auditSummary(auditChecks.agentFriendliness, auditFindings.agentFriendliness);
  const homepagePaths = new Set(config.i18n.locales.map((locale) => locale === config.i18n.defaultLocale ? 'index.html' : locale + '/index.html'));
  const documents = files.map((file) => {
    const path = relative(output, file).split(sep).join('/');
    const metadata = contentMap.get(file);
    const isHomepage = homepagePaths.has(path);
    const type = metadata?.type || (isHomepage ? 'homepage' : 'system');
    const documentIssues = issues.filter((issue) => issue.page === path);
    return {
      path,
      type,
      title: metadata?.title || sourceByFile.get(file).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || path,
      status: documentIssues.some((issue) => issue.severity === 'error') ? 'fail' :
        documentIssues.length ? 'warning' : 'pass'
    };
  });
  const contentSummary = {
    posts: documents.filter((document) => document.type === 'post').length,
    pages: documents.filter((document) => document.type === 'page' || document.type === 'homepage').length,
    system: documents.filter((document) => document.type === 'system').length
  };
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const report = {
    generatedAt: new Date().toISOString(),
    status: errors ? 'fail' : warnings ? 'warning' : 'pass',
    pages: files.length,
    contentSummary,
    documents,
    markdownRendering,
    consentUi,
    errors,
    warnings,
    accessibility,
    agentFriendliness,
    metrics,
    hashedAssets,
    issues,
    scope: [
      'Accessibility checks inspect generated HTML and CSS. They do not measure color contrast, screen-reader behavior, keyboard interactions in a browser, or dynamic vendor widgets.',
      'Page layout is measured with the consent manager hidden. The consent manager has separate component checks and screenshots, so its size does not change the page-content overflow result.',
      'Agent-friendliness checks inspect metadata, structured data, internal links, robots.txt, sitemap.xml, and llms.txt. They do not guarantee crawler indexing or answer quality.',
      'This automated report is not a legal-compliance assessment or a substitute for manual review.',
      'Screenshots capture generated local pages at desktop and mobile viewports. They do not replace manual keyboard, zoom, contrast, or assistive-technology review.'
    ]
  };
  const requestedDirectory = resolve(config.root, 'tools');
  await mkdir(requestedDirectory, { recursive: true });
  const directoryInfo = await lstat(requestedDirectory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error('Page-check report directory must be a real directory: ' + requestedDirectory);
  }
  const root = await realpath(config.root);
  const directory = await realpath(requestedDirectory);
  if (!isInside(root, directory)) throw new Error('Page-check report directory must stay inside the project root');
  const pdfPath = resolve(directory, 'page-check.pdf');
  try {
    const info = await lstat(pdfPath);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Refusing an unsafe PDF report path: ' + pdfPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    report.visualEvidence = await addVisualEvidence(config, report);
    if (report.visualEvidence.status !== 'complete') {
      issues.push({ severity: 'warning', category: 'visual-evidence', page: 'report', message: report.visualEvidence.reason || 'PDF generation failed.' });
    }
  } catch (error) {
    report.visualEvidence = { status: 'failed', reason: error.message };
    issues.push({ severity: 'warning', category: 'visual-evidence', page: 'report', message: 'Screenshot or PDF generation failed: ' + error.message });
  }
  report.errors = issues.filter((issue) => issue.severity === 'error').length;
  report.warnings = issues.filter((issue) => issue.severity === 'warning').length;
  report.status = report.errors ? 'fail' : report.warnings ? 'warning' : 'pass';
  return report;
}
