const copyLabels = document.documentElement.lang.toLowerCase().startsWith('zh')
  ? { copy: '复制', copied: '已复制到剪贴板。', failed: '复制失败，请手动选择并复制代码。', label: '复制代码' }
  : { copy: 'Copy', copied: 'Copied to clipboard.', failed: 'Copy failed. Select and copy the code manually.', label: 'Copy code' };

function fallbackCopy(value) {
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.inset = '0 auto auto -10000px';
  document.body.append(field);
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Clipboard permissions may deny the fallback. */ }
  field.remove();
  return copied;
}

for (const pre of document.querySelectorAll('pre[data-copyable-code]')) {
  if (pre.parentElement?.classList.contains('code-copy-block')) continue;
  const wrapper = document.createElement('div');
  wrapper.className = 'code-copy-block';
  const toolbar = document.createElement('div');
  toolbar.className = 'code-copy-toolbar';
  const button = document.createElement('button');
  button.className = 'code-copy-button';
  button.type = 'button';
  button.textContent = copyLabels.copy;
  button.setAttribute('aria-label', copyLabels.label);
  const status = document.createElement('span');
  status.className = 'code-copy-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  toolbar.append(button);
  pre.before(wrapper);
  wrapper.append(toolbar, pre, status);

  button.addEventListener('click', async () => {
    const code = pre.querySelector('code') || pre;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code.textContent || '');
        copied = true;
      } else {
        copied = fallbackCopy(code.textContent || '');
      }
    } catch {
      copied = fallbackCopy(code.textContent || '');
    }
    status.textContent = copied ? copyLabels.copied : copyLabels.failed;
  });
}
