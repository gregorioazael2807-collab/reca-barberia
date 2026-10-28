import {state,request,refresh,escapeHTML as E} from '../server-ui.js';
import {mediaCreditsHTML} from '../media-credits.js';
let items=null,ownerId=null,loading=false,feedback='',loadError='',busy=false,render=()=>{};
function sync(){if(ownerId!==state.user?.id){ownerId=state.user?.id;items=null;loading=false;feedback='';loadError='';busy=false;}}
export function invalidateLibrary(){items=null;loadError='';}
async function load(){const user=ownerId;loading=true;try{const result=await request('/api/admin/library');if(user===state.user?.id)items=result.items;}catch(err){if(user===state.user?.id){loadError=err.message;items=[];}}finally{if(user===state.user?.id){loading=false;render();}}}
export function libraryContent(kind){
 sync();if(items===null){if(!loading)void load();return null;}
 if(loadError)return `<section><h2>Biblioteca no disponible</h2><p class="warning" role="alert">${E(loadError)}</p><button class="button secondary" type="button" data-library-retry>Reintentar</button></section>`;
 const list=items.filter(item=>item.kind===kind),settings=state.public.settings;
 return `<section class="media-library"><h2>${kind==='music'?'Biblioteca de música':'Galería de videos'} · ${list.length}</h2><button class="button secondary" type="button" data-library-upload>Subir ${kind==='music'?'música':'video'}</button>${kind==='music'&&settings.backgroundMusic?'<button class="button secondary" type="button" data-music-remove>Quitar música de toda la app</button>':''}<p>Archivos guardados. Escucha o revisa antes de elegir qué usar en la app. El material externo es referencia, no trabajos de RECA.</p>${feedback?`<p class="warning" role="status">${E(feedback)}</p>`:''}<label class="field-label">Buscar en la biblioteca<input type="search" data-library-search placeholder="Nombre o autor"></label><div class="media-library-grid">${list.map(item=>{
 const used=settings.backgroundMusic?.url===item.url||Object.values(settings.welcomeVideos||{}).includes(item.url);
 return `<article class="card media-library-item" data-library-item="${E(item.id)}"><h3>${E(item.title)}</h3><p>${Math.round(item.durationSeconds)} s ${used?'· En la aplicación':''}</p><${kind==='music'?'audio':'video'} controls playsinline ${kind==='video'?'controlslist="nodownload"':''} preload="none" ${item.poster?`poster="${E(item.poster)}"`:''} src="${E(item.url)}" aria-label="${E(item.title)}"></${kind==='music'?'audio':'video'}>${mediaCreditsHTML(item)}<div class="library-actions">${kind==='music'?`<button class="button secondary" data-library-use="${E(item.id)}" ${busy?'disabled':''}>Usar música en la app</button>`:['home','register'].map(slot=>`<button class="button secondary" data-library-use="${E(item.id)}" data-slot="${slot}" ${busy?'disabled':''}>Usar en ${slot==='home'?'Inicio':'Crear cuenta'}</button>`).join('')}${used?`<button class="text-button danger" type="button" data-library-unpublish="${E(item.id)}" ${busy?'disabled':''}>Quitar de la app</button>`:''}<button class="text-button danger" data-library-archive="${E(item.id)}" ${busy||used?'disabled':''}>Quitar de biblioteca</button></div></article>`;
 }).join('')}</div>${list.length?'':'<p>Aún no hay archivos guardados. Los que subas aparecerán aquí.</p>'}</section>`;
}
export function installLibraryUI(callback){
 render=callback;const app=document.querySelector('#app');
 app.addEventListener('input',event=>{if(!event.target.matches('[data-library-search]'))return;const query=event.target.value.toLocaleLowerCase();app.querySelectorAll('[data-library-item]').forEach(card=>{card.hidden=!card.textContent.toLocaleLowerCase().includes(query);});});
 app.addEventListener('play',event=>{if(!event.target.closest('.media-library'))return;document.querySelectorAll('audio,video').forEach(media=>{if(media!==event.target&&!media.paused)media.pause();});},true);
 app.addEventListener('click',async event=>{
  if(event.target.closest('[data-library-retry]')){invalidateLibrary();render();return;}
  if(event.target.closest('[data-library-upload]')){app.querySelector('[data-music-form],[data-content-form=video]')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const use=event.target.closest('[data-library-use]'),archive=event.target.closest('[data-library-archive]'),unpublish=event.target.closest('[data-library-unpublish]');if(!use&&!archive&&!unpublish)return;if(busy)return;
  const user=state.user?.id;busy=true;feedback='';(use||archive||unpublish).disabled=true;
  try{await request('/api/admin/library/'+(use?.dataset.libraryUse||archive?.dataset.libraryArchive||unpublish.dataset.libraryUnpublish)+((use||unpublish)?'/use':''),{method:use?'POST':'DELETE',...(use?{body:{slot:use.dataset.slot}}:{})});if(user!==state.user?.id)return;await refresh();items=(await request('/api/admin/library')).items;feedback=use?((items.find(item=>item.id===use.dataset.libraryUse)?.kind==='music'&&state.public.settings.musicAutoplay===true)?'Música seleccionada. Intentará sonar al entrar; si el navegador la bloquea, aparecerá Activar música.':'Selección guardada. Disponible en la app; cada persona pulsa Reproducir.'):(unpublish?'Quitado de la app. Sigue guardado en la biblioteca.':'Archivo retirado de la biblioteca; no se borró físicamente.');}catch(err){if(user===state.user?.id)feedback=err.message;}finally{if(user===state.user?.id){busy=false;render();}}
 });
}
