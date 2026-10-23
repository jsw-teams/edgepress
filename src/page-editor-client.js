const $ = id => document.getElementById(id);
const state = { path: '', page: null, revision: '', selected: null, dirty: false };
const labels = {
  hero: '横幅 / Hero', section: '分区', heading: '标题', text: '文字', image: '图片',
  quote: '引用', cta: '操作按钮', 'link-list': '链接列表', 'feature-grid': '功能卡片',
  faq: '问答', code: '代码', notice: '提示', 'data-table': '数据表',
  'post-list': '文章列表', 'latest-posts': '最新文章', document: '文档',
  'media-text': '图文', 'media-viewer': '媒体浏览器', 'display-text': '展示文字',
  list: '列表', steps: '步骤', 'link-directory': '链接目录', oembed: '外部嵌入',
  service: '第三方服务', 'local-tool': '本地工具', 'privacy-services': '服务隐私',
  'privacy-consent': '隐私同意', 'privacy-controller': '隐私设置',
  captcha: '验证码', 'ad-slot': '广告位'
};
const templates = {
  heading: { type: 'heading', level: 2, text: '新标题' },
  text: { type: 'text', text: '在这里输入文字' },
  hero: { type: 'hero', title: '页面标题', text: '介绍一下这个页面' },
  section: { type: 'section', title: '新分区', blocks: [{ type: 'text', text: '分区内容' }] },
  image: { type: 'image', src: '/images/example.png', alt: '图片描述' },
  quote: { type: 'quote', text: '引用内容' },
  cta: { type: 'cta', label: '了解更多', url: '/quick-start/' },
  'link-list': { type: 'link-list', title: '相关链接', items: [{ label: '查看内容', url: '/quick-start/' }] },
  code: { type: 'code', language: 'text', code: '示例代码' },
  notice: { type: 'notice', title: '提示', text: '提示内容' },
  'post-list': { type: 'post-list', title: '文章列表', count: 3 },
  'latest-posts': { type: 'latest-posts', title: '最新文章', count: 3 },
  document: { type: 'document', title: '文档预览', src: '/documents/sample.pdf' },
  'feature-grid': { type: 'feature-grid', title: '功能列表', items: [{ title: '功能', text: '功能介绍', icon: 'check' }] },
  faq: { type: 'faq', title: '常见问题', items: [{ question: '问题', answer: '答案' }] }
};
const suggestions = {
  hero: { eyebrow: '', cta: { label: '了解更多', url: '/' }, highlights: ['亮点'] },
  image: { title: '', caption: '', width: 800, height: 450 },
  heading: { id: '' }, text: { paragraphs: ['新段落'] },
  section: { tone: 'soft', id: '' }, quote: { author: '' },
  'media-text': { title: '', text: '', src: '', alt: '', placement: 'left' },
  code: { title: '' }, document: { caption: '' }
};

function el(tag, text, cssClass) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (cssClass) node.className = cssClass;
  return node;
}
function button(label, onClick, cssClass) {
  const node = el('button', label, cssClass);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
function info(message, error = false, saved = false) {
  $('status').textContent = message;
  $('status').className = error ? 'error' : saved ? 'saved' : '';
}
function changed() {
  state.dirty = true;
  info('有尚未保存的更改');
}
function guarded(next) {
  if (!state.dirty || window.confirm('有未保存的更改，确定放弃吗？')) next();
}
function selectedBlock() {
  const s = state.selected;
  return s && state.page?.blocks[s.row]?.cells[s.cell]?.[s.block];
}
function selection(row, cell, block) {
  state.selected = { row, cell, block };
  repaint();
}
function move(list, index, difference) {
  const next = index + difference;
  if (next < 0 || next >= list.length) return;
  [list[index], list[next]] = [list[next], list[index]];
  changed();
}
async function request(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}
async function reloadPages() {
  const data = await request('/api/pages');
  const picker = $('page-picker');
  picker.replaceChildren();
  data.pages.forEach(path => {
    const option = el('option', path); option.value = path; picker.append(option);
  });
  if (!data.pages.length) {
    info('没有找到 JSON 页面。请先在 content/pages/ 下创建页面。', true);
    return;
  }
  if (state.path && data.pages.includes(state.path)) picker.value = state.path;
  await loadPage(picker.value);
}
async function loadPage(path) {
  if (!path) return;
  try {
    const data = await request('/api/page?path=' + encodeURIComponent(path));
    state.path = path;
    state.page = data.page;
    state.revision = data.revision;
    state.selected = null;
    state.dirty = false;
    $('page-picker').value = path;
    $('title').value = data.page.title || '';
    $('description').value = data.page.description || '';
    $('page-name').textContent = data.page.title || path;
    $('page-path').textContent = path + ' · ' + (data.page.lang || '');
    repaint();
    info('已载入 ' + path, false, true);
  } catch (error) { info('无法载入页面：' + error.message, true); }
}
function snippet(block) {
  const value = block.title || block.text || block.code || block.src || block.label || block.type;
  return String(value).replace(/\s+/g, ' ').slice(0, 44);
}
function repaint() {
  if (!state.page) return;
  drawOutline();
  drawCanvas();
  drawInspector();
}
function drawOutline() {
  const nav = $('outline'); nav.replaceChildren();
  state.page.blocks.forEach((row, rowIndex) => {
    const group = el('div', null, 'outline-row');
    group.append(el('strong', '第 ' + (rowIndex + 1) + ' 行 · ' + row.columns + ' 栏'));
    row.cells.forEach((cell, cellIndex) => {
      const section = el('div', null, 'outline-cell');
      section.append(el('small', '栏 ' + (cellIndex + 1)));
      cell.forEach((block, blockIndex) => {
        const item = button((labels[block.type] || block.type) + ' · ' + snippet(block), () => selection(rowIndex, cellIndex, blockIndex), 'outline-button');
        if (state.selected?.row === rowIndex && state.selected?.cell === cellIndex && state.selected?.block === blockIndex) item.setAttribute('aria-current', 'true');
        section.append(item);
      });
      group.append(section);
    });
    nav.append(group);
  });
}
function addBlock(rowIndex, cellIndex, type) {
  const cell = state.page.blocks[rowIndex].cells[cellIndex];
  cell.push(structuredClone(templates[type]));
  changed();
  selection(rowIndex, cellIndex, cell.length - 1);
}
function drawCanvas() {
  const canvas = $('canvas'); canvas.replaceChildren();
  state.page.blocks.forEach((row, rowIndex) => {
    const wrap = el('section', null, 'canvas-row');
    const toolbar = el('div', null, 'row-actions');
    const title = el('strong', '行 ' + (rowIndex + 1));
    const operations = el('div', null, 'row-actions');
    const count = el('select'); count.setAttribute('aria-label', '第 ' + (rowIndex + 1) + ' 行的栏数');
    for (let n = 1; n <= 4; n++) {
      const opt = el('option', n + ' 栏'); opt.value = String(n);
      count.append(opt);
    }
    count.value = String(row.columns);
    count.addEventListener('change', () => {
      const next = Number(count.value);
      // Reducing columns reflows all existing elements into the last kept cell.
      // Never discard content merely because the editor layout changes.
      if (next < row.columns) {
        for (const extra of row.cells.slice(next)) row.cells[next - 1].push(...extra);
      }
      while (row.cells.length < next) row.cells.push([{ type: 'text', text: '新栏内容' }]);
      row.cells.length = next;
      row.columns = next;
      state.selected = null;
      changed(); repaint();
    });
    operations.append(count,
      button('↑', () => { move(state.page.blocks, rowIndex, -1); state.selected = null; repaint(); }),
      button('↓', () => { move(state.page.blocks, rowIndex, 1); state.selected = null; repaint(); }),
      button('删除行', () => {
        if (state.page.blocks.length === 1) return info('页面至少需要一行。', true);
        if (!window.confirm('确定删除整行及其所有元素？')) return;
        state.page.blocks.splice(rowIndex, 1); state.selected = null; changed(); repaint();
      }, 'danger')
    );
    toolbar.append(title, operations); wrap.append(toolbar);
    const cells = el('div', null, 'cells columns-' + row.columns);
    row.cells.forEach((blocks, cellIndex) => {
      const cell = el('div', null, 'canvas-cell');
      const tools = el('div', null, 'cell-actions');
      tools.append(el('strong', '栏 ' + (cellIndex + 1)));
      const select = el('select'); select.setAttribute('aria-label', '选择要添加的元素类型');
      for (const [key, value] of Object.entries(templates)) {
        const option = el('option', labels[key] || key); option.value = key; select.append(option);
      }
      tools.append(select, button('＋ 添加', () => addBlock(rowIndex, cellIndex, select.value)));
      cell.append(tools);
      blocks.forEach((block, blockIndex) => {
        const selected = state.selected?.row === rowIndex && state.selected?.cell === cellIndex && state.selected?.block === blockIndex;
        const card = el('article', null, 'element' + (selected ? ' active' : ''));
        const head = el('div', null, 'element-head');
        const choose = button(labels[block.type] || block.type, () => selection(rowIndex, cellIndex, blockIndex), 'pick');
        choose.setAttribute('aria-pressed', String(Boolean(selected)));
        const operations = el('div', null, 'element-actions');
        operations.append(
          button('↑', () => { move(blocks, blockIndex, -1); selection(rowIndex, cellIndex, Math.max(0, blockIndex - 1)); }),
          button('↓', () => { move(blocks, blockIndex, 1); selection(rowIndex, cellIndex, Math.min(blocks.length - 1, blockIndex + 1)); }),
          button('×', () => {
            if (blocks.length === 1) return info('每栏至少保留一个元素。可直接修改这个元素。', true);
            blocks.splice(blockIndex, 1); state.selected = null; changed(); repaint();
          }, 'danger')
        );
        head.append(choose, operations); card.append(head, preview(block));
        card.addEventListener('click', event => { if (!event.target.closest('button')) selection(rowIndex, cellIndex, blockIndex); });
        cell.append(card);
      });
      cells.append(cell);
    });
    wrap.append(cells); canvas.append(wrap);
  });
}
function preview(block) {
  const box = el('div', null, 'element-preview');
  const heading = block.title || (block.type === 'heading' ? block.text : '');
  if (heading) box.append(el(block.type === 'hero' ? 'h2' : 'h3', heading));
  if (block.eyebrow) box.prepend(el('small', block.eyebrow));
  if (block.type === 'image' || block.type === 'document' || block.type === 'media-viewer') {
    box.append(el('div', (block.type === 'image' ? '▧ 图片 · ' : '▤ 资源 · ') + (block.src || block.alt || '选择资源'), 'placeholder'));
  } else if (block.type === 'quote') {
    box.append(el('blockquote', block.text || '引用'));
  } else if (block.type === 'code') {
    const code = el('code', block.code || '代码');
    const pre = el('pre'); pre.append(code); box.append(pre);
  } else if (block.type === 'link-list' && Array.isArray(block.items)) {
    for (const item of block.items.slice(0, 6)) box.append(el('p', '↗ ' + (item.label || item.title || '链接')));
  } else if (block.type === 'section' && Array.isArray(block.blocks)) {
    for (const nested of block.blocks.slice(0, 4)) box.append(el('p', '└ ' + (nested.title || nested.text || nested.type)));
  } else if (block.type === 'feature-grid' && Array.isArray(block.items)) {
    for (const item of block.items.slice(0, 4)) box.append(el('p', '▪ ' + (item.title || item.text || '功能')));
  } else if (block.type === 'faq' && Array.isArray(block.items)) {
    for (const item of block.items.slice(0, 4)) box.append(el('p', '❔ ' + (item.question || item.title || '问题')));
  } else if (block.type !== 'heading' && block.type !== 'cta' && block.text) {
    box.append(el('p', block.text));
  }
  if (Array.isArray(block.paragraphs)) box.append(el('p', block.paragraphs.slice(0, 3).join('\n')));
  if (block.type === 'cta') box.append(el('p', '↗ ' + (block.label || block.cta?.label || block.url || '操作按钮')));
  if (!box.childNodes.length) box.append(el('p', '点击上方元素名称，编辑 ' + (labels[block.type] || block.type), 'muted'));
  return box;
}
function drawInspector() {
  const fields = $('fields'); fields.replaceChildren();
  const block = selectedBlock();
  if (!block) {
    $('selected-label').textContent = '尚未选择';
    fields.append(el('p', '请在画布或页面结构中选择元素。', 'empty'));
    return;
  }
  $('selected-label').textContent = (state.selected.row + 1) + ' 行 · ' + (state.selected.cell + 1) + ' 栏';
  fields.append(el('h3', labels[block.type] || block.type));
  const form = el('form'); form.addEventListener('submit', event => event.preventDefault());
  objectFields(form, block, 0, true);
  fields.append(form);
}
function fieldLabel(key, note) {
  const label = el('label', key, 'field');
  if (note) label.append(el('small', note, 'type-hint'));
  return label;
}
function replaceValue(target, key, value) {
  target[key] = value; changed(); drawOutline(); drawCanvas();
}
function objectFields(container, obj, depth, root = false) {
  for (const [key, value] of Object.entries(obj)) {
    if (root && key === 'type') continue;
    const field = fieldLabel(key);
    if (typeof value === 'string') {
      const control = key === 'text' || key === 'code' || key === 'fallback' || value.length > 130 ? el('textarea') : el('input');
      if (control.tagName === 'INPUT') control.type = 'text';
      control.value = value;
      control.setAttribute('aria-label', key);
      control.addEventListener('input', () => replaceValue(obj, key, control.value));
      field.append(control);
    } else if (typeof value === 'number') {
      const control = el('input'); control.type = 'number'; control.value = value;
      control.addEventListener('change', () => { if (Number.isFinite(control.valueAsNumber)) replaceValue(obj, key, control.valueAsNumber); });
      field.append(control);
    } else if (typeof value === 'boolean') {
      field.classList.add('checkbox');
      const control = el('input'); control.type = 'checkbox'; control.checked = value;
      control.addEventListener('change', () => replaceValue(obj, key, control.checked));
      field.append(control);
    } else if (Array.isArray(value)) {
      field.append(arrayEditor(value, obj, key, depth));
    } else if (value && typeof value === 'object' && depth < 5) {
      const group = el('div', null, 'object-editor');
      objectFields(group, value, depth + 1);
      field.append(group);
    } else {
      const control = el('textarea'); control.value = JSON.stringify(value, null, 2);
      control.addEventListener('change', () => {
        try { replaceValue(obj, key, JSON.parse(control.value)); }
        catch { info('字段 ' + key + ' 不是有效 JSON', true); }
      });
      field.append(control);
    }
    container.append(field);
  }
  if (root) {
    const allowed = suggestions[obj.type] || {};
    const missing = Object.keys(allowed).filter(key => !(key in obj));
    if (missing.length) {
      const chooser = el('select'); chooser.setAttribute('aria-label', '添加可选字段');
      missing.forEach(key => { const option = el('option', key); option.value = key; chooser.append(option); });
      container.append(chooser, button('＋ 添加属性', () => {
        const key = chooser.value;
        obj[key] = structuredClone(allowed[key]);
        changed(); repaint();
      }));
    }
  }
}
function arrayEditor(value, owner, key, depth) {
  const box = el('div', null, 'array-editor');
  if (value.every(v => typeof v === 'string')) {
    const control = el('textarea');
    control.value = value.join('\n');
    control.setAttribute('aria-label', key + ' 每行一项');
    control.addEventListener('input', () => replaceValue(owner, key, control.value ? control.value.split('\n') : []));
    box.append(el('small', '每行一项', 'type-hint'), control);
  } else if (depth < 4 && value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    for (const [index, item] of value.entries()) {
      const card = el('div', null, 'array-item');
      const head = el('div', null, 'item-head');
      head.append(el('strong', '项目 ' + (index + 1)), button('移除', () => {
        if (value.length <= 1 && key === 'blocks') return info('分区至少保留一个子元素', true);
        value.splice(index, 1); changed(); repaint();
      }, 'danger'));
      card.append(head);
      objectFields(card, item, depth + 1, false);
      box.append(card);
    }
    box.append(button('＋ 添加项目', () => {
      const sample = value.length ? structuredClone(value[0]) : key === 'blocks' ? structuredClone(templates.text) : { label: '', url: '/' };
      for (const [name, v] of Object.entries(sample)) {
        if (name === 'type') continue;
        if (typeof v === 'string') sample[name] = '';
        else if (typeof v === 'number') sample[name] = 1;
      }
      value.push(sample); changed(); repaint();
    }));
  } else {
    const control = el('textarea'); control.value = JSON.stringify(value, null, 2);
    control.setAttribute('aria-label', key + ' 高级 JSON');
    control.addEventListener('change', () => {
      try { const next = JSON.parse(control.value); if (!Array.isArray(next)) throw Error(); replaceValue(owner, key, next); }
      catch { info('字段 ' + key + ' 必须是 JSON 数组', true); }
    });
    box.append(el('small', '复杂嵌套数组 · 高级编辑', 'type-hint'), control);
  }
  return box;
}
async function save() {
  if (!state.page || !state.dirty) return info('没有需要保存的更改。');
  $('save').disabled = true;
  try {
    const result = await request('/api/page?path=' + encodeURIComponent(state.path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: state.page, revision: state.revision })
    });
    state.revision = result.revision; state.dirty = false;
    info('已安全保存到 ' + state.path + '。运行 npm run build 检查最终网页。', false, true);
  } catch (error) { info('保存失败：' + error.message, true); }
  finally { $('save').disabled = false; }
}

$('save').addEventListener('click', save);
$('reload').addEventListener('click', () => guarded(() => loadPage(state.path)));
$('page-picker').addEventListener('change', event => {
  const path = event.target.value;
  guarded(() => loadPage(path));
  if (state.dirty) $('page-picker').value = state.path;
});
$('add-row').addEventListener('click', () => {
  if (!state.page) return;
  if (state.page.blocks.length >= 100) return info('最多允许 100 行', true);
  state.page.blocks.push({ columns: 1, cells: [[structuredClone(templates.text)]] });
  changed(); selection(state.page.blocks.length - 1, 0, 0);
});
for (const key of ['title', 'description']) {
  $(key).addEventListener('input', () => {
    if (!state.page) return;
    state.page[key] = $(key).value;
    $('page-name').textContent = state.page.title || '未命名页面';
    changed();
  });
}
window.addEventListener('beforeunload', event => { if (state.dirty) event.preventDefault(); });
reloadPages().catch(error => info('无法启动编辑器：' + error.message, true));
