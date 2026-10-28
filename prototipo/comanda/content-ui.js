import {state,request,escapeHTML as E,refresh} from '../server-ui.js';
import {musicManagement} from '../music-player.js';
import {offerText,offerFromForm} from './offer-form.js';
const say=(es,en)=>document.documentElement.lang==='en'?en:es;
import {libraryContent,invalidateLibrary,installLibraryUI} from './library-ui.js';
let render=()=>{},offers=null,loading=false,busy=false,feedback='',draft=null,userId=null;
const local=value=>{if(!value)return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:state.public.settings.timezone||'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const part=key=>parts.find(p=>p.type===key).value;return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;};
function sync(){if(userId!==state.user?.id){userId=state.user?.id;offers=null;loading=false;busy=false;feedback='';draft=null;}}
async function load(){const user=state.user?.id;loading=true;try{const result=await request('/api/admin/offers');if(user===state.user?.id)offers=result.offers;}catch(err){if(user===state.user?.id)feedback=err.message;}finally{if(user===state.user?.id){loading=false;render();}}}
const field=(name,label,value='',type='text',extra='')=>`<label class="field-label">${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
export function rememberOfferForm(){
  const form=document.querySelector('form[data-content-form="offer"]');
  if(form)draft=offerFromForm(new FormData(form),draft||{},document.documentElement.lang);
}
export function offersManagement(){
  sync();if(!offers&&!loading&&!feedback)void load();
  const language=document.documentElement.lang,d=draft||{};
  const loadingHTML=`<p role="status">${say('Cargando ofertas…','Loading offers…')}</p>`;
  if(!offers&&loading)return `<h1>${say('Ofertas','Offers')}</h1>${loadingHTML}`;
  return `<h1>${say('Ofertas','Offers')}</h1><p>${say('Crea ofertas que aparecerán en la app. Se eligen al confirmar una reserva; no se acumulan con recomendaciones. La fecha de la cita también debe estar dentro de la vigencia.','Create offers for the app. Customers select one when confirming a booking; offers cannot be combined with referrals. The appointment date must also fall within the offer period.')}</p>${feedback?`<p class="warning" role="status">${E(feedback)}</p>`:''}<form class="card server-form" data-content-form="offer" aria-busy="${busy}"><h2>${d.id?say('Editar oferta','Edit offer'):say('Crear oferta','Create offer')}</h2>${field('title',say('Título','Title'),offerText(d,'title',language),'text','required maxlength="100"')}${field('description',say('Descripción','Description'),offerText(d,'description',language),'text','required maxlength="600"')}${field('conditions',say('Condiciones','Conditions'),offerText(d,'conditions',language),'text','required maxlength="600"')}<small>${say('Un solo campo por texto. ES / EN cambia el idioma de edición y conserva la otra versión. No hay traducción automática; si solo escribes una versión, se usa inicialmente en ambos idiomas.','One field per text. ES / EN changes the editing language and keeps the other version. There is no automatic translation; if you enter only one version, it is initially used in both languages.')}</small>${field('percent',say('Descuento % (1–90)','Discount % (1–90)'),d.percent??10,'number','required min="1" max="90" step="1"')}<small>${say('Fechas en','Dates in')} ${E(state.public.settings.timezone||say('zona horaria pendiente','time zone pending'))}</small>${field('startsLocal',say('Desde','From'),d.startsLocal??local(d.startsAt),'datetime-local','required')}${field('endsLocal',say('Hasta','Until'),d.endsLocal??local(d.endsAt),'datetime-local','required')}<label class="check-label"><input type="checkbox" name="men" ${(d.serviceIds||['men','kids']).includes('men')?'checked':''}>${say('Caballeros','Gentlemen')}</label><label class="check-label"><input type="checkbox" name="kids" ${(d.serviceIds||['men','kids']).includes('kids')?'checked':''}>${say('Niños','Kids')}</label><label class="check-label"><input type="checkbox" name="active" ${d.active!==false?'checked':''}>${say('Publicar durante la vigencia','Publish during the offer period')}</label><button class="button full" ${busy?'disabled':''}>${say('Guardar oferta','Save offer')}</button>${d.id?`<button class="text-button" type="button" data-offer-new>${say('Nueva oferta','New offer')}</button>`:''}</form>${loading?loadingHTML:(offers||[]).map(offer=>`<article class="card"><h2>${E(offerText(offer,'title',language))}</h2><p>${offer.percent}% · ${offer.active?say('Activa (sujeta a vigencia)','Active (subject to dates)'):say('Retirada','Withdrawn')}</p><p>${E(offerText(offer,'conditions',language))}</p><button class="button secondary" data-offer-edit="${E(offer.id)}" ${busy?'disabled':''}>${say('Editar oferta','Edit offer')}</button><button class="text-button danger" data-offer-remove="${E(offer.id)}" ${busy?'disabled':''}>${say('Retirar oferta','Withdraw offer')}</button></article>`).join('')}`;
}
export function musicContent(){sync();const library=libraryContent('music');return library===null?'<h1>Biblioteca de música</h1><p role="status">Cargando música…</p>':library+musicManagement(feedback);}
export function videosManagement(){
  sync();const library=libraryContent('video');if(library===null)return '<h1>Galería de videos</h1><p role="status">Cargando videos…</p>';const videos=state.public.settings.welcomeVideos||{},hidden=state.public.settings.hiddenWelcomeVideos||{};
  return `${library}<h1>Subir videos a la aplicación</h1><p>Sube MP4 H.264, máximo 30 MB y 60 segundos. Usa música e imágenes con autorización. Los clientes pulsan reproducir para escuchar el sonido.</p>${feedback?`<p class="warning" role="status">${E(feedback)}</p>`:''}${['register','home'].map(slot=>`<form class="card server-form" data-content-form="video" data-slot="${slot}"><h2>${slot==='register'?'Crear cuenta':'Inicio · Reservar Cita Ahora'}</h2>${hidden[slot]?'<p>Sin video en esta pantalla.</p>':`<video class="entry-video" controls playsinline preload="metadata"><source src="${E(videos[slot]||('/assets/videos/'+(slot==='register'?'registro-musica':'login-musica')+'.mp4'))}" type="video/mp4"></video>`}<input type="file" name="file" accept="video/mp4" required><label class="check-label"><input type="checkbox" name="permission" required>Tengo autorización para usar este video y su música.</label><label class="check-label"><input type="checkbox" name="publish" checked>Usar en esta pantalla al guardar (desmarca para guardar solo en la biblioteca).</label><button class="button full" ${busy?'disabled':''}>Guardar video</button>${!hidden[slot]?`<button class="text-button danger" type="button" data-video-remove="${slot}" ${busy?'disabled':''}>Quitar video de esta pantalla</button>`:''}${videos[slot]||hidden[slot]?`<button class="text-button" type="button" data-video-reset="${slot}" ${busy?'disabled':''}>Volver al video original</button>`:''}</form>`).join('')}`;
}
export function installContentUI(callback){
  render=callback;installLibraryUI(callback);const app=document.querySelector('#app');
  async function operation(fn,success=say('Guardado. El cambio está disponible en la aplicación.','Saved. The change is available in the app.')){sync();if(busy)return;const user=userId;busy=true;feedback='';app.querySelectorAll('[data-content-form], [data-music-form]').forEach(form=>form.setAttribute('aria-busy','true'));try{await fn();if(user!==state.user?.id)return;await refresh();invalidateLibrary();feedback=success;}catch(err){if(user===state.user?.id)feedback=err.message;}finally{if(user===state.user?.id){busy=false;render();}}}
  app.addEventListener('submit',event=>{
    const form=event.target,kind=form.hasAttribute('data-music-form')?'music':form.dataset.contentForm;if(!kind)return;event.preventDefault();if(busy)return;const fd=new FormData(form),value=name=>String(fd.get(name)||'');
    if(kind==='offer'){
      const body=offerFromForm(fd,draft||{},document.documentElement.lang);
      const id=draft?.id;draft={...body,id};
      void operation(async()=>{await request('/api/admin/offers'+(id?'/'+id:''),{method:id?'PUT':'POST',body});draft=null;offers=(await request('/api/admin/offers')).offers;});
    }
    if(kind==='music-playback')void operation(()=>request('/api/admin/music/playback',{method:'PUT',body:{autoplay:fd.has('autoplay'),scope:value('scope')}}));
    if(kind==='music'){
      const file=fd.get('file'),type=file?.name?.toLowerCase().endsWith('.mp3')?'mp3':file?.name?.toLowerCase().endsWith('.m4a')?'m4a':null;
      if(!fd.has('permission')||!type||file.size>20*1024*1024){feedback='Selecciona MP3/M4A de hasta 20 MB y confirma los permisos.';render();return;}
      form.querySelector('button.button').disabled=true;form.querySelector('button.button').textContent='Subiendo música…';
      void operation(async()=>{const result=await request('/api/admin/music/upload',{method:'POST',raw:true,body:file,headers:{'Content-Type':type==='mp3'?'audio/mpeg':'audio/mp4','X-Media-Permission':'confirmed','X-Media-Title':encodeURIComponent((value('title')||file.name).slice(0,100))},timeoutMs:45000});if(fd.has('publish'))await request('/api/admin/music',{method:'PUT',body:{audio:result.audio,title:value('title')}});},fd.has('publish')?undefined:'Guardado en la biblioteca. La selección de la app no cambió.');
    }
    if(kind==='video'){
      const file=fd.get('file'),slot=form.dataset.slot;
      if(!fd.has('permission')||!file||file.type!=='video/mp4'||file.size>30*1024*1024){feedback='Selecciona un MP4 de hasta 30 MB y confirma los permisos.';render();return;}
      form.querySelector('button.button').disabled=true;form.querySelector('button.button').textContent='Subiendo video…';
      void operation(async()=>{const result=await request('/api/admin/videos/upload',{method:'POST',raw:true,body:file,headers:{'Content-Type':'video/mp4','X-Media-Permission':'confirmed','X-Media-Title':encodeURIComponent(file.name.slice(0,100))},timeoutMs:45000});if(fd.has('publish'))await request('/api/admin/videos/'+slot,{method:'PUT',body:{video:result.video}});},fd.has('publish')?undefined:'Guardado en la biblioteca. La selección de la app no cambió.');
    }
  });
  app.addEventListener('click',event=>{
    if(busy)return;
    const edit=event.target.closest('[data-offer-edit]'),remove=event.target.closest('[data-offer-remove]'),reset=event.target.closest('[data-video-reset]');
    if(edit){draft=(offers||[]).find(offer=>offer.id===edit.dataset.offerEdit);feedback='';render();window.scrollTo(0,0);}
    if(event.target.closest('[data-offer-new]')){draft=null;feedback='';render();}
    if(remove)void operation(async()=>{await request('/api/admin/offers/'+remove.dataset.offerRemove,{method:'DELETE'});offers=(await request('/api/admin/offers')).offers;});
    const videoRemove=event.target.closest('[data-video-remove]');if(videoRemove)void operation(()=>request('/api/admin/videos/'+videoRemove.dataset.videoRemove,{method:'DELETE'}),'Video quitado de esta pantalla. No se sustituye por otro.');
    if(reset)void operation(()=>request('/api/admin/videos/'+reset.dataset.videoReset,{method:'PUT',body:{video:null}}));
    if(event.target.closest('[data-music-remove]'))void operation(()=>request('/api/admin/music',{method:'PUT',body:{audio:null}}));
  });
}
