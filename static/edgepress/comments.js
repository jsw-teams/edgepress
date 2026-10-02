(() => {
  const root = document.querySelector('[data-edgepress-comments]');
  if (!root) return;
  const consentButton = root.querySelector('[data-comments-consent-settings]');
  if (consentButton) consentButton.hidden = true;

  const thread = root.dataset.commentsThread || '';
  const title = root.dataset.commentsTitle || document.title;
  const list = root.querySelector('[data-comments-list]');
  const form = root.querySelector('[data-comments-form]');
  const status = root.querySelector('[data-comments-status]');
  const submit = form?.querySelector('button[type="submit"]');
  const account = root.querySelector('[data-comments-account]');
  const identity = root.querySelector('[data-comments-identity]');
  const signin = root.querySelector('[data-comments-signin]');
  const login = root.querySelector('[data-comments-login]');
  const logout = root.querySelector('[data-comments-logout]');
  let session = null;
  if (login) login.href = '/api/comments/login?return=' + encodeURIComponent(location.pathname + location.search + '#comments');
  const bodyInput = form?.elements.namedItem('body');
  const companyInput = form?.elements.namedItem('company');
  const attachmentInput = form?.elements.namedItem('attachments');
  const attachmentList = root.querySelector('[data-comments-attachments]');
  let uploadedAttachments = [];
  const draftKey = 'reporelay-draft:' + thread;
  try { if (bodyInput) bodyInput.value = sessionStorage.getItem(draftKey) || ''; } catch {}
  bodyInput?.addEventListener('input', () => {
    try { sessionStorage.setItem(draftKey, bodyInput.value); } catch {}
  });
  const messages = {
    loading: root.dataset.commentsLoading || 'Loading comments…',
    empty: root.dataset.commentsEmpty || 'No comments yet.',
    error: root.dataset.commentsError || 'Comments are unavailable right now.',
    posted: root.dataset.commentsPosted || 'Comment posted.',
    closed: root.dataset.commentsClosed || 'Comments are closed.',
    count: root.dataset.commentsCount || '{count} comments',
    service: root.dataset.commentsServiceUnavailable || 'Comment service is temporarily unavailable. Your draft is kept.',
    limited: root.dataset.commentsRateLimited || 'Comments are busy. Please try again later. Your draft is kept.',
    reset: root.dataset.commentsThreadReset || 'This comment thread was removed. A new thread will start with the next comment.',
    attachment: root.dataset.commentsAttachmentLabel || 'Images / GIFs',
    attachmentHelp: root.dataset.commentsAttachmentHelp || 'Up to 4 PNG, JPEG, GIF, WebP or AVIF files, 5 MB each.',
    attachmentTooLarge: root.dataset.commentsAttachmentTooLarge || 'That file is too large.',
    attachmentInvalid: root.dataset.commentsAttachmentInvalid || 'That file type is not supported.',
    uploading: root.dataset.commentsUploading || 'Uploading attachment…'
  };

  function backendMessage(error) {
    if (error.message === 'comments_rate_limited') return messages.limited;
    if (['comments_credentials_unavailable', 'comments_permission_denied', 'comments_unavailable'].includes(error.message)) return messages.service;
    return messages.error;
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'ready';
  }

  function countLabel(count) {
    return messages.count.replace('{count}', String(count));
  }

  function renderAttachments(urls, container) {
    for (const url of Array.isArray(urls) ? urls : []) {
      let asset;
      try { asset = new URL(url); } catch { continue; }
      if (asset.origin !== location.origin || !/^\/api\/comments\/media\/[a-f0-9]{24}\/[a-f0-9]{24}\/[0-9a-f-]{36}\.(png|jpg|gif|webp|avif)$/.test(asset.pathname)) continue;
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'nofollow noopener';
      const image = document.createElement('img');
      image.src = url;
      image.alt = messages.attachment;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.className = 'comment-attachment-image';
      link.append(image);
      container.append(link);
    }
  }

  function renderPendingAttachments() {
    if (!attachmentList) return;
    attachmentList.replaceChildren();
    for (const attachment of uploadedAttachments) {
      const item = document.createElement('div');
      item.className = 'comment-attachment-preview';
      const image = document.createElement('img');
      image.src = attachment.url;
      image.alt = messages.attachment;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove attachment');
      remove.addEventListener('click', () => {
        uploadedAttachments = uploadedAttachments.filter(entry => entry.url !== attachment.url);
        renderPendingAttachments();
      });
      item.append(image, remove);
      attachmentList.append(item);
    }
  }

  async function uploadAttachment(file) {
    if (!file || !['image/png','image/jpeg','image/gif','image/webp','image/avif'].includes(file.type)) {
      throw new Error('attachment_invalid');
    }
    if (file.size > 5_000_000) throw new Error('attachment_too_large');
    const response = await fetch('/api/comments/media/', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': file.type,
        'X-Comments-CSRF': session?.csrf || '',
        'X-Comments-Thread': thread
      },
      body: file
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || !data?.url) {
      const error = new Error(data?.error || 'comments_request_failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function renderComment(comment) {
    const item = document.createElement('li');
    item.className = 'comment-item';

    const article = document.createElement('article');
    const header = document.createElement('header');
    header.className = 'comment-meta';
    const author = document.createElement('a');
    author.textContent = '@' + (comment.author || 'GitHub');
    if (/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(comment.author)) author.href = 'https://github.com/' + comment.author;
    author.rel = 'nofollow';
    const time = document.createElement('time');
    if (comment.createdAt) {
      time.dateTime = comment.createdAt;
      const date = new Date(comment.createdAt);
      time.textContent = Number.isNaN(date.valueOf()) ? comment.createdAt : new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
    }
    header.append(author, time);

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = comment.body || '';
    article.append(header, body);
    if (Array.isArray(comment.attachments) && comment.attachments.length) {
      const media = document.createElement('div');
      media.className = 'comment-attachments';
      renderAttachments(comment.attachments, media);
      article.append(media);
    }
    item.append(article);
    return item;
  }

  function renderComments(comments) {
    if (!list) return;
    list.replaceChildren(...comments.map(renderComment));
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options?.headers || {}) },
      ...options
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data?.error || 'comments_request_failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadComments() {
    setStatus(messages.loading);
    try {
      const data = await requestJson('/api/comments?thread=' + encodeURIComponent(thread));
      const comments = Array.isArray(data?.comments) ? data.comments : [];
      renderComments(comments);
      if (data?.closed) {
        if (form) form.hidden = true;
        if (account) account.hidden = true;
        if (signin) signin.hidden = true;
        setStatus(messages.closed);
        return;
      }
      try { session = await requestJson('/api/comments/session'); } catch { session = null; }
      if (form) form.hidden = !session?.user;
      if (account) account.hidden = !session?.user;
      if (signin) signin.hidden = !session || !!session.user;
      if (identity) identity.textContent = session?.user ? '@' + session.user.login : '';
      setStatus(!session ? messages.error : data.threadReset ? messages.reset : comments.length ? countLabel(comments.length) : messages.empty, !session);
    } catch (error) {
      if (form) form.hidden = true;
      if (account) account.hidden = true;
      if (signin) signin.hidden = true;
      setStatus(backendMessage(error), true);
    }
  }

  attachmentInput?.addEventListener('change', async () => {
    if (attachmentInput.disabled) return;
    attachmentInput.disabled = true;
    if (submit) submit.disabled = true;
    const files = [...(attachmentInput.files || [])];
    attachmentInput.value = '';
    if (!files.length) { attachmentInput.disabled = false; if (submit) submit.disabled = false; return; }
    for (const file of files) {
      if (uploadedAttachments.length >= 4) break;
      try {
        setStatus(messages.uploading);
        const uploaded = await uploadAttachment(file);
        uploadedAttachments.push(uploaded);
        renderPendingAttachments();
        setStatus(uploadedAttachments.length ? messages.attachmentHelp : messages.empty);
      } catch (error) {
        if (error.message === 'attachment_too_large' || error.message === 'payload_too_large') setStatus(messages.attachmentTooLarge, true);
        else if (['attachment_invalid','unsupported_media_type','invalid_media'].includes(error.message)) setStatus(messages.attachmentInvalid, true);
        else setStatus(backendMessage(error), true);
      }
    }
    attachmentInput.disabled = false;
    if (submit) submit.disabled = false;
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (attachmentInput?.disabled) return;
    if (!form.reportValidity() || (!String(bodyInput?.value || '').trim() && uploadedAttachments.length === 0)) return;
    if (submit) submit.disabled = true;
    setStatus(messages.loading);
    try {
      const data = await requestJson('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Comments-CSRF': session?.csrf || '' },
        body: JSON.stringify({
          thread,
          title,
          body: String(bodyInput?.value || ''),
          attachments: uploadedAttachments.map(({url, receipt}) => ({url, receipt})),
          company: String(companyInput?.value || '')
        })
      });
      if (data?.comment && list) list.append(renderComment(data.comment));
      if (bodyInput) bodyInput.value = '';
      uploadedAttachments = [];
      renderPendingAttachments();
      try { sessionStorage.removeItem(draftKey); } catch {}
      const count = list?.children.length || 0;
      setStatus(messages.posted + (count ? ' ' + countLabel(count) : ''));
    } catch (error) {
      if (['login_required', 'invalid_csrf'].includes(error.message)) {
        if (form) form.hidden = true;
        if (account) account.hidden = true;
        if (signin) signin.hidden = false;
        setStatus(root.dataset.commentsLoginRequired || 'Sign in with GitHub to comment.', true);
      } else if (error?.status === 409) {
        if (form) form.hidden = true;
        setStatus(messages.closed, true);
      } else {
        if (error.status === 503 && form) form.hidden = true;
        setStatus(backendMessage(error), true);
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  logout?.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await requestJson('/api/comments/logout', { method: 'POST', headers: { 'X-Comments-CSRF': session?.csrf || '' } });
      await loadComments();
    } catch { setStatus(messages.error, true); }
    finally { logout.disabled = false; }
  });

  void loadComments();
})();
