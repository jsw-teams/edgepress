// The CLI writes the metadata. Authors can start with ordinary Markdown prose.
export function postTemplate(title, date, locale, starter) {
  return '---\ntitle: ' + JSON.stringify(title) + '\ndate: ' + date + '\nlang: ' + locale +
    '\ncategory: uncategorized\ntags: []\n---\n\n' + starter + '\n';
}
