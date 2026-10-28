import {state,request,escapeHTML as E,refresh} from '../server-ui.js';
let ownerId=null,status=null,history=[],loading=false,busy=false,feedback='',command='',startDate='',endDate='',render=()=>{},pending=null,latest=null,progress='',threadId=null;
const openDetails=new Set();
function sync(){
 if(ownerId!==state.user?.id){ownerId=state.user?.id;status=null;history=[];loading=false;busy=false;feedback='';command='';startDate='';endDate='';pending=null;latest=null;progress='';threadId=newRequestId();openDetails.clear();}
}
async function load(){
 const user=ownerId;loading=true;
 try{const [s,h]=await Promise.all([request('/api/admin/gocho/status'),request('/api/admin/gocho/history')]);if(user===state.user?.id){status=s;history=h.requests;latest=history[0]||null;}}
 catch(err){if(user===state.user?.id)feedback=err.message;}
 finally{if(user===state.user?.id){loading=false;render();}}
}
function newRequestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
const date=(value,zone)=>new Intl.DateTimeFormat('es-US',{timeZone:zone||'UTC',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const usd=cents=>new Intl.NumberFormat('es-US',{style:'currency',currency:'USD'}).format(cents/100);
const labels={pending:'Consulta pendiente',done:'Respuesta',failed:'No se pudo completar la consulta',proposed:'Propuesta sin aplicar',applied:'Bloqueo confirmado'};
const entryLabel=entry=>({held:'Reserva en proceso',confirmed:'Cita confirmada',completed:'Cita atendida',blocked:'Tiempo bloqueado'})[entry.status]||entry.status;
function responseContent(item){
 if(busy)return `<section class="card gocho-response" data-gocho-busy aria-labelledby="gocho-response-title"><span class="gocho-response-badge">RESPUESTA DE IA GOCHO IA</span><h2 id="gocho-response-title">Estoy consultando…</h2><p role="status" data-gocho-progress>${E(progress)}</p><p>La respuesta aparecerá en esta ventana.</p></section>`;
 if(feedback)return `<section class="card gocho-response gocho-response-error" data-gocho-error aria-labelledby="gocho-response-title"><span class="gocho-response-badge">AVISO DEL ASISTENTE</span><h2 id="gocho-response-title">No se pudo completar</h2><p role="alert">${E(feedback)}</p></section>`;
 if(!item)return '<section class="card gocho-response" data-gocho-empty aria-labelledby="gocho-response-title"><span class="gocho-response-badge">RESPUESTA DE IA GOCHO IA</span><h2 id="gocho-response-title">Aquí verás mi respuesta</h2><p>Escribe tu orden en el cuadro de mensajes y pulsa Enviar o Enter.</p></section>';
 const out=item.output||{},isOffer=out.action==='create_offer';let answer=out.text||'La solicitud está pendiente. Pulsa Actualizar en Más opciones para revisar el resultado.';
 if(typeof out.count==='number')answer=out.count===0?'No tienes citas ni bloqueos registrados en este periodo.':`Hay ${out.count} intervalos ocupados en tu agenda.`;
 if(out.action==='gastos')answer=`Gastos pagados registrados: ${usd(out.expenseCents)}.`;
 if(out.action==='finanzas')answer=`Ingresos recibidos: ${usd(out.incomeCents)}. Gastos pagados: ${usd(out.expenseCents)}. Solo movimientos registrados.`;
 return `<section class="card gocho-response${item.status==='failed'?' gocho-response-error':''}" data-gocho-response tabindex="-1" aria-labelledby="gocho-response-title">
  <span class="gocho-response-badge">RESPUESTA PARA TI</span><h2 id="gocho-response-title">${E(isOffer?(item.status==='applied'?'Oferta publicada':'Revisa tu oferta'):labels[item.status]||'Respuesta')}</h2><p class="gocho-answer">${E(answer)}</p>
  ${isOffer?out.services.map(service=>`<p>${E(service.name.es)}: ${E(usd(service.priceCents))} → <strong>${E(usd(Math.round(service.priceCents*(100-out.offer.percent)/100)))}</strong> con los precios actuales.</p>`).join(''):''}
  ${out.startDate?`<small>Periodo: ${E(out.startDate)} hasta antes del ${E(out.endDateExclusive)}.</small>`:''}
  ${(out.entries||out.conflicts||[]).slice(0,5).map(entry=>`<p>${E(date(entry.start,out.timezone))} — ${E(date(entry.end,out.timezone))}<br>${E(entryLabel(entry))}</p>`).join('')}
  ${item.status==='proposed'&&out.canConfirm?`<p>${isOffer?'La oferta solo se publicará si tú confirmas.':'Solo se bloqueará este periodo si tú confirmas. La agenda se revisa otra vez antes de guardar.'}</p><button class="button full" type="button" data-gocho-confirm="${E(item.id)}" ${busy?'disabled':''}>${isOffer?'Confirmar publicación de oferta':'Confirmar bloqueo'}</button>`:''}
  <small class="gocho-your-order">Tu orden: ${E(item.input?.command||({agenda:'Mi agenda',gastos:'Mis gastos',finanzas:'Ingresos y gastos',weekend_off:'Fin de semana libre'})[item.input?.action]||'consulta')} · ${E(date(item.createdAt,out.timezone))}</small>
 </section>`;
}
function details(name,title,body){return `<details class="card gocho-details" data-gocho-details="${name}" ${openDetails.has(name)?'open':''}><summary>${title}</summary>${body}</details>`;}
export function gochoContent(){
 sync();if(!status&&!loading&&!feedback)void load();if(loading)return '<h1>IA Gocho IA</h1><p role="status">Cargando tu asistente…</p>';
 const disabled=busy?'disabled':'',canSend=status?.available&&status.remaining!==0;
 const quota=status?.available&&status.unlimited?`<p class="gocho-quota" role="status">Sin límite diario de consultas. Hoy llevas ${status.used}. Cada consulta puede generar cargos de OpenAI.</p>`:status?.available&&Number.isInteger(status.remaining)?`<p class="gocho-quota" role="status">${status.remaining===0?`Hoy alcanzaste el límite de ${status.dailyLimit} consultas de IA. Usa las consultas rápidas sin IA; se renueva el ${E(date(status.resetAt,state.public?.settings?.timezone))}.`:`Quedan ${status.remaining} de ${status.dailyLimit} consultas de IA hoy.`}</p>`:'';
 const options=`<p>Consultas por fecha, sin usar IA. Hasta 31 días; el día final no se incluye.</p><label class="field-label">Desde<input type="date" data-gocho-start value="${E(startDate)}"></label><label class="field-label">Hasta (día no incluido)<input type="date" data-gocho-end value="${E(endDate)}"></label><div class="library-actions">${[['agenda','Consultar agenda'],['gastos','Consultar gastos'],['finanzas','Consultar ingresos y gastos'],['weekend_off','Preparar fin de semana libre']].map(([action,label])=>`<button class="button secondary" type="button" data-gocho-direct="${action}" ${disabled}>${label}</button>`).join('')}</div><button class="text-button" type="button" data-gocho-reload ${disabled}>Actualizar estado e historial</button><p>También responde preguntas generales y consulta la fecha y hora reales de la barbería. No tiene búsqueda web ni información en directo. Puede preparar ofertas de porcentaje y bloqueos temporales. Publicar una oferta o bloquear requiere confirmación. No mueve ni cancela citas, cambia precios base, registra pagos o envía mensajes. Los bloqueos requieren confirmación y caducan como propuesta a los 15 minutos.</p><small>${E(status?.available?`${status.model} · ${status.unlimited?'sin límite diario de consultas':`máximo ${status.dailyLimit} consultas de IA al día UTC`}. Puede tener coste de API; no es un límite en dólares.`:status?.reason||'IA pendiente de configuración.')} Solo se envían a OpenAI la orden y fecha/zona de referencia, no los registros ni contactos.</small>`;
 const records=history.length?history.map(item=>`<article data-gocho-request="${E(item.id)}"><p><strong>${E(labels[item.status]||item.status)}</strong> · ${E(date(item.createdAt))}</p><p>${E(item.input?.command||item.input?.action||'Consulta directa')}</p><small>${item.mode==='natural'?'Orden interpretada por IA':'Consulta directa sin IA'}</small><p>${E(item.output?.text||'Pendiente de resultado registrado.')}</p><button class="text-button" type="button" data-gocho-show="${E(item.id)}" ${disabled}>Ver esta respuesta</button></article>`).join(''):'<p>Todavía no hay consultas guardadas.</p>';
 return `<h1>IA Gocho IA</h1><p>Tu mensaje en el cuadro oscuro. Mi respuesta en la ventana azul.</p>
  ${!status?.available?`<p class="warning">${E(status?.reason||'La IA no está disponible. Puedes usar las consultas rápidas.')}</p>`:''}
  ${quota}
  <section class="gocho-workspace" aria-label="Mensajes y respuestas del asistente">
  <form class="card server-form gocho-compose" data-gocho-chat><h2>Tu mensaje</h2><label class="field-label">Escribe aquí lo que necesitas<textarea name="command" maxlength="1000" rows="2" required placeholder="Pregúntame algo o consulta tu agenda">${E(command)}</textarea></label><button class="button full" ${busy||!canSend?'disabled':''}>${busy?'Consultando…':'Enviar'}</button><small>Enter envía · Shift + Enter añade una línea. La orden y hasta tres órdenes anteriores de esta conversación se envían a OpenAI; no pegues claves ni contraseñas.</small><button class="text-button" type="button" data-gocho-new ${disabled}>Nueva conversación</button></form>
  ${responseContent(latest)}
  </section>
  <section class="gocho-quick"><p>Consultas rápidas · sin IA</p><div class="library-actions">${[['agenda','Agenda de hoy'],['gastos','Gastos de esta semana'],['weekend_off','Fin de semana libre']].map(([action,label])=>`<button class="button secondary" type="button" data-gocho-quick="${action}" ${disabled}>${label}</button>`).join('')}</div></section>
  ${details('options','Más opciones',options)}${details('history','Ver historial',records)}`;
}
export function installGochoUI(callback){
 render=callback;const app=document.querySelector('#app');
 function focusResponse(){if(location.hash!=='#gocho')return;const target=document.querySelector(feedback?'[role="alert"]':'[data-gocho-response]');target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(!feedback)target?.focus({preventScroll:true});}
 async function operation(fn,label='Consultando datos reales…'){
  if(busy)return;const user=state.user?.id;busy=true;feedback='';progress=label;render();
  try{const result=await fn();if(user!==state.user?.id)return;if(result?.request)latest=result.request;history=(await request('/api/admin/gocho/history')).requests;}
  catch(err){if(user===state.user?.id)feedback=err.message;}
  finally{if(user===state.user?.id){try{const updated=await request('/api/admin/gocho/status',{timeoutMs:3000});if(user!==state.user?.id)return;status=updated;}catch{/* Keep the result/error visible if quota refresh fails. */}busy=false;progress='';render();focusResponse();}}
 }
 async function submit(body){const key=JSON.stringify(body);if(!pending||pending.key!==key)pending={key,id:newRequestId()};const result=await request('/api/admin/gocho/request',{method:'POST',body:{...body,idempotencyKey:pending.id},timeoutMs:30000});if(result.request.status!=='pending')pending=null;return result;}
 app.addEventListener('toggle',event=>{const node=event.target;if(!node.matches('[data-gocho-details]')||!node.isConnected)return;if(node.open)openDetails.add(node.dataset.gochoDetails);else openDetails.delete(node.dataset.gochoDetails);},true);
 app.addEventListener('input',event=>{if(event.target.matches('[data-gocho-start]'))startDate=event.target.value;if(event.target.matches('[data-gocho-end]'))endDate=event.target.value;if(event.target.matches('[data-gocho-chat] textarea'))command=event.target.value;});
 app.addEventListener('keydown',event=>{
  if(!event.target.matches('[data-gocho-chat] textarea')||event.key!=='Enter'||event.shiftKey||event.isComposing)return;
  event.preventDefault();if(!busy)event.target.closest('form').requestSubmit();
 });
 app.addEventListener('submit',event=>{
  if(!event.target.matches('[data-gocho-chat]'))return;event.preventDefault();if(busy||!status?.available||status.remaining===0)return;
  const draft=String(new FormData(event.target).get('command')||'').trim(),user=state.user?.id;
  if(!draft){feedback='Escribe primero lo que necesitas.';render();return;}
  command='';
  void operation(async()=>{try{return await submit({mode:'natural',command:draft,threadId});}catch(err){if(user===state.user?.id&&!command)command=draft;throw err;}},'Consultando IA Gocho IA… No se aplican cambios sin confirmación.');
 });
 app.addEventListener('click',event=>{
  if(busy)return;
  if(event.target.closest('[data-gocho-new]')){threadId=newRequestId();command='';feedback='';latest=null;pending=null;render();document.querySelector('[data-gocho-chat] textarea')?.focus();return;}
  const quick=event.target.closest('[data-gocho-quick]'),direct=event.target.closest('[data-gocho-direct]'),confirm=event.target.closest('[data-gocho-confirm]'),show=event.target.closest('[data-gocho-show]');
  if(quick)void operation(()=>submit({mode:'direct',action:quick.dataset.gochoQuick,startDate:null,endDateExclusive:null}));
  if(direct)void operation(()=>submit({mode:'direct',action:direct.dataset.gochoDirect,startDate:startDate||null,endDateExclusive:endDate||null}));
  if(confirm)void operation(async()=>{const result=await request('/api/admin/gocho/'+confirm.dataset.gochoConfirm+'/confirm',{method:'POST',body:{confirm:true}});await refresh();return result;},'Revisando y guardando la acción que confirmaste…');
  if(show){latest=history.find(item=>item.id===show.dataset.gochoShow)||null;feedback='';render();focusResponse();}
  if(event.target.closest('[data-gocho-reload]')){status=null;feedback='';void load();render();}
 });
}
