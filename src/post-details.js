import { plainText } from './markdown.js';

export function normalizeCategory(value) {
  if (value === undefined || value === null || value === '') return 'uncategorized';
  if (typeof value !== 'string' || value.length > 120 || !value.trim()) throw new Error('category must be a short, non-empty string');
  const category = value.trim().normalize('NFKC').toLowerCase();
  if (['blog', '博客'].includes(category)) return 'blog';
  if (['uncategorized', 'uncategorised', '未分类', '未分類'].includes(category)) return 'uncategorized';
  return category;
}

export function categoryFilter(value) {
  if (value === undefined) return [];
  const values = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(values) || values.length > 20 || values.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error('categories must be a category string or an array of at most 20 non-empty strings');
  }
  return [...new Set(values.map(normalizeCategory))];
}

export function filterPostsByCategory(posts, value) {
  const categories = categoryFilter(value);
  return categories.length ? posts.filter(post => categories.includes(normalizeCategory(post.category))) : posts;
}

export function categorySlug(value) {
  const category = normalizeCategory(value);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) return category;
  return 'category-' + Array.from(category).map(char => char.codePointAt(0).toString(16)).join('-');
}

export function safeAvatar(value, label = 'author avatar') {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\\]/.test(value) || value.startsWith('//')) {
    throw new Error(label + ' must be a safe site path or HTTPS URL');
  }
  const url = new URL(value, 'https://edgepress.invalid');
  if (url.protocol !== 'https:' || url.username || url.password || (!value.startsWith('/') && !value.startsWith('https://'))) {
    throw new Error(label + ' must be a safe site path or HTTPS URL');
  }
  return value;
}

export function authorForPost(post, config) {
  return { name: post.author || config.site.author?.name || config.site.seo?.author || '',
    avatar: post.authorAvatar || config.site.author?.avatar || '' };
}

export function readingMinutes(markdown) {
  const content = plainText(markdown);
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const characters = (content.match(cjk) || []).length;
  const words = (content.replace(cjk, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
  return Math.max(1, Math.ceil(characters / 300 + words / 200));
}

export function sortPinnedPosts(posts) {
  return [...posts].sort((left,right) => Number(right.pinned === true) - Number(left.pinned === true) ||
    right.date - left.date || left.bundlePath.localeCompare(right.bundlePath));
}
