const form = document.querySelector('[data-edgepress-search]');

if (form) {
  const input = form.querySelector('input[type="search"]');
  const status = document.getElementById('edgepress-search-status');
  const results = document.getElementById('edgepress-search-results');
  const language = document.documentElement.lang.toLowerCase();
  const chinese = language.startsWith('zh');
  let indexPromise;
  let timer;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(form.dataset.index, { credentials: 'same-origin' }).then((response) => {
        if (!response.ok) throw new Error('Search index request failed');
        return response.json();
      }).then((items) => items.filter((item) => item.type === 'post'));
    }
    return indexPromise;
  }

  function resultCard(item) {
    const entry = document.createElement('li');
    const article = document.createElement('article');
    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    heading.append(link);
    article.append(heading);
    if (item.date) {
      const time = document.createElement('time');
      time.dateTime = item.date;
      time.textContent = new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(item.date));
      article.append(time);
    }
    const summary = document.createElement('p');
    summary.textContent = item.summary || '';
    article.append(summary);
    entry.append(article);
    return entry;
  }

  async function search(value) {
    const query = value.normalize('NFKC').toLocaleLowerCase(language).trim();
    results.replaceChildren();
    if (!query) {
      status.textContent = chinese ? '输入搜索词以查找文章。' : 'Enter a search term to find articles.';
      return;
    }
    status.textContent = chinese ? '正在搜索文章…' : 'Searching articles…';
    try {
      const terms = query.split(/\s+/u).filter(Boolean);
      const items = await loadIndex();
      const matches = items.filter((item) => {
        const text = (item.title + ' ' + (item.content || '') + ' ' + (item.summary || ''))
          .normalize('NFKC').toLocaleLowerCase(language);
        return terms.every((term) => text.includes(term));
      });
      for (const item of matches) results.append(resultCard(item));
      status.textContent = matches.length
        ? (chinese ? `找到 ${matches.length} 篇文章。` : `${matches.length} matching article${matches.length === 1 ? '' : 's'}.`)
        : (chinese ? '没有找到匹配的文章。' : 'No matching articles.');
    } catch {
      status.textContent = chinese ? '无法载入本地文章索引，请稍后重试。' : 'The local article index could not be loaded. Try again later.';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void search(input.value);
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(input.value), 140);
  });

  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) {
    input.value = initialQuery;
    void search(initialQuery);
  }
}
