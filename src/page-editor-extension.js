// Shares the module scope of page-editor-client.js. No third-party script or eval.
async function initializeBlockCatalog() {
  const definition = await request('/api/block-catalog');
  for (const [type, entry] of Object.entries(definition.blocks)) {
    labels[type] = entry.label + (entry.requiresSetup ? ' · 需配置' : '');
    templates[type] = structuredClone(entry.template);
  }
  repaint();
}

async function showNewPageDialog() {
  const { locales, defaultLocale } = await request('/api/locales');
  const dialog = el('dialog');
  dialog.className = 'new-page-dialog';
  const form = el('form');
  form.setAttribute('aria-label', '新建页面');
  const heading = el('h2', '新建 Pages 页面');
  const hint = el('p', '填写页面标题和语言，选择是否手动指定 URL 路径。创建后可继续可视化编辑。', 'help');
  const labelled = (caption, control) => {
    const label = el('label', caption, 'field');
    label.append(control);
    return label;
  };
  const title = el('input');
  title.type = 'text';
  title.required = true;
  title.maxLength = 160;
  title.placeholder = '例如：关于我们';
  title.id = 'create-title';
  const slug = el('input');
  slug.type = 'text';
  slug.maxLength = 100;
  slug.placeholder = '留空时根据标题生成';
  slug.id = 'create-slug';
  const locale = el('select');
  locale.id = 'create-lang';
  for (const value of locales) {
    const option = el('option', value);
    option.value = value;
    locale.append(option);
  }
  locale.value = defaultLocale;
  const message = el('p', '', 'new-page-error');
  message.setAttribute('role', 'alert');
  const actions = el('div', null, 'actions');
  const cancel = button('取消', () => dialog.close());
  const submit = el('button', '创建并编辑', 'primary');
  submit.type = 'submit';
  actions.append(cancel, submit);
  form.append(heading, hint, labelled('页面标题', title), labelled('URL 路径名称（可选）', slug), labelled('页面语言', locale), actions, message);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = '';
    try {
      const created = await request('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.value.trim(), slug: slug.value.trim() || undefined,
          lang: locale.value
        })
      });
      dialog.close();
      state.dirty = false;
      state.path = created.path;
      await reloadPages();
      info('新页面已创建：' + created.path + '。请继续选择和编辑元素。', false, true);
    } catch (error) {
      message.textContent = error.message;
      info('创建页面失败：' + error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
  dialog.showModal();
  title.focus();
}

$('new-page').addEventListener('click', () => guarded(() => {
  showNewPageDialog().catch(error => info('无法打开新建页面：' + error.message, true));
}));
initializeBlockCatalog().catch(error => info('无法载入全部元素模板：' + error.message, true));
