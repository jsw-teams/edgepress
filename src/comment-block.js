import {translate} from './i18n.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const commentsEnabled=config=>!!config.browserPlugins?.comments?.enabled && config.browserPlugins.comments.services.some(service=>service.provider==='commentnest');
export const pageCommentThread=page=>'page:'+page.bundlePath;
export function hasCommentBlock(rows) {
  const contains=blocks=>blocks.some(block=>block.type==='comments' || (block.type==='section' && contains(block.blocks || [])));
  return (rows || []).some(row=>(row.cells || []).some(contains));
}
export function renderCommentsBlock(document,locale,config,page=false) {
  if(!commentsEnabled(config))return '';
  if(!document?.bundlePath)throw new Error('A comments block needs a published page or post');
  const label=key=>escape(translate(config,locale,key));
  return '<section id="comments" class="edgepress-discussion" data-edgepress-comments data-comments-label="'+label('commentsTitle')+'" data-comments-thread="'+escape(page?pageCommentThread(document):document.bundlePath)+'" data-comments-title="'+escape(document.title)+'" style="min-width:0;width:100%;box-sizing:border-box"><h2>'+label('commentsTitle')+'</h2><p>'+label('commentsConsentRequired')+'</p><button type="button" data-comments-consent-settings>'+label('privacySettings')+'</button></section>';
}
