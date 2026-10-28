import {copy,cuts,filterCuts} from './data.js';
import {languagePreference} from './language.js';
import {reviewsContent,reviewsLink,installReviewsUI} from './reviews-ui.js';
import {state,bootstrap,accountContent,registrationContent,recoveryActive,verificationActive,resetCustomerEntry,installServerUI,escapeHTML as E} from './server-ui.js';
import {realBookingContent,realAppointmentsContent,installBookingUI,bookingRouteChanged,syncBookingUser} from './booking-ui.js?v=pending-income-1';
import {mediaCreditsHTML} from './media-credits.js';
import {syncMusicPlayer} from './music-player.js';
import {parkHomeVideo,syncHomeVideo} from './home-video.js';
let language=languagePreference.get();
let audience='all',style='all',selected=null,service='men';
const app=document.querySelector('#app');
const routes=['home','services','gallery','offers','booking','appointments','profile','review','admin','register','login'];
const t=key=>E(copy[language][key]);
const s=(es,en)=>language==='es'?es:en;
const route=()=>routes.includes(location.hash.slice(1))?location.hash.slice(1):'home';
const routeName=key=>({booking:s('Reservar cita','Reserve'),appointments:s('Mis citas','My appointments'),profile:s('Mi cuenta','My account'),review:s('Reseñas','Reviews'),admin:s('Administración','Administration'),register:s('Crear cuenta','Create account'),login:s('Iniciar sesión','Sign in')}[key]||t(key));
const paths={
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12 12M8.2 15.8 20 4M14 14l6-6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h3"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  profile:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  chair:'<path d="M5 13V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M3 11v7h18v-7M7 18v3m10-3v3M5 14h14"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.scissors}</svg>`;}
function photo(cut,eager=false){return cut?`<img class="cut-photo" src="${E(cut.image)}" alt="${E(cut.name[language])}" loading="${eager?'eager':'lazy'}" decoding="async" width="1000" height="1000">`:'';}
function logo(){return '<img class="brand-logo" src="assets/brand/reca-logo.jpg" alt="RECA Barbería" width="40" height="40">';}
function ownerAvatar(){return state.public?.settings.ownerPhoto?`<img class="owner-avatar" src="${E(state.public.settings.ownerPhoto)}" alt="${s('Foto del dueño','Owner photo')}">`:`<span class="owner-avatar" role="img" aria-label="${s('Foto del dueño pendiente','Owner photo pending')}">R</span>`;}
function sectionTitle(title,label=''){return `<div class="section-title"><h2>${title}</h2><small>${label}</small></div>`;}
function capsule(title,text,symbol='shield'){return `<div class="capsule">${icon(symbol)}<div><strong>${title}</strong><p>${text}</p></div></div>`;}
function serviceCard(type){
  const svc=state.public.services.find(x=>x.id===type);if(!svc)return '';
  const price=svc.priceCents!=null?new Intl.NumberFormat(language==='es'?'es-US':'en-US',{style:'currency',currency:'USD'}).format(svc.priceCents/100):s('Por definir','Pending');
  return `<article class="card service"><div class="card-top"><div><small class="gold inline">${icon('scissors')}${s('Atención personalizada','Personalized care')}</small><h3>${E(svc.name[language])}</h3></div><div class="service-meta"><strong class="gold">${price}</strong></div></div><p>${E(svc.description[language])}</p><div class="tags"><span>${s('Corte a medida','Tailored haircut')}</span><span>${type==='men'?'Fade / '+t('classic'):s('Atención paciente','Patient care')}</span><span>${t('local')}</span></div><div class="service-bottom"><button class="button secondary" data-action="book-service" data-id="${type}">${s('Reservar cita','Reserve appointment')} ${icon('arrow')}</button></div></article>`;
}
function selection(){
  const cut=cuts.find(c=>c.id===selected);
  return `<aside class="card selection"><span class="eyebrow">${t('selected')}</span><p>${cut?E(cut.name[language]):t('noSelection')}</p><small>${s('Esta referencia se adjuntará a tu reserva al elegir un turno. Seleccionarla no crea una cita.','This inspiration will be attached when you select a time. Selecting it does not create a booking.')}</small><button class="text-button" data-action="decide">${t('decide')}</button></aside>`;
}
function cutCard(cut){return `<article class="card cut ${selected===cut.id?'chosen':''}"><button class="art-button" data-action="detail" data-id="${E(cut.id)}" aria-label="${t('expand')}: ${E(cut.name[language])}">${photo(cut)}<span class="photo-tag">${t(cut.audience)}</span></button><div class="cut-body"><div class="card-top"><h3>${E(cut.name[language])}</h3></div><p>${E(cut.description[language])}</p><small class="credit">${E(cut.author)} · ${E(cut.license||'Unsplash')}</small><button class="button ${selected===cut.id?'':'secondary'}" data-action="select" data-id="${E(cut.id)}">${selected===cut.id?'✓ '+t('selected'):t('select')}</button></div></article>`;}
function home(){
  const hours=state.public.settings.weekly.some(x=>!x.closed&&x.intervals.length);
  return `<div class="status-card"><span class="dot"></span><div><strong>${s('Atención con reserva previa','Visits by appointment')}</strong><small>${hours?s('Sillón único · Ver horarios en Perfil','Single chair · See hours in Profile'):s('Sillón único · Horarios por definir','Single chair · Opening hours pending')}</small></div><span class="badge">USA</span></div><section class="hero card">${state.public.settings.hiddenWelcomeVideos?.home?'':`<div data-home-video-slot></div>${mediaCreditsHTML(state.public.settings.welcomeVideoCredits?.home)}`}<div class="hero-content"><span class="eyebrow">${s('UN SOLO BARBERO · ATENCIÓN PERSONALIZADA','ONE BARBER · PERSONALIZED CARE')}</span><h1>${s('Tu próximo corte exclusivo','Your next exclusive haircut')}</h1><p>${s('Cortes para caballeros y niños. Elige tu estilo y prepara tu próxima visita. El pago se realiza en el local.','Haircuts for gentlemen and kids. Choose your style and plan your next visit. Pay at the shop.')}</p><a class="button full" href="#booking">${icon('calendar')}${s('Reservar Cita Ahora','Reserve an Appointment')}</a></div></section>${capsule(s('Privacidad y cuidado entre turnos','Privacy and care between visits'),s('Atención de un solo barbero. La agenda separa las reservas al menos una hora.','One barber. Bookings are spaced at least one hour apart.'),'chair')}<div class="catalog-heading"><span class="eyebrow">${s('CATÁLOGO RECA','RECA CATALOG')}</span>${sectionTitle(s('Servicios Artesanales','Artisan Services'),`${state.public.services.length} ${s('servicios','services')}`)}</div>${serviceCard('men')}${serviceCard('kids')}${state.public.offers?.length?offersContent():''}<a class="gallery-teaser card" href="#gallery">${photo(cuts[0])}<div><span class="eyebrow">${s('INSPIRACIÓN','INSPIRATION')}</span><h3>${s('Encuentra tu próximo estilo','Find your next style')}</h3><p>${cuts.length} ${s('fotografías reales de cortes','real haircut photographs')}</p><span class="gold">${t('gallery')} ${icon('arrow')}</span></div></a>`;
}
function offersContent(){
  const offers=state.public.offers||[];
  return `<section class="card"><h1>${s('Ofertas vigentes','Current offers')}</h1><p>${s('Selecciona una oferta al confirmar tu reserva. No se acumula con recomendaciones.','Select an offer when confirming your booking. Cannot be combined with referral discounts.')}</p>${offers.length?offers.map(offer=>`<article class="card offer"><span class="badge">${offer.percent}%</span><h2>${E(offer.title[language])}</h2><p>${E(offer.description[language])}</p><p>${E(offer.conditions[language])}</p><small>${s('Válida para citas antes de','Valid for appointments before')} ${E(new Date(offer.endsAt).toLocaleString(language==='es'?'es-US':'en-US',{timeZone:state.public.settings.timezone||'America/New_York'}))}</small><a class="button full" href="#booking">${s('Ver disponibilidad','View availability')}</a></article>`).join(''):`<p>${s('No hay ofertas activas en este momento.','No active offers right now.')}</p>`}</section>`;
}
function gallery(){return `<span class="eyebrow">${s('REFERENCIAS PROFESIONALES','PROFESSIONAL INSPIRATION')}</span><h1>${t('reference')}</h1><p>${t('galleryIntro')}</p><div class="filters"><label>${t('services')}<select id="audience">${['all','men','kids'].map(v=>`<option value="${v}" ${audience===v?'selected':''}>${t(v)}</option>`).join('')}</select></label><label>${s('Estilo','Style')}<select id="style">${['all','fade','classic','textured'].map(v=>`<option value="${v}" ${style===v?'selected':''}>${t(v)}</option>`).join('')}</select></label></div><p class="photo-note">${t('imageNote')} <a href="FOTOS.md" target="_blank" rel="noopener">${s('Fuentes y licencias','Sources and licenses')} ↗</a></p><div class="gallery-grid">${filterCuts(audience,style).map(cutCard).join('')||`<p>${s('No hay referencias para estos filtros.','No inspirations match these filters.')}</p>`}</div>${selection()}`;}
function publicSchedule(){
  const settings=state.public.settings;
  const labels=s(['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
  return `<section class="card"><h2>${s('Ubicación y horarios','Location and hours')}</h2><p>${E(settings.city)||t('footer')}</p><small>${E(settings.timezone)||s('Zona horaria pendiente','Time zone pending')}</small>${settings.cancellationNoticeMinutes==null?'':`<p>${s('Cancelación: mínimo','Cancellation: at least')} ${settings.cancellationNoticeMinutes/60} ${s('horas antes.','hours in advance.')}</p>`}${settings.weekly.map(x=>`<div class="schedule-row"><strong>${labels[x.day]}</strong><small>${x.closed?s('Sin horario activo','No active hours'):E(x.intervals.map(r=>r.join('–')).join(' / '))||s('Por definir','Pending')}</small></div>`).join('')}</section>`;
}
function profile(){if(!state.user||recoveryActive()||verificationActive())return registrationContent(language);return `<h1>${s('Mi cuenta','My account')}</h1><p>${s('Gestiona tu cuenta y consulta los horarios de la barbería.','Manage your account and view the barbershop hours.')}</p>${accountContent(language)}${reviewsLink()}${publicSchedule()}<a class="menu-link card" href="#gallery">${t('gallery')}<span class="gold">${cuts.length} →</span></a><p class="demo-note">${s('Pago en el local. Comparte tu experiencia después de tu cita atendida.','Pay at the shop. Share your experience after your completed appointment.')}</p>`;}
function content(){
  if(state.loading)return `<section class="card connection-card" role="status" aria-live="polite"><span class="loading-indicator" aria-hidden="true"></span><h2>${s('Conectando con la barbería…','Connecting to the barbershop…')}</h2><p>${s('Estamos comprobando tu sesión. Espera un momento.','We are checking your session. Please wait a moment.')}</p></section>`;
  if(!state.connected)return `<section class="card connection-card"><h1>${s('No pudimos conectar','We could not connect')}</h1><p class="warning">${s('Revisa tu conexión a internet. Si estás probando con el QR local, el teléfono y la computadora deben estar en la misma red Wi-Fi.','Check your internet connection. If you are using the local test QR, your phone and computer must be on the same Wi-Fi.')}</p><p>${s('No mostraremos datos de ejemplo ni repetiremos reservas automáticamente.','We will not show sample data or automatically repeat bookings.')}</p><button class="button full" data-action="retry-connection">${s('Reintentar conexión','Try connecting again')}</button></section>`;
  switch(route()){
    case 'register':case 'login':return registrationContent(language);
    case 'booking':return (state.public.settings.hiddenWelcomeVideos?.home?'':'<section class="card booking-welcome"><div data-home-video-slot></div></section>')+realBookingContent();
    case 'appointments':return realAppointmentsContent()+reviewsLink();
    case 'gallery':return gallery();
    case 'profile':return profile();
    case 'admin':return `<a class="button full" href="/comanda/">Sistema de Control de Barbería</a>`;
    case 'services':return `<h1>${t('services')}</h1><p>${t('serviceIntro')}</p>${serviceCard('men')}${serviceCard('kids')}`;
    case 'offers':return offersContent();
    case 'review':return reviewsContent();
    default:return home()+reviewsLink();
  }
}
function render(){
  if(location.hash==='#admin'){location.replace('/comanda/#admin');return;}
  document.body.classList.remove('editing-field');syncBookingUser();
  if(!state.loading&&state.connected&&!state.user&&!['register','login','profile','admin'].includes(route())){history.replaceState(null,'','#register');resetCustomerEntry();}
  if(!state.loading&&state.user&&['register','login'].includes(route()))history.replaceState(null,'','#home');
  const current=route();document.documentElement.lang=language;document.querySelector('.skip').textContent=s('Ir al contenido','Skip to content');document.title=`RECA Barbería · ${routeName(current)}`;
  const active=['services','gallery','offers'].includes(current)?'home':current==='review'?'appointments':['admin','register','login'].includes(current)?'profile':current;
  parkHomeVideo();
  app.innerHTML=`<div class="app-shell"><header class="app-header"><a class="brand" href="${state.user?'#home':'#register'}">${logo()}<span><strong>RECA Barbería</strong><small>${routeName(current)}</small></span></a><div id="language" class="language client-language" role="group" aria-label="${t('language')}" tabindex="-1">${['es','en'].map(code=>`<button type="button" data-client-language="${code}" lang="${code}" aria-label="${code==='es'?'Español':'English'}" aria-pressed="${language===code}">${code.toUpperCase()}</button>`).join('')}</div>${ownerAvatar()}</header><div class="demo-banner">${state.loading?s('Conectando…','Connecting…'):state.connected?(state.user?s('Reservas reales · RECA Barbería','Real bookings · RECA Barbería'):s('Acceso con cuenta de cliente','Customer account required')):s('Sin conexión al servidor','Server unavailable')}</div><main id="main" tabindex="-1">${content()}</main>${state.user&&state.connected&&!state.loading?`<nav class="bottom-nav" aria-label="${s('Navegación principal','Main navigation')}">${[['home','scissors'],['booking','calendar'],['appointments','clock'],['profile','profile']].map(([key,symbol])=>`<a href="#${key}" ${active===key?'aria-current="page"':''}>${icon(symbol)}<span>${routeName(key)}</span></a>`).join('')}</nav>`:''}</div><div id="notice" role="status" aria-live="polite"></div><dialog id="detail" aria-labelledby="detail-title"><div id="detail-body"></div><button class="button secondary full" data-action="close">${t('close')}</button></dialog>`;
  syncMusicPlayer();
  syncHomeVideo();
}
let timer;
function notify(value){const el=document.querySelector('#notice');el.textContent=value;el.classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('visible'),6000);}
function update(selector){
  const y=scrollY;
  // Keep partially typed account fields only in memory during language changes.
  const forms=selector==='#language'?[...document.querySelectorAll('form')].map(form=>({
    selector:form.hasAttribute('data-waitlist-form')?'form[data-waitlist-form]':form.dataset.form?`form[data-form="${form.dataset.form}"]`:null,
    fields:[...form.querySelectorAll('input[name]:not([type=file]),textarea[name],select[name]')].map(input=>({name:input.name,value:input.value,checked:input.checked}))
  })):[];
  render();
  for(const saved of forms){
    if(!saved.selector)continue;
    const form=document.querySelector(saved.selector);if(!form)continue;
    for(const field of saved.fields){const input=[...form.elements].find(input=>input.name===field.name);if(input){input.value=field.value;if(['checkbox','radio'].includes(input.type))input.checked=field.checked;}}
    const name=form.querySelector('[name="name"]');if(form.dataset.form==='account'&&name)form.querySelector('[type="submit"]').hidden=name.value.trim()===state.user?.name;
  }
  document.querySelector(selector==='#language'?`[data-client-language="${language}"]`:selector)?.focus({preventScroll:true});window.scrollTo(0,y);
}
let languageTimer;
function applyPreferredLanguage(){
  clearTimeout(languageTimer);
  if(language===languagePreference.get())return;
  // Never interrupt an in-flight form submission when another tab changes language.
  if(document.querySelector('form[aria-busy="true"]')){languageTimer=setTimeout(applyPreferredLanguage,250);return;}
  language=languagePreference.get();update('#language');
}
languagePreference.subscribe(applyPreferredLanguage);
app.addEventListener('change',event=>{
  if(event.target.id==='audience')audience=event.target.value;
  else if(event.target.id==='style')style=event.target.value;
  else return;
  update('#'+event.target.id);
});
app.addEventListener('click',async event=>{
  const languageButton=event.target.closest('[data-client-language]');
  if(languageButton){
    if(document.querySelector('form[aria-busy="true"]')){notify(s('Espera a que termine la solicitud.','Wait for the request to finish.'));return;}
    languagePreference.set(languageButton.dataset.clientLanguage);return;
  }
  const button=event.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;
  if(action==='retry-connection'){
    if(state.loading)return;state.loading=true;render();await bootstrap();render();document.querySelector('#main')?.focus({preventScroll:true});return;
  }
  if(action==='book-service'){service=id;if(cuts.find(c=>c.id===selected)?.audience!==service)selected=null;location.hash='booking';}
  if(action==='select'){selected=id;const cut=cuts.find(c=>c.id===id);if(cut)service=cut.audience;update(`[data-action="select"][data-id="${id}"]`);notify(s('Referencia elegida para tu próxima reserva.','Inspiration selected for your next booking.'));}
  if(action==='decide'){selected=null;update('[data-action="decide"]');notify(s('Puedes decidir el corte en el local.','You can choose your haircut at the shop.'));}
  if(action==='detail'){
    const cut=cuts.find(c=>c.id===id);if(!cut)return;
    document.querySelector('#detail-body').innerHTML=`${photo(cut,true)}<h2 id="detail-title">${E(cut.name[language])}</h2><p>${E(cut.description[language])}</p><small>${E(cut.author)} · ${E(cut.license||'Unsplash')}</small>`;
    document.querySelector('#detail').showModal();
  }
  if(action==='close')document.querySelector('#detail').close();
});
window.addEventListener('hashchange',()=>{bookingRouteChanged();render();document.querySelector('#main').focus({preventScroll:true});window.scrollTo(0,0);});
// Keep the bottom navigation out of the keyboard area. Delay restoration on
// blur so an iOS tap on Submit is not intercepted by a reappearing fixed bar.
let fieldBlurTimer;
// Language buttons do not open a keyboard. Restoring their focus after
// translation must not hide navigation or the persistent audio controls.
const editingControl=el=>el?.matches?.('input:not([type=checkbox]):not([type=range]),select:not(#language),textarea');
app.addEventListener('focusin',event=>{if(editingControl(event.target)){clearTimeout(fieldBlurTimer);document.body.classList.add('editing-field');}});
app.addEventListener('focusout',()=>{clearTimeout(fieldBlurTimer);fieldBlurTimer=setTimeout(()=>{if(!editingControl(document.activeElement))document.body.classList.remove('editing-field');},350);});
installServerUI(render);
installReviewsUI(render);
installBookingUI(render,()=>({language,service,reference:selected}),value=>{service=value;if(cuts.find(c=>c.id===selected)?.audience!==service)selected=null;});
render();
await bootstrap();
render();
