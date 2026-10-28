import {pendingBookingsHTML} from './pending-bookings.js';
import {state,request,refresh,escapeHTML as E} from './server-ui.js';
import {waitlistContent,installWaitlistUI} from './waitlist-ui.js?v=single-time-1';
import {bookingTimesHTML} from './booking-times.js?v=time-wheel-1';
import {customerError} from './client-request.js';
let render=()=>{},context=()=>({language:'es',service:'men',reference:null});
let contextService='',date='',serviceId='',availability=null,availabilityKey='',loading=false,feedback='',hold=null,offset=0,rescheduling=null,picked=null;
let bookings=null,calendar=null,pendingBookings=null,listKey='',listLoading=false,busy=false,cacheUser=null,selectedOffer='',rewardSelected=false;
function clearPrivateCache(){selectedOffer='';rewardSelected=false;hold=null;bookings=null;calendar=null;pendingBookings=null;rescheduling=null;picked=null;availability=null;availabilityKey='';listKey='';loading=false;listLoading=false;feedback='';date='';contextService='';}
export function syncBookingUser(){const id=state.user?.id??null;if(id!==cacheUser){cacheUser=id;clearPrivateCache();}}
const say=(es,en)=>context().language==='en'?en:es;
const money=cents=>new Intl.NumberFormat(context().language==='en'?'en-US':'es-US',{style:'currency',currency:'USD'}).format(cents/100);
function dateInZone(timezone,value=new Date()) {const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone||'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;}
function when(start,timezone,full=true) {return new Intl.DateTimeFormat(context().language==='en'?'en-US':'es-US',{timeZone:timezone||'America/New_York',...(full?{dateStyle:'medium',timeStyle:'short'}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})}).format(new Date(start));}
function note() {return feedback?`<p role="status" class="warning">${E(Array.isArray(feedback)?say(...feedback):feedback instanceof Error?customerError(feedback,context().language):feedback)}</p>`:'';}
function entryTitle(e) {return E(e.snapshot.service?.name[context().language]||e.snapshot.reason||'');}
function arrivalInfo(e){return e.arrivedAt?`<p class="badge">${say('Llegada y cobro confirmados','Arrival and payment confirmed')}</p><p>${say('Importe registrado:','Amount recorded:')} ${money(e.receivedAmountCents)} · ${E(when(e.arrivedAt,e.snapshot.timezone))}</p>`:'';}
function statusName(status) {return ({confirmed:say('Confirmada','Confirmed'),cancelled:say('Cancelada','Cancelled'),completed:say('Atendida','Completed'),blocked:say('Bloqueado','Blocked')})[status]||E(status);}
function policy(snapshot) {return `<p>${say('Cancela o cambia tu cita al menos','Cancel or reschedule at least')} ${snapshot.cancellationNoticeMinutes/60} ${say('horas antes. Pago en el local.','hours in advance. Pay at the shop.')}</p>`;}
function detail(e) {return `<h3>${entryTitle(e)}</h3><p>${E(when(e.start,e.snapshot.timezone||state.public.settings.timezone))}</p>${e.kind==='booking'?`<p>${money(e.snapshot.service.priceCents)}</p>${e.snapshot.discount?`<p>${e.snapshot.discount.type==='offer'?E(e.snapshot.discount.title[context().language]):say('Descuento por recomendación:','Referral discount:')} ${e.snapshot.discount.percent} % · ${say('Precio original:','Original price:')} ${money(e.snapshot.discount.originalPriceCents)}</p>`:''}${e.snapshot.reference?`<img class="cut-photo" src="${E(e.snapshot.reference.image)}" alt="${E(e.snapshot.reference.name[context().language])}" loading="lazy"><p>${E(e.snapshot.reference.name[context().language])}</p>`:''}${policy(e.snapshot)}`:`<p>${E(when(e.end,state.public.settings.timezone))}</p>`}`;}
async function loadSlots(key) {
  loading=true;availabilityKey=key;
  try {
    const qs=new URLSearchParams({serviceId:rescheduling?.snapshot.service.id||serviceId,date});if(rescheduling)qs.set('rescheduleId',rescheduling.id);
    const data=await request('/api/availability?'+qs);
    if(availabilityKey!==key)return;
    availability=data;offset=Date.parse(data.serverNow)-Date.now();
    if(state.user&&!rescheduling){const result=await request('/api/holds');if(availabilityKey!==key)return;hold=result.hold;offset=Date.parse(result.serverNow)-Date.now();}
  }catch(err){if(availabilityKey===key){feedback=err;availability=null;}}
  finally {if(availabilityKey===key){loading=false;render();}}
}
export function realBookingContent() {
  const ctx=context();if(!rescheduling && contextService!==ctx.service){contextService=ctx.service;serviceId=ctx.service;availabilityKey='';picked=null;}
  date ||= dateInZone(state.public.settings.timezone);
  const svc=rescheduling?.snapshot.service||state.public.services.find(s=>s.id===serviceId)||state.public.services[0];
  if(!svc)return `<h1>${say('Reservar cita','Reserve appointment')}</h1><p class="warning">${say('No hay servicios activos.','No active services.')}</p>`;
  if(!rescheduling && serviceId!==svc.id)serviceId=svc.id;
  const key=JSON.stringify([state.user?.id,serviceId,date,rescheduling?.id,state.public.settings,state.public.services]);
  if(key!==availabilityKey)void loadSlots(key);
  const selections=!rescheduling?`<label class="field-label">${say('Servicio','Service')}<select id="real-service">${state.public.services.map(s=>`<option value="${E(s.id)}" ${s.id===serviceId?'selected':''}>${E(s.name[ctx.language])}</option>`).join('')}</select></label>`:'';
  const showHold=hold && !rescheduling;
  const reference=state.public.gallery.find(c=>c.id===ctx.reference&&c.audience===svc.id);
  const eligibleOffers=showHold?(state.public.offers||[]).filter(offer=>offer.serviceIds.includes(hold.snapshot.service.id)&&Date.parse(hold.start)>=Date.parse(offer.startsAt)&&Date.parse(hold.start)<Date.parse(offer.endsAt)):[];
  const offerSelector=eligibleOffers.length?`<label class="field-label">${say('Oferta opcional · no acumulable','Optional offer · cannot be combined')}<select id="booking-offer"><option value="">${say('Sin oferta','No offer')}</option>${eligibleOffers.map(offer=>`<option value="${E(offer.id)}" ${selectedOffer===offer.id?'selected':''}>${E(offer.title[ctx.language])} · ${offer.percent}% · ${money(Math.round(hold.snapshot.service.priceCents*(100-offer.percent)/100))}</option>`).join('')}</select></label>`:'';
  return `<h1>${rescheduling?say('Cambiar cita','Reschedule'):say('Reservar cita','Reserve appointment')}</h1>${note()}<p>${say('1. Elige la fecha. 2. Desliza las horas. 3. Pulsa Seleccionar hora y confirma tu cita.','1. Choose a date. 2. Slide through the times. 3. Press Select time and confirm your appointment.')}</p><section class="card">${selections}<h2>${E(svc.name[ctx.language])}</h2><p>${svc.priceCents==null?say('Precio pendiente','Price pending'):money(svc.priceCents)}</p><small>${E(state.public.settings.timezone)}</small><p>${reference?E(reference.name[ctx.language]):say('Referencia: decidir en el local','Inspiration: decide at the shop')}</p><label class="field-label">${say('Fecha en la barbería','Date at the shop')}<input id="real-date" type="date" value="${E(date)}" min="${dateInZone(state.public.settings.timezone)}"></label></section>${!state.user?`<p class="warning">${say('Inicia sesión para reservar.','Sign in to book.')}</p><a class="button full" href="#profile">${say('Entrar o crear cuenta','Sign in or create account')}</a>`:''}${loading?`<p role="status">${say('Consultando disponibilidad…','Loading availability…')}</p>`:availability?.ready?bookingTimesHTML(availability.slots,{timezone:availability.timezone,language:ctx.language,selected:picked,disabled:!state.user||busy}):`<p class="warning">${E(availability?.reason||say('No se pudo consultar la disponibilidad.','Availability could not be loaded.'))}</p>`}${showHold?`<section class="card" id="hold-summary">${detail(hold)}<p>${say('Turno retenido durante 10 minutos. Tiempo restante:','Time held for 10 minutes. Time remaining:')} <strong id="hold-countdown"></strong></p>${state.referrals?.availableRewards>0&&(!state.referrals.verificationRequired||state.referrals.emailVerified)?`<label class="check-label"><input type="checkbox" id="use-referral-reward" ${rewardSelected?'checked':''}>${say('Usar un descuento por recomendación del 25 %:','Use one 25% referral discount:')} ${money(Math.round(hold.snapshot.service.priceCents*75/100))} · ${say('Un solo uso, no acumulable.','Single use, cannot be combined.')}</label>`:''}${offerSelector}<button class="button full" data-booking-action="confirm" ${busy?'disabled':''}>${say('Confirmar reserva','Confirm booking')}</button><button class="text-button" data-booking-action="release" ${busy?'disabled':''}>${say('Liberar turno','Release time')}</button></section>`:''}${rescheduling?`<section class="card">${policy(rescheduling.snapshot)}<p>${say('La cita original se conserva hasta confirmar el cambio.','Your original booking remains until the change is confirmed.')}</p><button class="button full" data-booking-action="save-change" ${!picked||busy?'disabled':''}>${say('Confirmar cambio','Confirm change')}</button><button class="text-button" data-booking-action="abort-change">${say('Volver sin cambios','Go back without changes')}</button></section>`:''}${!rescheduling?waitlistContent({serviceId,date,language:ctx.language}):''}`;
}
async function loadList(key,admin) {
  listLoading=true;listKey=key;
  try {const data=await request(admin?'/api/admin/calendar':'/api/bookings');if(key!==listKey)return;if(admin){calendar=data.entries;pendingBookings=data.pendingBookings;}else bookings=data.bookings;}
  catch(err){if(key===listKey)feedback=err;}
  finally {if(key===listKey){listLoading=false;render();}}
}
function ensureList(admin) {const key=`${state.user?.id}:${admin}:${location.hash}`;if(key!==listKey)void loadList(key,admin);}
export function realAppointmentsContent() {
  if(!state.user)return `<h1>${say('Mis citas','My appointments')}</h1><a class="button full" href="#profile">${say('Inicia sesión para ver tus citas','Sign in to view your appointments')}</a>`;
  ensureList(false);
  return `<h1>${say('Mis citas','My appointments')}</h1>${note()}<a class="button full" href="#booking">${say('Reservar nueva cita · Ver horas','Reserve appointment · View times')}</a><button class="button secondary" data-booking-action="refresh-list">${say('Actualizar citas','Refresh appointments')}</button>${listLoading?`<p>${say('Cargando…','Loading…')}</p>`:(bookings||[]).filter(e=>e.status!=='cancelled').map(e=>`<article class="card appointment" data-booking-id="${E(e.id)}"><span class="badge">${statusName(e.status)}</span>${detail(e)}${arrivalInfo(e)}${e.status==='confirmed'&&!e.arrivedAt?`<button class="button secondary" data-booking-action="change" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Cambiar horario','Reschedule')}</button><button class="text-button danger" data-booking-action="cancel" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Cancelar cita','Cancel appointment')}</button>`:''}</article>`).join('')||`<p>${say('No tienes citas para mostrar.','You have no appointments to display.')}</p>`}`;
}
export function calendarContent(language) {
  if(state.user?.role!=='owner')return '';
  ensureList(true);
  return `${pendingBookingsHTML(pendingBookings,language)}<section class="card"><h2>${say('Agenda real','Live calendar')}</h2>${note()}<button class="button secondary" data-booking-action="refresh-list">${say('Actualizar agenda','Refresh calendar')}</button>${listLoading?`<p>${say('Cargando…','Loading…')}</p>`:(calendar||[]).filter(e=>e.status!=='cancelled').map(e=>`<article class="card" data-calendar-id="${E(e.id)}"><span class="badge">${statusName(e.status)}</span>${detail(e)}${arrivalInfo(e)}${e.customer?`<p>${E(e.customer.name)} · ${E(e.customer.email)}</p>`:''}${e.status==='confirmed'?`${!e.arrivedAt?`<button class="button full" data-booking-action="arrive" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Confirmar llegada y cobro','Confirm arrival and payment')} · ${money(e.snapshot.service.priceCents)}</button><small>${say('Solo el día de la cita. Registra el importe como recibido una sola vez.','Only on the appointment day. Records the amount as received once.')}</small>`:''}<button class="button secondary" data-booking-action="complete" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Marcar atendida','Mark completed')}</button>${!e.arrivedAt?`<button class="text-button danger" data-booking-action="cancel" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Cancelar cita','Cancel appointment')}</button>`:''}`:''}${e.status==='blocked'?`<button class="text-button" data-booking-action="unblock" data-id="${E(e.id)}" ${busy?'disabled':''}>${say('Quitar bloqueo','Remove block')}</button>`:''}</article>`).join('')||`<p>${say('Agenda vacía.','Empty calendar.')}</p>`}</section><form class="card server-form" data-booking-form="block"><h2>${say('Bloquear horario','Block time')}</h2><small>${say('Horas locales de la barbería','Shop local times')} · ${E(state.public.settings.timezone)}</small><label class="field-label">${say('Desde','From')}<input name="startLocal" type="datetime-local" required></label><label class="field-label">${say('Hasta','Until')}<input name="endLocal" type="datetime-local" required></label><label class="field-label">${say('Motivo','Reason')}<input name="reason" maxlength="200" required></label><button class="button full" ${busy?'disabled':''}>${say('Guardar bloqueo','Save block')}</button></form>`;
}
async function operation(fn) {
  if(busy)return;const operationUser=state.user?.id;busy=true;feedback='';render();
  try {await fn();availabilityKey='';listKey='';window.dispatchEvent(new Event('reca:finance-changed'));}catch(err){feedback=err;availabilityKey='';}
  finally {if(operationUser!==state.user?.id)clearPrivateCache();busy=false;render();}
}
export function bookingRouteChanged() {
  listKey='';availabilityKey='';feedback='';
  if(location.hash!=='#booking'){rescheduling=null;picked=null;}
}
export function installBookingUI(callback,getContext,setService) {
  render=callback;context=getContext;
  installWaitlistUI(callback);
  const app=document.querySelector('#app');
  app.addEventListener('change',event=>{
    if(event.target.id==='booking-offer'){selectedOffer=event.target.value;if(selectedOffer){rewardSelected=false;const reward=document.querySelector('#use-referral-reward');if(reward)reward.checked=false;}}
    if(event.target.id==='use-referral-reward'){rewardSelected=event.target.checked;if(rewardSelected){selectedOffer='';const offer=document.querySelector('#booking-offer');if(offer)offer.value='';}}
    if(event.target.id==='real-date'){date=event.target.value;availabilityKey='';picked=null;feedback='';render();}
    if(event.target.id==='real-service'){serviceId=event.target.value;setService(serviceId);availabilityKey='';picked=null;feedback='';render();}
  });
  app.addEventListener('click',async event=>{
    const button=event.target.closest('[data-booking-action]');if(!button)return;
    const {bookingAction:action,id,start}=button.dataset;
    if(action==='refresh-list'){listKey='';feedback='';render();return;}
    if(action==='arrive'){
      const entry=(calendar||[]).find(e=>e.id===id);if(!entry||busy)return;
      if(!confirm(say(`¿Confirmas que el cliente llegó y recibiste ${money(entry.snapshot.service.priceCents)}? Se registrará un único ingreso.`,`Confirm that the customer arrived and you received ${money(entry.snapshot.service.priceCents)}? One income entry will be recorded.`)))return;
    }
    if(action==='change') {rescheduling=(bookings||[]).find(b=>b.id===id);picked=null;date=dateInZone(rescheduling.snapshot.timezone,new Date(rescheduling.start));availabilityKey='';feedback='';location.hash='booking';return;}
    if(action==='abort-change'){rescheduling=null;picked=null;availabilityKey='';feedback='';location.hash='appointments';return;}
    if(action==='pick'&&rescheduling){picked=start;render();return;}
    if(action==='pick'){selectedOffer='';rewardSelected=false;}
    const useReferralReward=document.querySelector('#use-referral-reward')?.checked===true;
    const offerId=document.querySelector('#booking-offer')?.value||null;
    await operation(async()=>{
      if(action==='pick'){hold=await request('/api/holds',{method:'POST',body:{serviceId,start,referenceId:state.public.gallery.find(c=>c.id===context().reference&&c.audience===serviceId)?.id??null}});offset=Date.parse(hold.serverNow)-Date.now();picked=start;}
      if(action==='confirm'){await request(`/api/holds/${hold.id}/confirm`,{method:'POST',body:{useReferralReward,offerId}});await refresh();hold=null;feedback=['Reserva confirmada.','Booking confirmed.'];location.hash='appointments';}
      if(action==='release'){await request(`/api/holds/${hold.id}`,{method:'DELETE'});hold=null;picked=null;}
      if(action==='cancel'){if(!confirm(say('¿Cancelar esta cita?','Cancel this appointment?')))return;await request(`/api/bookings/${id}/cancel`,{method:'POST',body:{}});await refresh();feedback=['Cita cancelada. Horario liberado.','Appointment cancelled. Time released.'];}
      if(action==='save-change'){await request(`/api/bookings/${rescheduling.id}/reschedule`,{method:'PATCH',body:{start:picked}});rescheduling=null;picked=null;feedback=['Horario actualizado.','Booking rescheduled.'];location.hash='appointments';}
      if(action==='arrive'){
        await request(`/api/admin/bookings/${id}/arrive`,{method:'POST',body:{received:true}});
        feedback=['Llegada confirmada. Importe registrado como recibido en Ingresos y gastos.','Arrival confirmed. Amount recorded as received in Income and expenses.'];
      }
      if(action==='complete'){await request(`/api/admin/bookings/${id}/complete`,{method:'POST',body:{}});feedback=['Cita marcada atendida.','Appointment marked completed.'];}
      if(action==='unblock')await request(`/api/admin/blocks/${id}`,{method:'DELETE'});
    });
  });
  app.addEventListener('submit',event=>{
    if(event.target.dataset.bookingForm!=='block')return;event.preventDefault();const fd=new FormData(event.target);
    void operation(async()=>{await request('/api/admin/blocks',{method:'POST',body:Object.fromEntries(fd)});feedback=['Bloqueo guardado.','Block saved.'];});
  });
  setInterval(()=>{
    const countdown=document.querySelector('#hold-countdown');
    if(!countdown||!hold)return;
    const seconds=Math.max(0,Math.ceil((Date.parse(hold.expiresAt)-Date.now()-offset)/1000));
    countdown.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    if(!seconds&&!busy){hold=null;picked=null;availabilityKey='';feedback=['La retención caducó; vuelve a elegir un turno.','Your hold expired; choose another time.'];render();}
  },1000);
}
