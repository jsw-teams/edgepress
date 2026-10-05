import {renderMarkdown} from './markdown.js';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Git is a build-time source of history. Readers see changed passages, not patches.
export function changedPassages(diff){
 const groups=[];let before=[],after=[];
 const finish=()=>{if(before.length||after.length)groups.push({before:before.join('\n'),after:after.join('\n')});before=[];after=[];};
 for(const line of String(diff).split(/\r?\n/)){
  if(/^(?:diff --git|index |--- |\+\+\+ |\\)/.test(line))continue;
  if(line.startsWith('-'))before.push(line.slice(1));
  else if(line.startsWith('+'))after.push(line.slice(1));
  else finish();
 }
 finish();return groups.filter(group=>group.before.trim()||group.after.trim());
}
export async function renderRevisionCards(diff,label){
 const groups=changedPassages(diff);if(!groups.length)return '';
 const cards=[];
 for(const group of groups){
  const sides=[];
  for(const side of ['before','after'])if(group[side].trim()){
   const key=side==='before'?(group.after.trim()?'postChangeBefore':'postChangeRemoved'):(group.before.trim()?'postChangeAfter':'postChangeAdded');
   const content=(await renderMarkdown(group[side],{allowVideo:false})).replace(/<h[1-6]\b[^>]*>/g,'<p class="post-change-heading">').replace(/<\/h[1-6]>/g,'</p>');
   sides.push('<div class="post-change-side post-change-'+side+'"><p class="post-change-label">'+escape(label(key))+'</p><div class="post-change-content">'+content+'</div></div>');
  }
  cards.push('<div class="post-change-passage">'+sides.join('')+'</div>');
 }
 return '<details class="post-changes"><summary>'+escape(label('postChanges'))+'</summary><div class="post-changes-list">'+cards.join('')+'</div></details>';
}
