(()=>{'use strict';
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n}
function enhance(card){
 if(card.dataset.enhancedClient)return;card.dataset.enhancedClient='1';
 const id=card.dataset.neClientId;
 const info=make('div','ne-client-expanded');info.hidden=true;info.id='ne-client-'+id;
 info.append(make('strong','','Detalhes da cliente'));
 const meta=card.querySelector('.clientMeta');if(meta)meta.querySelectorAll('small').forEach(n=>info.append(make('p','',n.textContent)));
 const note=card.querySelector(':scope > p');if(note)info.append(make('p','','Observações: '+note.textContent));
 if(info.childElementCount===1)info.append(make('p','','Sem observações adicionais.'));
 const actions=make('div','ne-client-commands');
 const agendar=make('button','ne-client-primary','＋ Agendar');agendar.type='button';
 agendar.addEventListener('click',()=>{
  const select=document.querySelector('#apClient'),modal=document.querySelector('#appointmentModal');
  if(select&&Array.from(select.options).some(o=>o.value===id))select.value=id;
  if(modal&&!modal.open)modal.showModal();
 });
 const btn=make('button','','Ver detalhes');btn.type='button';btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls',info.id);
 btn.addEventListener('click',()=>{info.hidden=!info.hidden;btn.setAttribute('aria-expanded',String(!info.hidden));btn.textContent=info.hidden?'Ver detalhes':'Ocultar detalhes'});
 actions.append(agendar,btn);card.append(actions,info);
}
function init(){const list=document.getElementById('clientList');if(!list)return;const scan=()=>list.querySelectorAll('article[data-ne-client-id]').forEach(enhance);new MutationObserver(scan).observe(list,{childList:true});scan()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();