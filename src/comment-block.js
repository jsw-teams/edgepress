import {translate} from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const commentsEnabled = config => !!config.browserPlugins?.comments?.enabled &&
  config.browserPlugins.comments.services.some(service => service.provider === 'github-comments');
export const pageCommentThread = page => 'page:' + page.bundlePath;
export function hasCommentBlock(rows) {
  const contains = blocks => blocks.some(block => block.type === 'comments' || (block.type === 'section' && contains(block.blocks || [])));
  return (rows || []).some(row => (row.cells || []).some(contains));
}

export function renderCommentsBlock(document, locale, config, page = false) {
  if (!commentsEnabled(config)) return '';
  if (!document?.bundlePath) throw new Error('A comments block needs a published page or post');
  const label = key => escape(translate(config, locale, key));
  const messages = {
    loading:'commentsLoading',empty:'commentsEmpty',error:'commentsError',posted:'commentsPosted',closed:'commentsClosed',count:'commentsCount',
    'login-required':'commentsLoginRequired','service-unavailable':'commentsServiceUnavailable','rate-limited':'commentsRateLimited',
    'thread-reset':'commentsThreadReset','attachment-label':'commentAttachment','attachment-help':'commentAttachmentHelp',
    'attachment-too-large':'commentAttachmentTooLarge','attachment-invalid':'commentAttachmentInvalid',uploading:'commentAttachmentUploading',
    'delete-label':'commentDelete','delete-confirm':'commentDeleteConfirm',cancel:'commentCancel',deleted:'commentDeleted',
    'remove-attachment':'commentRemoveAttachment','stickers-label':'commentStickers','stickers-error':'commentStickersError'
  };
  const attributes = Object.entries(messages).map(([attribute,key]) => ' data-comments-' + attribute + '="' + label(key) + '"').join('');
  return '<section id="comments" class="post-comments" data-edgepress-comments data-comments-thread="' + escape(page ? pageCommentThread(document) : document.bundlePath) +
    '" data-comments-title="' + escape(document.title) + '"' + attributes + '>' +
    '<header class="post-comments-header"><h2>' + label('commentsTitle') + '</h2></header>' +
    '<p class="comments-status" data-comments-status role="status" aria-live="polite">' + label('commentsConsentRequired') + '</p>' +
    '<button type="button" class="comment-secondary" data-comments-consent-settings>' + label('privacySettings') + '</button>' +
    '<ol class="comment-list" data-comments-list></ol>' +
    '<div class="comment-account" data-comments-account hidden><span data-comments-identity></span><button type="button" class="comment-secondary" data-comments-logout>' + label('commentsLogout') + '</button></div>' +
    '<p data-comments-signin hidden><a class="comment-login" data-comments-login>' + label('commentsLogin') + '</a></p>' +
    '<form class="comment-form" data-comments-form hidden><label><span>' + label('commentBody') +
    '</span><textarea name="body" rows="5" maxlength="5000"></textarea></label>' +
    '<div class="comment-toolbar"><button type="button" class="comment-secondary" data-comments-stickers-toggle aria-expanded="false" aria-controls="comment-stickers">' + label('commentStickers') + '</button>' +
    '<label class="comment-attachment-picker"><span>' + label('commentAttachment') + '</span><input name="attachments" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" multiple></label></div>' +
    '<section id="comment-stickers" class="comment-stickers" data-comments-stickers hidden aria-label="' + label('commentStickers') + '">' +
    '<div class="comment-sticker-packs" data-comments-sticker-packs></div><div class="comment-sticker-grid" data-comments-sticker-grid></div></section>' +
    '<small class="comment-note">' + label('commentAttachmentHelp') + '</small><div class="comment-attachment-list" data-comments-attachments></div>' +
    '<div class="comment-honeypot" aria-hidden="true"><label>Company<input name="company" type="text" tabindex="-1" autocomplete="off"></label></div>' +
    '<button type="submit">' + label('commentSubmit') + '</button><p class="comment-note">' + label('commentNotice') + '</p>' +
    '</form><noscript><p class="comment-note">' + label('commentsNeedJavaScript') + '</p></noscript></section>';
}
