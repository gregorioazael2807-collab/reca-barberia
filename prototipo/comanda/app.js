import {languagePreference} from '../language.js';
import {state,bootstrap,adminContent,automationContent,accountContent,installServerUI,escapeHTML as E} from '../server-ui.js';
import {gochoContent,installGochoUI} from './gocho-ui.js?v=gocho-chat-1';
import {financeContent,installFinanceUI} from './finance-ui.js?v=pending-income-1';
import {syncMusicPlayer} from '../music-player.js';
import {offersManagement,videosManagement,musicContent,installContentUI,rememberOfferForm} from './content-ui.js?v=offer-language-2';
import {calendarContent,installBookingUI,bookingRouteChanged,syncBookingUser} from '../booking-ui.js?v=pending-income-1';

const app=document.querySelector('#app');
const dashboardName='Sistema de Control de Barbería';
let language=languagePreference.get();
const s=(es,en)=>language==='en'?en:es;
const sectionLabels={admin:['Inicio','Home'],agenda:['Agenda','Calendar'],gocho:['IA Gocho IA','IA Gocho IA'],configuracion:['Horarios y servicios','Hours and services'],galeria:['Fotos reales','Haircut photos'],barbero:['Perfil del barbero','Barber profile'],ofertas:['Ofertas','Offers'],videos:['Galería de videos','Video gallery'],musica:['Biblioteca de música','Music library'],finanzas:['Ingresos y gastos','Income and expenses'],mensajes:['Mensajes y lista de espera','Messages and waiting list'],cuenta:['Mi cuenta','My account'],pendientes:['Próximas funciones','Upcoming features']};
const sections=()=>Object.fromEntries(Object.entries(sectionLabels).map(([key,labels])=>[key,s(...labels)]));
const title=()=>sections()[location.hash.slice(1)]||sections().admin;
function managementPart(selectors){
  const template=document.createElement('template');template.innerHTML=adminContent(language);
  return [...template.content.querySelectorAll(selectors)].map(element=>element.outerHTML).join('');
}
function content(){
  if(state.loading)return `<section class="card connection-card" role="status"><h1>${dashboardName}</h1><p>${s('Comprobando tu sesión privada…','Checking your private session…')}</p></section>`;
  if(!state.connected)return `<section class="card"><h1>${s('No pudimos conectar','We could not connect')}</h1><p class="warning">${s('Revisa tu conexión. No se muestran datos de ejemplo.','Check your connection. No sample data is displayed.')}</p><button class="button full" data-comanda-retry>${s('Reintentar conexión','Try again')}</button></section>`;
  if(!state.user)return `<section class="comanda-access"><p class="eyebrow">${dashboardName} · ${s('ACCESO PRIVADO','PRIVATE ACCESS')}</p>${adminContent(language)}</section>`;
  if(state.user.role!=='owner')return `<h1>${dashboardName}</h1><p class="warning">${s('Solo el dueño puede acceder a esta comanda. Tu cuenta de cliente no tiene permisos administrativos.','Only the owner can access this dashboard. Your customer account has no administrative permissions.')}</p><a class="button full" href="/">${s('Volver a la aplicación de clientes','Back to the customer app')}</a><button class="text-button" data-server-action="logout">${s('Cerrar sesión','Sign out')}</button>`;
  switch(location.hash.slice(1)){
    case 'agenda':return `<h1>${s('Agenda','Calendar')}</h1>`+calendarContent(language);
    case 'configuracion':return `<h1>${s('Horarios y servicios','Hours and services')}</h1><p>${s('Los cambios guardados se reflejan en la aplicación de clientes.','Saved changes appear in the customer app.')}</p>`+managementPart('[data-form="settings"], [data-form="service"]');
    case 'galeria':return `<h1>${s('Fotos reales','Haircut photos')}</h1><p>${s('Sube tus fotos únicamente con los permisos de uso e imagen necesarios.','Upload photos only with the required usage and image permissions.')}</p><a class="button secondary" href="#musica">♫ ${s('Subir o cambiar música de la galería','Upload or change gallery music')}</a>`+managementPart('[data-form="gallery"], section.card');
    case 'barbero':return `<h1>${s('Perfil del barbero','Barber profile')}</h1><p>${s('Esta es tu foto pública como barbero. Al guardarla aparecerá también en la cabecera de la aplicación de clientes.','This is your public barber photo. Once saved, it also appears in the customer app header.')}</p><section class="card barber-profile-preview"><h2>${s('Foto actual','Current photo')}</h2>${state.public.settings.ownerPhoto?`<img class="barber-profile-photo" src="${E(state.public.settings.ownerPhoto)}" alt="${s('Foto pública del barbero','Public barber photo')}">`:`<p>${s('Todavía no has colocado tu foto de perfil.','You have not added a profile photo yet.')}</p>`}<small>${s('El logotipo de la barbería se mantiene separado de tu fotografía personal.','The shop logo is kept separate from your personal photo.')}</small></section>${managementPart('[data-form="owner-photo"]')}`;
    case 'ofertas':return offersManagement();
    case 'videos':return videosManagement();
    case 'musica':return musicContent();
    case 'finanzas':return financeContent();
    case 'gocho':return gochoContent();
    case 'mensajes':return `<h1>${s('Mensajes y lista de espera','Messages and waiting list')}</h1>`+automationContent(language);
    case 'cuenta':return `<h1>${s('Mi cuenta del dueño','My owner account')}</h1><a class="button secondary" href="#barbero">${s('Cambiar mi foto de barbero','Change my barber photo')}</a>`+accountContent(language,{ownerArea:true});
    case 'pendientes':return `<h1>${s('Puesta en producción pendiente','Production deployment pending')}</h1><section class="card"><p class="warning">${s('Publicación HTTPS, proveedores de mensajes y aprobación legal siguen pendientes. Los reportes financieros son un control operativo, no una declaración fiscal ni una garantía de ganancias.','HTTPS hosting, messaging providers and legal approval are still pending. Financial reports are operational records, not tax returns or a guarantee of profit.')}</p></section>`;
    default:return '';
  }
}
function render(){
  syncBookingUser();document.documentElement.lang=language;document.querySelector('.skip').textContent=s('Ir al contenido','Skip to content');document.title=dashboardName+' · '+title();
  const owner=state.user?.role==='owner',wasOpen=document.querySelector('#comanda-menu')?.open===true;
  const home=owner&&(!sections()[location.hash.slice(1)]||location.hash==='#admin');
  const nav=owner?`<dialog id="comanda-menu" class="comanda-drawer" aria-label="${s('Menú de '+dashboardName,dashboardName+' menu')}"><div class="comanda-drawer-heading"><strong>${dashboardName}</strong><button class="text-button" type="button" data-comanda-menu="close">${s('Cerrar menú','Close menu')}</button></div><nav class="comanda-nav" aria-label="${s('Secciones de la comanda','Dashboard sections')}">${Object.entries(sections()).map(([key,label])=>`<a href="#${key}" ${location.hash.slice(1)===key||(!location.hash&&key==='admin')?'aria-current="page"':''}>${E(label)}</a>`).join('')}</nav></dialog>`:'';
  // Shared forms use root-relative assets in this separate entry point.
  const body=content().replaceAll('src="assets/','src="/assets/');
  app.querySelectorAll('audio,video').forEach(media=>media.pause());
  app.innerHTML=`<div class="app-shell comanda-shell"><header class="app-header">${owner?`<button class="comanda-menu-toggle" type="button" data-comanda-menu="open" aria-controls="comanda-menu" aria-expanded="false">☰ <span>${s('Menú','Menu')}</span></button>`:''}<a class="brand" href="/comanda/"><img class="brand-logo" src="/assets/brand/reca-logo.jpg" alt="RECA Barbería"><span><strong>${dashboardName}</strong><small>${s('Control privado','Private dashboard')} · RECA Barbería</small></span></a><div id="language" class="language client-language" role="group" aria-label="${s('Idioma','Language')}">${['es','en'].map(code=>`<button type="button" data-comanda-language="${code}" lang="${code}" aria-label="${code==='es'?'Español':'English'}" aria-pressed="${language===code}">${code.toUpperCase()}</button>`).join('')}</div>${state.public?.settings.ownerPhoto?`<img class="owner-avatar" src="${E(state.public.settings.ownerPhoto)}" alt="${s('Foto del dueño','Owner photo')}">`:''}<a class="comanda-client-link" href="/">${s('Ver app de clientes','View customer app')}</a></header><div class="comanda-layout">${nav}<main id="main" class="${home?'comanda-home':''}" tabindex="-1">${body}</main></div></div>`;
  syncMusicPlayer();
  if(wasOpen&&owner)setMenu(true);
  document.querySelector('#comanda-menu')?.addEventListener('close',()=>{document.querySelectorAll('[data-comanda-menu="open"]').forEach(button=>button.setAttribute('aria-expanded','false'));});
}
function setMenu(open){
  const dialog=document.querySelector('#comanda-menu');if(!dialog)return;
  if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();
  document.querySelectorAll('[data-comanda-menu="open"]').forEach(button=>button.setAttribute('aria-expanded',String(open)));
}
installServerUI(render);
installContentUI(render);
installFinanceUI(render);
installGochoUI(()=>{if(location.hash==='#gocho'&&state.user?.role==='owner')render();});
installBookingUI(render,()=>({language,service:'men',reference:null}),()=>{});
let languageTimer;
function applyPreferredLanguage(){
  clearTimeout(languageTimer);
  if(language===languagePreference.get())return;
  if(document.querySelector('form[aria-busy="true"]')){languageTimer=setTimeout(applyPreferredLanguage,250);return;}
  rememberOfferForm();
  // Keep unsaved form values in memory only; offers keep separate language drafts.
  const signature=form=>JSON.stringify([...form.attributes].filter(attr=>attr.name.startsWith('data-')).map(attr=>[attr.name,attr.value]));
  const forms=[...document.querySelectorAll('form:not([data-content-form="offer"])')].map(form=>({
    key:signature(form),fields:[...form.elements].filter(input=>input.name&&input.type!=='file').map(input=>({name:input.name,value:input.value,checked:input.checked}))
  }));
  const y=scrollY;language=languagePreference.get();render();
  for(const saved of forms){
    const form=[...document.querySelectorAll('form')].find(form=>signature(form)===saved.key);if(!form)continue;
    for(const field of saved.fields){const input=[...form.elements].find(input=>input.name===field.name);if(input){input.value=field.value;if(['checkbox','radio'].includes(input.type))input.checked=field.checked;}}
  }
  document.querySelector(`[data-comanda-language="${language}"]`)?.focus({preventScroll:true});window.scrollTo(0,y);
}
languagePreference.subscribe(applyPreferredLanguage);
app.addEventListener('click',async event=>{
  const languageButton=event.target.closest('[data-comanda-language]');
  if(languageButton){if(!document.querySelector('form[aria-busy="true"]'))languagePreference.set(languageButton.dataset.comandaLanguage);return;}
  const menu=event.target.closest('[data-comanda-menu]');if(menu){setMenu(menu.dataset.comandaMenu==='open');return;}
  if(event.target.closest('.comanda-nav a')){setMenu(false);return;}
  const dialog=document.querySelector('#comanda-menu');if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)setMenu(false);return;}
  if(!event.target.closest('[data-comanda-retry]')||state.loading)return;
  state.loading=true;render();await bootstrap();render();
});
window.addEventListener('hashchange',()=>{bookingRouteChanged();render();document.querySelector('#main')?.focus({preventScroll:true});window.scrollTo(0,0);});
render();await bootstrap();render();
