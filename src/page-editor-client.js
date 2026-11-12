import {containers, locate, moveElement, resizeRow, emptyContainers} from './editor-model.js';

const $ = id => document.getElementById(id);
const state = {path:'', page:null, revision:'', selected:null, dirty:false, undo:[], redo:[], cards:new Map(), outline:new Map(), drag:null};
let activeList=null;
const labels = {}, templates = {}, blockCategories = {}, catalogIcons = {};
const defaultCatalogIcons={section:'▦',heading:'T',text:'≡','media-text':'▧','display-text':'T',image:'▧',document:'▤','media-viewer':'▣',code:'</>',notice:'☷',quote:'❝',cta:'↗','feature-grid':'▦','data-table':'▤',list:'☷',steps:'1·2',faq:'?', 'link-list':'↗','link-directory':'☷','post-list':'▤','latest-posts':'◷'};
let editorLanguage=localStorage.getItem('edgepress-editor-language')||'zh-CN';
const suggestions = {
  hero:{eyebrow:'',cta:{label:'了解更多',url:'/'},highlights:['亮点']},
  image:{title:'',caption:'',width:800,height:450},heading:{id:''},text:{paragraphs:['新段落']},
  section:{tone:'soft',id:''},quote:{author:''},'media-text':{title:'',text:'',src:'',alt:'',placement:'left'},
  code:{title:''},document:{caption:''}
};
const editorTranslations={};
function translate(value){const source=String(value);return editorTranslations[editorLanguage]?.[source]||source;}
function el(tag,text,cssClass){const node=document.createElement(tag);if(text!==undefined&&text!==null){const original=String(text);node.dataset.sourceText=original;node.textContent=translate(original);}if(cssClass)node.className=cssClass;return node;}
function setEditorLanguage(language){editorLanguage=language;localStorage.setItem('edgepress-editor-language',language);document.documentElement.lang=language;document.title=translate('写文建站 · 元素块编辑器');for(const node of document.querySelectorAll('[data-source-text]')){const original=node.dataset.sourceText;const text=[...node.childNodes].find(child=>child.nodeType===Node.TEXT_NODE);if(text)text.nodeValue=translate(original);}for(const node of document.querySelectorAll('[data-i18n]')){const key=node.dataset.i18n;node.textContent=translate(key);}for(const node of document.querySelectorAll('[data-i18n-placeholder]'))node.placeholder=translate(node.dataset.i18nPlaceholder);for(const node of document.querySelectorAll('[data-i18n-aria]'))node.setAttribute('aria-label',translate(node.dataset.i18nAria));}
function button(label,onClick,cssClass){const node=el('button',label,cssClass);node.type='button';node.addEventListener('click',onClick);return node;}
function info(message,error=false,saved=false){$('status').textContent=translate(message);$('status').className=error?'error':saved?'saved':'';}
function changed(){state.dirty=true;$('save').textContent=translate('保存更改');info('尚未保存');}
function selectedBlock(){return state.selected&&state.page&&locate(state.page,state.selected)?state.selected:null;}
function revealSelection(){state.cards.get(state.selected)?.scrollIntoView({block:'nearest'});}
function select(block){state.selected=block;repaint();revealSelection();$('fields').scrollTop=0;state.cards.get(block)?.querySelector('.pick').focus({preventScroll:true});}
function checkpoint(){if(!state.page)return;state.undo.push(JSON.stringify(state.page));if(state.undo.length>20)state.undo.shift();state.redo=[];updateHistory();}
function updateHistory(){$('undo').disabled=!state.undo.length;$('redo').disabled=!state.redo.length;}
function edit(action){checkpoint();try{action();changed();repaint();revealSelection();}catch(error){state.page=JSON.parse(state.undo.pop());state.selected=null;repaint();updateHistory();info(error.message,true);}}
function history(direction){const from=state[direction],to=state[direction==='undo'?'redo':'undo'];if(!from.length)return;to.push(JSON.stringify(state.page));state.page=JSON.parse(from.pop());state.selected=null;changed();syncMeta();repaint();updateHistory();}
function guarded(next){if(!state.dirty||window.confirm('有未保存的更改，确定放弃吗？'))next();}
function syncMeta(){$('title').value=state.page.title||'';$('description').value=state.page.description||'';$('page-name').textContent=state.page.title||'未命名页面';}
async function request(path,options){const response=await fetch('.'+path,{cache:'no-store',...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'HTTP '+response.status);return data;}
async function reloadPages(){
  const {pages}=await request('/api/pages'),picker=$('page-picker');picker.replaceChildren();
  for(const path of pages){const option=el('option',path);option.value=path;picker.append(option);}
  if(!pages.length){info('点击“新建页面”，开始设计你的第一个页面。');return;}
  if(pages.includes(state.path))picker.value=state.path;
  await loadPage(picker.value);
}
async function loadPage(path){
  if(!path)return;
  try{
    const data=await request('/api/page?path='+encodeURIComponent(path));
    Object.assign(state,{path,page:data.page,revision:data.revision,selected:null,dirty:false,undo:[],redo:[]});
    $('page-picker').value=path;$('page-path').textContent=path+' · '+(data.page.lang||'');syncMeta();repaint();updateHistory();info('已载入 · '+data.page.title,false,true);
  }catch(error){info('无法载入页面：'+error.message,true);}
}
function snippet(block){return String(block.title||block.text||block.alt||block.code||block.src||block.label||'').replace(/\s+/g,' ').slice(0,44);}
function repaint(){if(!state.page)return;drawOutline();drawCanvas();drawInspector();$('row-count').textContent=state.page.blocks.length+' 行';}

function drawOutline(){
  const nav=$('outline');nav.replaceChildren();state.outline.clear();
  function branch(list,parent){
    for(const block of list){
      const item=button('',()=>select(block),'outline-button');
      item.append(el('span',labels[block.type]||block.type,'outline-type'),el('span',snippet(block)||'未填写内容','outline-snippet'));
      if(state.selected===block)item.setAttribute('aria-current','true');
      parent.append(item);state.outline.set(block,item);
      if(Array.isArray(block.blocks)){const nested=el('div',null,'outline-nested');branch(block.blocks,nested);parent.append(nested);}
    }
  }
  state.page.blocks.forEach((row,r)=>{
    const group=el('div',null,'outline-row');group.append(el('strong','第 '+(r+1)+' 行','outline-row-name'));
    row.cells.forEach((list,c)=>{const cell=el('div',null,'outline-cell');cell.append(el('small','栏 '+(c+1)));branch(list,cell);group.append(cell);});nav.append(group);
  });
}

function moveTo(block,list,index){
  const source=locate(state.page,block),target=containers(state.page).find(item=>item.list===list);
  if(!source||!target)return;
  if(target.ancestors.includes(block))return info('不能把分区移入它自己或自己的子分区。',true);
  checkpoint();
  try{moveElement(state.page,block,list,index);state.selected=block;changed();repaint();revealSelection();info('已移动至 '+locate(state.page,block).label+' · 尚未保存');}
  catch(error){state.undo.pop();updateHistory();info(error.message,true);}
}
function draggable(handle,data){
  handle.draggable=true;handle.classList.add('drag-handle');handle.title='拖动调整位置';
  handle.addEventListener('dragstart',event=>{state.drag=data;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-edgepress','local');});
  handle.addEventListener('dragend',()=>{state.drag=null;document.querySelectorAll('.drop-active').forEach(node=>node.classList.remove('drop-active'));});
}
function dropTarget(node,accept,drop){
  node.addEventListener('dragover',event=>{if(state.drag&&accept(state.drag)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';node.classList.add('drop-active');}});
  node.addEventListener('dragleave',event=>{if(!node.contains(event.relatedTarget))node.classList.remove('drop-active');});
  node.addEventListener('drop',event=>{node.classList.remove('drop-active');if(!state.drag||!accept(state.drag))return;event.preventDefault();event.stopPropagation();const data=state.drag;state.drag=null;drop(data,event);});
}
function addBlock(list,type){
  if(list.length>=100)return info('每个容器最多放置 100 个元素。',true);
  if(type==='image')return imageLibrary(image=>edit(()=>{const block={type:'image',src:image.path,alt:'',...(image.width?{width:image.width,height:image.height}:{})};list.push(block);state.selected=block;}));
  edit(()=>{const block=structuredClone(templates[type]);list.push(block);state.selected=block;});
}
function drawCatalog(){
  const root=$('block-catalog');if(!root)return;root.replaceChildren();
  const filtered=Object.entries(templates).filter(([type])=>{
    const q=$('block-search').value.trim().toLowerCase();return !q||((labels[type]||type).toLowerCase().includes(q)||type.includes(q));
  });
  const categories=[...new Set(filtered.map(([type])=>blockCategories[type]||'text'))];
  for(const category of categories){
    const details=el('details');details.open=Boolean($('block-search').value)||category==='layout'||category==='text';
    const items=filtered.filter(([type])=>(blockCategories[type]||'text')===category);
    const summary=el('summary');summary.append(el('span',translate('category.'+category)),el('small',translate('category.blockCount').replace('{count}',String(items.length))));details.append(summary);
    const grid=el('div',null,'catalog-grid');
    for(const [type] of items){const tile=button('',()=>{const list=activeList&&containers(state.page).some(entry=>entry.list===activeList)?activeList:(selectedBlock()?locate(state.page,state.selected).list:state.page.blocks[0].cells[0]);addBlock(list,type);},'catalog-item');const label=labels[type]||type;tile.append(el('span',catalogIcons[type]||defaultCatalogIcons[type]||'◇','catalog-icon'),el('span',label.replace(/\s+[^ ]+$/,''),'catalog-label'));grid.append(tile);}
    details.append(grid);root.append(details);
  }
}
function addControls(list,nested=false){
  const tools=el('div',null,'cell-actions'),select=el('select');select.setAttribute('aria-label','选择要添加的元素类型');
  for(const [type] of Object.entries(templates)){const option=el('option',labels[type]||type);option.value=type;select.append(option);}
  tools.append(select,button(nested?'＋ 子元素':'＋ 添加',()=>addBlock(list,select.value)),button('图片',()=>addBlock(list,'image'),'image-add'));
  return tools;
}
function drawCanvas(){
  const canvas=$('canvas');canvas.replaceChildren();state.cards.clear();
  state.page.blocks.forEach((row,r)=>{
    const wrap=el('section',null,'canvas-row'),toolbar=el('div',null,'row-actions'),heading=el('div',null,'row-name');
    const grip=button('⠿',()=>{},'row-grip');grip.setAttribute('aria-label','拖动第 '+(r+1)+' 行');draggable(grip,{row});heading.append(grip,el('strong','行 '+(r+1)));
    const actions=el('div',null,'row-actions'),count=el('select');count.setAttribute('aria-label','第 '+(r+1)+' 行的栏数');
    for(let n=1;n<=4;n++){const option=el('option',n+' 栏');option.value=n;count.append(option);}count.value=row.columns;
    count.addEventListener('change',()=>edit(()=>resizeRow(row,Number(count.value))));
    const shift=offset=>{if(r+offset<0||r+offset>=state.page.blocks.length)return;edit(()=>{const rows=state.page.blocks;[rows[r],rows[r+offset]]=[rows[r+offset],rows[r]];});};
    actions.append(count,button('↑',()=>shift(-1)),button('↓',()=>shift(1)),button('删除行',()=>{if(state.page.blocks.length===1)return info('页面至少需要一行。',true);if(window.confirm('删除这一行及其中的元素？'))edit(()=>{state.page.blocks.splice(r,1);state.selected=null;});},'danger'));
    toolbar.append(heading,actions);wrap.append(toolbar);
    dropTarget(toolbar,data=>Boolean(data.row&&data.row!==row),data=>edit(()=>{const rows=state.page.blocks,from=rows.indexOf(data.row);rows.splice(from,1);rows.splice(rows.indexOf(row),0,data.row);}));
    const cells=el('div',null,'cells columns-'+row.columns);
    row.cells.forEach((list,c)=>{
      const cell=el('div',null,'canvas-cell'),label=el('div',null,'cell-label');label.append(el('span','栏 '+(c+1)));
      if(!list.length)label.append(button('移除空栏',()=>{if(row.columns===1)return info('请添加元素，或使用“删除行”移除这一行。',true);edit(()=>{row.cells.splice(c,1);row.columns--;});},'danger'));
      cell.append(label);cell.addEventListener('pointerdown',()=>{activeList=list;});renderElements(list,cell);cell.append(addControls(list));cells.append(cell);
    });
    wrap.append(cells);canvas.append(wrap);
  });
}
function renderElements(list,parent){
  list.forEach((block,index)=>{
    const card=el('article',null,'element'+(state.selected===block?' active':''));card.dataset.type=block.type;state.cards.set(block,card);
    const head=el('div',null,'element-head'),grip=button('⠿',()=>{},'element-grip');grip.setAttribute('aria-label','拖动'+(labels[block.type]||block.type));draggable(grip,{block});
    const pick=button(labels[block.type]||block.type,()=>select(block),'pick');pick.setAttribute('aria-pressed',String(state.selected===block));
    const actions=el('div',null,'element-actions');
    actions.append(button('↑',()=>{if(index>0)moveTo(block,list,index-1);}),button('↓',()=>{if(index<list.length-1)moveTo(block,list,index+2);}),button('×',()=>edit(()=>{list.splice(index,1);if(state.selected===block)state.selected=null;}),'danger'));
    head.append(grip,pick,actions);card.append(head,preview(block));
    card.addEventListener('click',event=>{if(!event.target.closest('button,input,select,textarea')&&event.target.closest('.element')===card)select(block);});
    dropTarget(head,data=>Boolean(data.block&&data.block!==block),data=>moveTo(data.block,list,list.indexOf(block)));
    if(Array.isArray(block.blocks)){
      const children=el('div',null,'nested-elements');children.append(el('span','分区内的元素','container-caption'));renderElements(block.blocks,children);children.append(addControls(block.blocks,true));card.append(children);
    }
    parent.append(card);
  });
  const end=el('div',list.length?'拖放到这里，放在末尾':'空容器 · 拖入或添加元素','drop-zone'+(!list.length?' is-empty':''));
  dropTarget(end,data=>Boolean(data.block),data=>moveTo(data.block,list,list.length));parent.append(end);
}
function imageUrl(path){return './api/image?path='+encodeURIComponent(path);}
function preview(block){
  const box=el('div',null,'element-preview');
  const heading=block.title||(block.type==='heading'||block.type==='display-text'?block.text:'');
  if(block.eyebrow)box.append(el('small',block.eyebrow));if(heading)box.append(el(block.type==='hero'?'h2':'h3',heading));
  if(['image','media-text'].includes(block.type)&&block.src){
    if(block.src.startsWith('/')&&!block.src.startsWith('//')){const image=el('img');image.src=imageUrl(block.src);image.alt=block.alt||'';image.loading='lazy';image.decoding='async';image.addEventListener('error',()=>{image.replaceWith(el('span','图片暂不可用，请从图片库重新选择。','placeholder'));},{once:true});box.append(image);}
    else box.append(el('p','外部图片 · '+block.src,'placeholder'));
    if(block.caption)box.append(el('small',block.caption));
  }else if(block.type==='document'||block.type==='media-viewer')box.append(el('p',block.src||'选择资源','placeholder'));
  if(block.type==='code'){const pre=el('pre');pre.append(el('code',block.code||''));box.append(pre);}
  else if(block.type==='quote')box.append(el('blockquote',block.text||'引用内容'));
  else if(block.text&&!['heading','display-text'].includes(block.type))box.append(el('p',block.text));
  if(Array.isArray(block.paragraphs))box.append(el('p',block.paragraphs.slice(0,3).join('\n\n')));
  if(Array.isArray(block.items))for(const item of block.items.slice(0,4))box.append(el('p',typeof item==='string'?item:item.title||item.question||item.label||item.text||''));
  if(block.type==='cta')box.append(el('span',block.label||'了解更多','preview-cta'));
  if(!box.childNodes.length)box.append(el('p','选择元素，编辑它的内容。','muted'));return box;
}
function relationshipControls(block){
  const source=locate(state.page,block),details=el('details',null,'relationship'),summary=el('summary','移动到其他行、栏或分区');details.append(summary);
  const targets=containers(state.page).filter(item=>!item.ancestors.includes(block));
  const chooser=el('select');chooser.setAttribute('aria-label','目标容器');
  targets.forEach((item,index)=>{const option=el('option',item.label);option.value=index;chooser.append(option);});
  chooser.value=targets.findIndex(item=>item.list===source.list);
  const position=el('select');position.setAttribute('aria-label','插入位置');
  const positions=()=>{position.replaceChildren();const target=targets[Number(chooser.value)];for(let index=0;index<=target.list.length;index++){const option=el('option',index===target.list.length?'末尾':index===0?'首位':'第 '+(index+1)+' 位之前');option.value=index;position.append(option);}position.value=target.list.length;};
  chooser.addEventListener('change',positions);positions();
  details.append(chooser,position,button('移动到这里',()=>moveTo(block,targets[Number(chooser.value)].list,Number(position.value)),'primary'));
  return details;
}
function drawInspector(){
  const fields=$('fields');fields.replaceChildren();const block=selectedBlock();
  const tabs=[...document.querySelectorAll('[data-inspector-tab]')];
  const activateTab=name=>{tabs.forEach(tab=>{const selected=tab.dataset.inspectorTab===name;tab.setAttribute('aria-selected',String(selected));});fields.querySelectorAll('[data-inspector-content]').forEach(pane=>pane.hidden=pane.dataset.inspectorContent!==name);};
  tabs.forEach(tab=>tab.onclick=()=>activateTab(tab.dataset.inspectorTab));
  if(!block){$('selected-label').textContent=translate('选择一个元素');fields.append(el('div','点击画布中的元素，编辑内容或调整它所属的行、栏和分区。','empty'));return;}
  const location=locate(state.page,block);$('selected-label').textContent=location.label;
  const title=el('div',null,'inspector-title');title.append(el('h3',labels[block.type]||block.type),button('复制',()=>{if(location.list.length>=100)return info('每个容器最多放置 100 个元素。',true);edit(()=>{const clone=structuredClone(block);location.list.splice(location.index+1,0,clone);state.selected=clone;});}));
  const content=el('section',null,'inspector-section inspector-content');content.setAttribute('data-inspector-content','content');
  if(['image','media-text'].includes(block.type))content.append(button('选择或上传图片',()=>imageLibrary(image=>edit(()=>{block.src=image.path;if(image.width){block.width=image.width;block.height=image.height;}state.selected=block;})),'choose-image'));
  const form=el('form');form.addEventListener('submit',event=>event.preventDefault());objectFields(form,block,0,true,block);content.append(form);
  const layout=el('section',null,'inspector-section inspector-layout');layout.setAttribute('data-inspector-content','layout');layout.append(relationshipControls(block));
  if(block.type==='media-text'&&block.placement){const position=el('label','图文位置','field'),chooser=el('select');chooser.setAttribute('aria-label','图文位置');for(const [value,label] of [['left','图片在左'],['right','图片在右'],['top','图片在上'],['bottom','图片在下']]){const option=el('option',label);option.value=value;chooser.append(option);}chooser.value=block.placement;chooser.addEventListener('change',()=>edit(()=>{block.placement=chooser.value;}));position.append(chooser);layout.append(position);}
  const style=el('section',null,'inspector-section inspector-style');style.setAttribute('data-inspector-content','style');
  const styleFields=['tone','style','level','ordered','columns'].filter(key=>key in block);
  if(styleFields.length){const styleForm=el('form');styleForm.addEventListener('submit',event=>event.preventDefault());for(const key of styleFields){const value=block[key],field=fieldLabel(key);const control=typeof value==='boolean'?el('input'):typeof value==='number'?el('input'):el('input');control.type=typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text';if(typeof value==='boolean')control.checked=value;else control.value=value;control.setAttribute('aria-label',key);control.addEventListener(typeof value==='boolean'?'change':'input',()=>{checkpoint();replaceValue(block,key,typeof value==='boolean'?control.checked:typeof value==='number'?control.valueAsNumber:control.value,block);});field.append(control);styleForm.append(field);}style.append(styleForm);}
  else style.append(el('p','此元素使用主题默认样式。可通过主题与页面布局统一调整外观。','empty'));
  const panes=[content,layout,style];fields.append(title,...panes);activateTab(document.querySelector('[data-inspector-tab][aria-selected=true]')?.dataset.inspectorTab||'content');
}
let refreshTimer;
function refreshPreview(block){
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{
    const card=state.cards.get(block);if(card)card.querySelector(':scope > .element-preview')?.replaceWith(preview(block));
    const item=state.outline.get(block);if(item)item.querySelector('.outline-snippet').textContent=snippet(block)||'未填写内容';
  },120);
}
function replaceValue(target,key,value,block){target[key]=value;changed();refreshPreview(block);}
function fieldLabel(key,note){const label=el('label',translate(key),'field');if(note)label.append(el('small',note,'type-hint'));return label;}
function track(control,apply){let started=false;control.addEventListener('blur',()=>{started=false;});control.addEventListener('input',()=>{if(!started){checkpoint();started=true;}apply();});}
function objectFields(container,obj,depth,root=false,block=obj){
  for(const [key,value] of Object.entries(obj)){
    if(root&&(key==='type'||key==='blocks'))continue;
    const grouped=Array.isArray(value)||(value&&typeof value==='object');
    const field=grouped?el('div',null,'field'):fieldLabel(key);
    if(grouped)field.append(el('span',translate(key),'field-caption'));
    if(typeof value==='string'){
      const control=el(['text','code','fallback'].includes(key)||value.length>130?'textarea':'input');if(control.tagName==='INPUT')control.type='text';control.value=value;control.setAttribute('aria-label',key);
      track(control,()=>replaceValue(obj,key,control.value,block));field.append(control);
    }else if(typeof value==='number'){
      const control=el('input');control.type='number';control.value=value;control.setAttribute('aria-label',key);control.addEventListener('change',()=>{if(Number.isFinite(control.valueAsNumber)){checkpoint();replaceValue(obj,key,control.valueAsNumber,block);}});field.append(control);
    }else if(typeof value==='boolean'){
      field.classList.add('checkbox');const control=el('input');control.type='checkbox';control.checked=value;control.addEventListener('change',()=>{checkpoint();replaceValue(obj,key,control.checked,block);});field.append(control);
    }else if(Array.isArray(value))field.append(arrayEditor(value,obj,key,depth,block));
    else if(value&&typeof value==='object'&&depth<5){const group=el('div',null,'object-editor');objectFields(group,value,depth+1,false,block);field.append(group);}
    else{
      const control=el('textarea');control.value=JSON.stringify(value,null,2);control.addEventListener('change',()=>{try{const next=JSON.parse(control.value);checkpoint();replaceValue(obj,key,next,block);}catch{info('字段 '+key+' 不是有效 JSON',true);}});field.append(control);
    }
    container.append(field);
  }
  if(root){
    const allowed=suggestions[obj.type]||{},missing=Object.keys(allowed).filter(key=>!(key in obj));
    if(missing.length){const chooser=el('select');chooser.setAttribute('aria-label','添加可选字段');for(const key of missing){const option=el('option',translate(key));option.value=key;chooser.append(option);}const tools=el('div',null,'optional-fields');tools.append(chooser,button('＋ 添加属性',()=>edit(()=>{obj[chooser.value]=structuredClone(allowed[chooser.value]);})));container.append(tools);}
  }
}
function arrayEditor(value,owner,key,depth,block){
  const box=el('div',null,'array-editor');
  const objectItems=key==='items'&&['feature-grid','faq','steps','link-list','link-directory'].includes(block.type);
  if(value.every(item=>typeof item==='string')&&(!objectItems||value.length)){
    const control=el('textarea');control.value=value.join('\n');control.setAttribute('aria-label',key+' 每行一项');track(control,()=>replaceValue(owner,key,control.value?control.value.split('\n'):[],block));box.append(el('small','每行一项','type-hint'),control);
  }else if(depth<4&&value.every(item=>item&&typeof item==='object'&&!Array.isArray(item))){
    value.forEach((item,index)=>{const card=el('div',null,'array-item'),head=el('div',null,'item-head');head.append(el('strong','项目 '+(index+1)),button('移除',()=>edit(()=>value.splice(index,1)),'danger'));card.append(head);objectFields(card,item,depth+1,false,block);box.append(card);});
    box.append(button('＋ 添加项目',()=>edit(()=>{const sample=structuredClone(value[0]||templates[block.type]?.[key]?.[0]||{label:'',url:'/'});for(const [name,item] of Object.entries(sample)){if(name==='type')continue;if(typeof item==='string')sample[name]='';else if(typeof item==='number')sample[name]=1;}value.push(sample);})));
  }else{
    const control=el('textarea');control.value=JSON.stringify(value,null,2);control.setAttribute('aria-label',key+' 高级 JSON');control.addEventListener('change',()=>{try{const next=JSON.parse(control.value);if(!Array.isArray(next))throw Error();checkpoint();replaceValue(owner,key,next,block);}catch{info('字段 '+key+' 必须是 JSON 数组',true);}});box.append(el('small','高级编辑','type-hint'),control);
  }
  return box;
}

async function imageLibrary(choose){
  const dialog=el('dialog',null,'image-dialog'),header=el('div',null,'dialog-header');header.append(el('div','图片库','dialog-title'),button('关闭',()=>dialog.close()));
  const intro=el('p','选择项目已有图片，或上传 JPG、PNG、WebP、GIF。单张不超过 10 MB。','help');
  const tools=el('div',null,'library-tools'),search=el('input');search.type='search';search.placeholder='搜索图片文件名';search.setAttribute('aria-label','搜索图片');
  const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp,image/gif';upload.id='image-upload';const uploadLabel=el('label','上传图片','upload-button');uploadLabel.htmlFor=upload.id;uploadLabel.append(upload);
  tools.append(search,uploadLabel);
  const status=el('p','','library-status');status.setAttribute('role','status');const grid=el('div',null,'image-grid'),pager=el('div',null,'library-pager');
  let offset=0,sequence=0,searchTimer,closed=false;
  const insert=image=>{try{choose(image);dialog.close();}catch(error){status.textContent=error.message;}};
  async function load(){
    const token=++sequence;status.textContent='正在读取图片…';
    try{
      const data=await request('/api/images?q='+encodeURIComponent(search.value)+'&offset='+offset);if(closed||token!==sequence)return;
      grid.replaceChildren();status.textContent=data.total?data.total+' 张图片':'没有找到图片，可以上传一张。';
      for(const image of data.images){const thumb=el('img');const item=button('',async()=>{try{await thumb.decode();if(!closed)insert({...image,width:thumb.naturalWidth,height:thumb.naturalHeight});}catch{status.textContent='图片无法读取，请选择其他图片。';}},'image-choice');thumb.src=imageUrl(image.path);thumb.alt='';thumb.loading='lazy';thumb.decoding='async';item.append(thumb,el('span',image.name));item.title=image.path;grid.append(item);}
      const previous=button('上一页',()=>{offset-=12;void load();}),next=button('下一页',()=>{offset+=12;void load();});previous.disabled=offset===0;next.disabled=offset+12>=data.total;pager.replaceChildren(previous,el('span',data.total?Math.floor(offset/12)+1+' / '+Math.ceil(data.total/12):'0 / 0'),next);
    }catch(error){if(!closed)status.textContent='无法读取图片：'+error.message;}
  }
  search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;void load();},200);});
  upload.addEventListener('change',async()=>{
    const file=upload.files[0];if(!file)return;
    if(file.size>10*1024*1024){status.textContent='图片超过 10 MB，请选择较小的图片。';upload.value='';return;}
    upload.disabled=true;status.textContent='正在保存图片…';
    try{const image=await request('/api/images',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});if(!closed)insert(image);}
    catch(error){status.textContent='上传失败：'+error.message;upload.disabled=false;upload.value='';}
  });
  dialog.append(header,intro,tools,status,grid,pager);document.body.append(dialog);const focus=document.activeElement;
  dialog.addEventListener('close',()=>{closed=true;clearTimeout(searchTimer);dialog.remove();if(focus?.isConnected)focus.focus();else state.cards.get(state.selected)?.querySelector('.pick')?.focus({preventScroll:true});},{once:true});dialog.showModal();search.focus();await load();
}

async function save(){
  if(!state.page||!state.dirty)return info('没有需要保存的更改。');
  const empty=emptyContainers(state.page);if(empty.length)return info(empty[0].label+' 为空。请添加元素，或移除空栏、空行或空分区后保存。',true);
  $('save').disabled=true;
  try{const result=await request('/api/page?path='+encodeURIComponent(state.path),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:state.page,revision:state.revision})});state.revision=result.revision;state.dirty=false;$('save').textContent=translate('已保存');info('已安全保存到 '+state.path+'。返回网站预览查看自动重建结果；edgepress g 生成静态网站。',false,true);}
  catch(error){info('保存失败：'+error.message,true);}finally{$('save').disabled=false;}
}
$('save').addEventListener('click',save);$('undo').addEventListener('click',()=>history('undo'));$('redo').addEventListener('click',()=>history('redo'));
$('reload').addEventListener('click',()=>guarded(()=>loadPage(state.path)));
$('page-picker').addEventListener('change',event=>{const path=event.target.value;guarded(()=>loadPage(path));if(state.dirty)$('page-picker').value=state.path;});
$('add-row').addEventListener('click',()=>{if(!state.page)return;if(state.page.blocks.length>=100)return info('最多允许 100 行',true);edit(()=>{const block=structuredClone(templates.text);state.page.blocks.push({columns:1,cells:[[block]]});state.selected=block;});$('canvas').lastElementChild?.scrollIntoView({block:'nearest'});});
for(const key of ['title','description']){track($(key),()=>{if(!state.page)return;state.page[key]=$(key).value;$('page-name').textContent=state.page.title||'未命名页面';changed();});}
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]'))return;if((event.ctrlKey||event.metaKey)&&!event.target.closest('input,textarea,select')){if(event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}else if(event.key.toLowerCase()==='y'){event.preventDefault();history('redo');}}});
window.addEventListener('beforeunload',event=>{if(state.dirty)event.preventDefault();});
