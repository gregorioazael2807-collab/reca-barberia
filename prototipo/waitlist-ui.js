import {state,request,escapeHTML as E} from './server-ui.js';
import {customerError} from './client-request.js';
let render=()=>{},cacheUser=null,data=null,loading=false,busy=false,feedback='',generation=0,optionalOpen=false;
function sync(){
  const user=state.user?.id??null;
  if(cacheUser!==user){cacheUser=user;data=null;loading=false;busy=false;feedback='';optionalOpen=false;generation++;}
}
async function load(){
  const run=++generation;loading=true;
  try{const result=await request('/api/waitlist');sync();if(run===generation)data=result;}
  catch(err){sync();if(run===generation)feedback=err;}
  finally{if(run===generation){loading=false;render();}}
}
export function waitlistContent({serviceId,date,language}){
  sync();if(state.user?.role!=='customer')return '';
  const en=language==='en';
  if(!data&&!loading&&!feedback)void load();
  const service=id=>state.public.services.find(s=>s.id===id)?.name[language]||id;
  return `<details class="card waitlist-optional" ${optionalOpen?'open':''}><summary>${en?'Cannot find a time? Optional waiting list':'¿No encuentras hora? Lista de espera opcional'}</summary><section class="waitlist-panel"><h2>${en?'Waiting list':'Lista de espera'}</h2><p>${en?'Choose when you would like an opening. Joining does not book or hold a time.':'Elige cuándo te interesa un horario libre. Apuntarte no reserva ni retiene una cita.'}</p><p class="warning">${en?'Email and WhatsApp delivery is not connected yet. Preferences and private drafts work; no messages are sent.':'El envío por correo y WhatsApp aún no está conectado. Se guardan preferencias y borradores privados; no se envían mensajes.'}</p>${feedback?`<p role="status">${E(Array.isArray(feedback)?feedback[en?1:0]:feedback instanceof Error?customerError(feedback,language):feedback)}</p>`:''}${loading?`<p role="status">${en?'Loading waiting list…':'Cargando lista de espera…'}</p>`:''}<form class="server-form" data-waitlist-form><input type="hidden" name="serviceId" value="${E(serviceId)}"><input type="hidden" name="date" value="${E(date)}"><p>${E(service(serviceId))} · ${E(date)} · ${E(state.public.settings.timezone)}</p><div class="form-grid"><label class="field-label">${en?'Earliest start':'Desde'}<input type="time" name="from" value="09:00" required></label><label class="field-label">${en?'Latest start':'Hasta'}<input type="time" name="to" value="20:00" required></label></div><label class="check-label"><input type="checkbox" name="emailConsent">${en?'I agree to receive emails about matching openings, not advertising.':'Acepto avisos por correo sobre horarios compatibles, no publicidad.'}</label><label class="check-label"><input type="checkbox" name="whatsappConsent">${en?'I agree to receive WhatsApp messages about matching openings, not advertising.':'Acepto avisos por WhatsApp sobre horarios compatibles, no publicidad.'}</label><label class="field-label">${en?'WhatsApp phone (only if selected)':'Teléfono WhatsApp (solo si lo seleccionas)'}<input type="tel" name="phone" autocomplete="tel" placeholder="+18135551234" maxlength="16"></label><button class="button full" ${busy?'disabled':''}>${en?'Save waiting-list preference':'Guardar preferencia de espera'}</button></form><div class="waitlist-entries">${(data?.entries||[]).map(entry=>`<article class="waitlist-entry"><strong>${E(service(entry.serviceId))}</strong><p>${E(entry.date)} · ${E(entry.from)}–${E(entry.to)}</p><button class="text-button danger" type="button" data-waitlist-remove="${E(entry.id)}" ${busy?'disabled':''}>${en?'Leave this waiting list':'Salir de esta lista de espera'}</button></article>`).join('')}</div>${data?.notices?.length?`<p class="live-note">${en?'Matching times are currently available. Choose a time above; another customer may book first.':'Hay horarios compatibles disponibles. Elige un turno arriba; otro cliente podría reservar antes.'}</p>`:''}<button class="text-button" type="button" data-waitlist-refresh ${busy||loading?'disabled':''}>${en?'Refresh waiting list':'Actualizar lista de espera'}</button></section></details>`;
}
export function installWaitlistUI(callback){
  render=callback;const app=document.querySelector('#app');
  app.addEventListener('toggle',event=>{if(event.target.matches('.waitlist-optional')&&event.target.isConnected)optionalOpen=event.target.open;},true);
  async function operation(fn){
    sync();if(busy)return;const user=cacheUser;busy=true;feedback='';
    try{await fn();if(user!==state.user?.id)return;data=null;feedback=['Preferencia actualizada. No se enviaron mensajes.','Preference saved. No messages have been sent.'];await load();}
    catch(err){if(user===state.user?.id)feedback=err;}
    finally{sync();if(user===cacheUser){busy=false;render();}}
  }
  app.addEventListener('submit',event=>{
    if(!event.target.hasAttribute('data-waitlist-form'))return;event.preventDefault();if(busy)return;
    const fd=new FormData(event.target);
    const body={serviceId:String(fd.get('serviceId')),date:String(fd.get('date')),from:String(fd.get('from')),to:String(fd.get('to')),emailConsent:fd.has('emailConsent'),whatsappConsent:fd.has('whatsappConsent'),phone:String(fd.get('phone')||'').trim()};
    void operation(()=>request('/api/waitlist',{method:'POST',body}));
  });
  app.addEventListener('click',event=>{
    const remove=event.target.closest('[data-waitlist-remove]');
    if(remove){void operation(()=>request('/api/waitlist/'+remove.dataset.waitlistRemove,{method:'DELETE'}));return;}
    if(event.target.closest('[data-waitlist-refresh]')&&!loading&&!busy){feedback='';void load();}
  });
}
