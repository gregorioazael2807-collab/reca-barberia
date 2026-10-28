import {Temporal} from '@js-temporal/polyfill';
import {randomUUID} from 'node:crypto';
import {error,text} from './security.js';
import {offerData} from './content.js';
import {prepareGochoOffer,offerServices} from './gocho-offers.js';
import {localDate,localInstants,scheduleTransaction,uuid,expire} from './bookings.js';
const actions=['agenda','gastos','finanzas','weekend_off','create_offer','datetime','help'];
const money=value=>{const n=Number(value||0);if(!Number.isSafeInteger(n))throw error(500,'Total fuera de rango.');return n;};
export function guardGochoIntent(intent,command){
 // Opening availability is not authorization to close an entire weekend.
 const opening=/\b(?:abre|abrir|abras|abra|open)\b/i.test(command),availability=/\b(?:vacante|horario|espacio|hueco|slot|availability)\b/i.test(command);
 if(opening&&(intent.action==='weekend_off'||intent.action==='help'&&availability))return {action:'help',openingRequested:true};
 return intent;
}
const usd=cents=>new Intl.NumberFormat('es-US',{style:'currency',currency:'USD'}).format(cents/100);
const serial=row=>({id:row.id,mode:row.mode,input:row.input,status:row.status,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at?.toISOString()||null,output:row.output});
function midnight(date,zone){const instants=localInstants(date,'00:00',zone);if(instants.length!==1)throw error(400,'Fecha ambigua o inexistente.');return instants[0];}
export function gochoRange(intent,zone,now){
 if(!zone)throw error(409,'Configura primero la zona horaria de la barbería.');
 const today=Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate();let start,end;
 if(intent.startDate!=null||intent.endDateExclusive!=null){if(!intent.startDate||!intent.endDateExclusive)throw error(400,'Indica ambas fechas.');start=localDate(intent.startDate);end=localDate(intent.endDateExclusive);}
 else if(intent.action==='agenda'){start=today;end=today.add({days:1});}
 else if(intent.action==='weekend_off'){start=today.add({days:today.dayOfWeek===7?-1:(6-today.dayOfWeek+7)%7});end=start.add({days:2});}
 else{start=today.subtract({days:today.dayOfWeek-1});end=start.add({days:7});}
 const days=start.until(end).days;if(days<1||days>31)throw error(400,'Consulta periodos de 1 a 31 días.');
 if(intent.action==='weekend_off'&&(start.dayOfWeek!==6||days!==2||Temporal.PlainDate.compare(end,today)<=0||start.until(today.add({days:90})).days<0))throw error(400,'Elige un sábado y domingo futuros, dentro de los próximos 90 días.');
 return {startDate:start.toString(),endDateExclusive:end.toString(),timezone:zone,from:midnight(start.toString(),zone),until:midnight(end.toString(),zone)};
}
async function conflicts(db,from,until){return (await db.query("SELECT id,kind,status,starts_at,ends_at FROM calendar_entries WHERE status IN ('held','confirmed','completed','blocked') AND starts_at<$2 AND ends_at>$1 ORDER BY starts_at",[new Date(from),new Date(until)])).rows;}
async function executeRead(db,intent,now){
 if(!actions.includes(intent.action))throw error(400,'Esa función todavía no está habilitada.');
 if(intent.action==='help'&&intent.openingRequested)return {text:'Pedir abrir una vacante no significa cerrar el fin de semana. No hice cambios. Para comprobar un horario disponible, revisa Agenda o los horarios de reserva. La IA todavía no puede retirar bloqueos ni mover citas para abrir ese espacio.'};
 if(intent.action==='datetime'){
  const timezone=(await db.query('SELECT data FROM settings')).rows[0].data.timezone;
  if(!timezone)throw error(409,'Configura primero la zona horaria de la barbería.');
  return {action:'datetime',timezone,asOf:new Date(now).toISOString(),text:`Fecha y hora de la barbería: ${new Intl.DateTimeFormat('es-US',{timeZone:timezone,dateStyle:'full',timeStyle:'long'}).format(new Date(now))} (${timezone}).`};
 }
 if(intent.action==='help'&&typeof intent.answer==='string'&&intent.answer.trim())return {text:text(intent.answer,4000)};
 if(intent.action==='help')return {text:'Puedo consultar agenda, gastos e ingresos, preparar un fin de semana libre y crear ofertas. Para una oferta, escribe porcentaje, servicios y fechas en una misma orden. Los cambios requieren confirmación. Otras funciones todavía no están habilitadas.'};
 if(intent.action==='create_offer'&&(!intent.startDate||!intent.endDateExclusive||!intent.offer||intent.offer.percent==null||!intent.offer.serviceIds?.length))return {needsInput:true,text:'Para preparar la oferta necesito porcentaje, servicios (caballeros, niños o ambos) y fechas. Escribe la orden completa, por ejemplo: «Prepara 10% de descuento para caballeros desde hoy hasta el domingo». No se ha publicado nada.'};
 const settings=(await db.query('SELECT data FROM settings')).rows[0].data,range=gochoRange(intent,settings.timezone,now);
 if(intent.action==='create_offer')return prepareGochoOffer(db,intent,range,now);
 if(intent.action==='gastos'||intent.action==='finanzas'){
  const rows=(await db.query("SELECT kind,category,sum(amount_cents) AS amount,count(*)::int AS count FROM finance_entries WHERE local_date>=$1 AND local_date<$2 AND voided_at IS NULL GROUP BY kind,category ORDER BY kind,category",[range.startDate,range.endDateExclusive])).rows;
  const entries=rows.filter(r=>intent.action==='finanzas'||r.kind==='expense'),incomeCents=money(entries.filter(r=>r.kind==='income').reduce((s,r)=>s+money(r.amount),0)),expenseCents=money(entries.filter(r=>r.kind==='expense').reduce((s,r)=>s+money(r.amount),0));
  return {...range,action:intent.action,text:`Registros del ${range.startDate} hasta antes del ${range.endDateExclusive}: gastos pagados ${usd(expenseCents)}${intent.action==='finanzas'?`, cobros recibidos ${usd(incomeCents)}`:''}. Solo movimientos registrados y no anulados; no se infieren pagos de citas atendidas.`,incomeCents,expenseCents,categories:entries.slice(0,30).map(r=>({kind:r.kind,category:r.category,amountCents:money(r.amount),count:r.count})),categoryCount:entries.length};
 }
 await expire(db,now);
 const from=intent.action==='weekend_off'?Math.max(range.from,Math.ceil((now+60000)/60000)*60000):range.from;
 if(from>=range.until)throw error(400,'No queda un periodo futuro para bloquear en este fin de semana. Elige otras fechas.');
 const rows=await conflicts(db,from,range.until);
 const entries=rows.slice(0,100).map(r=>({id:r.id,kind:r.kind,status:r.status,start:r.starts_at.toISOString(),end:r.ends_at.toISOString()}));
 if(intent.action==='agenda')return {...range,action:'agenda',text:`Agenda del ${range.startDate} hasta antes del ${range.endDateExclusive}: ${rows.length} intervalos ocupados. Se muestran como máximo 100; sin datos personales de clientes.`,entries,count:rows.length};
 return {...range,from,until:range.until,action:'weekend_off',conflicts:entries,conflictCount:rows.length,canConfirm:rows.length===0,text:rows.length?`Hay ${rows.length} intervalos ocupados. No voy a moverlos ni cancelarlos. Resuélvelos en Agenda y pide una propuesta nueva.`:`Propuesta: bloquear del ${new Intl.DateTimeFormat('es-US',{timeZone:range.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(from))} al ${new Intl.DateTimeFormat('es-US',{timeZone:range.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(range.until))} (hora de la barbería: ${range.timezone}). ${from>range.from?'Solo el tiempo restante del fin de semana. ':''}No cambia los horarios semanales ni cancela citas. Requiere tu confirmación.`};
}
export function installGocho(app,pool,{owner,wrap,limiter,clock,provider={available:false,reason:'OpenAI pendiente de configuración.'}}){
 app.get('/api/admin/gocho/status',owner,wrap(async(req,res)=>{
  const start=new Date(clock());start.setUTCHours(0,0,0);const reset=new Date(start.getTime()+86400000),limit=provider.dailyLimit??10;
  const used=(await pool.query("SELECT count(*)::int AS count FROM gocho_requests WHERE user_id=$1 AND mode='natural' AND created_at>=$2",[req.user.id,start])).rows[0].count;
  res.json({name:'IA Gocho IA',available:provider.available,reason:provider.reason||null,model:provider.model||null,dailyLimit:limit,used,unlimited:limit===0,remaining:limit===0?null:Math.max(0,limit-used),resetAt:limit===0?null:reset.toISOString()});
 }));
 app.get('/api/admin/gocho/history',owner,wrap(async(req,res)=>{
  await pool.query("UPDATE gocho_requests SET status='failed',output=$3 WHERE user_id=$1 AND status='pending' AND created_at<$2",[req.user.id,new Date(clock()-120000),JSON.stringify({text:'La consulta se interrumpió o caducó. No se aplicó ningún bloqueo. Pide una nueva consulta.'})]);
  res.json({requests:(await pool.query('SELECT * FROM gocho_requests WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 25',[req.user.id])).rows.map(serial)});
 }));
 app.post('/api/admin/gocho/request',owner,limiter,wrap(async(req,res)=>{
  const id=uuid(req.body.idempotencyKey),mode=req.body.mode;if(!['direct','natural'].includes(mode))throw error(400,'Modo inválido.');
  const input=mode==='natural'?{command:text(req.body.command,1000)}:{action:req.body.action,startDate:req.body.startDate??null,endDateExclusive:req.body.endDateExclusive??null};
  if(mode==='natural'&&req.body.threadId!==undefined)input.threadId=uuid(req.body.threadId);
  if(mode==='natural'&&(/sk-[A-Za-z0-9_-]{16,}/.test(input.command)||/(contrase[nñ]a|password)\s*[:=]/i.test(input.command)))throw error(400,'No pegues claves ni contraseñas en el asistente.');
  if(mode==='direct'&&!actions.includes(input.action))throw error(400,'Función no disponible.');
  const now=clock();
  const existing=await scheduleTransaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM gocho_requests WHERE id=$1',[id])).rows[0];if(row){
    if(row.user_id!==req.user.id||row.mode!==mode||Object.keys({...row.input,...input}).some(k=>row.input[k]!==input[k]))throw error(409,'La solicitud ya existe con otros datos.');return row;
   }
   if(mode==='natural'){
    if(!provider.available)throw error(503,provider.reason||'IA no configurada.');
    const day=new Date(now);day.setUTCHours(0,0,0);const count=(await db.query("SELECT count(*)::int AS count FROM gocho_requests WHERE user_id=$1 AND mode='natural' AND created_at>=$2",[req.user.id,day])).rows[0].count;
    if((provider.dailyLimit??10)>0&&count>=(provider.dailyLimit??10))throw error(429,'Límite diario de consultas de IA alcanzado. No se contactó a OpenAI.');
   }
   await db.query("INSERT INTO gocho_requests(id,user_id,mode,input,status,created_at) VALUES($1,$2,$3,$4,'pending',$5)",[id,req.user.id,mode,JSON.stringify(input),new Date(now)]);return null;
  });
  if(existing)return res.status(existing.status==='pending'?202:200).json({request:serial(existing)});
  try{
   let intent=input;
   if(mode==='natural'){
    const zone=(await pool.query('SELECT data FROM settings')).rows[0].data.timezone;
    const previous=input.threadId?(await pool.query("SELECT input->>'command' AS command FROM gocho_requests WHERE user_id=$1 AND mode='natural' AND input->>'threadId'=$2 AND id<>$3 AND status IN ('done','proposed','applied') AND created_at>=$4 ORDER BY created_at DESC,id DESC LIMIT 3",[req.user.id,input.threadId,id,new Date(now-30*60000)])).rows.reverse().map(r=>r.command):[];
    intent=await provider.classify(input.command,{today:zone?Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate().toString():null,timezone:zone||null,...(input.threadId?{previousOrders:previous}:{})});
    if(!intent||typeof intent!=='object'||Object.keys(intent).some(k=>!['action','answer','startDate','endDateExclusive','offer'].includes(k)))throw error(400,'Respuesta de IA no válida.');
    if(intent.answer!=null&&(typeof intent.answer!=='string'||intent.answer.length>4000))throw error(400,'Respuesta de IA no válida.');
    intent=guardGochoIntent(intent,input.command);
   }
   const output=await scheduleTransaction(pool,db=>executeRead(db,intent,clock()));
   const status=['weekend_off','create_offer'].includes(output.action)?'proposed':'done',expires=status==='proposed'?new Date(clock()+15*60000):null;
   const saved=(await pool.query("UPDATE gocho_requests SET status=$2,output=$3,expires_at=$4 WHERE id=$1 AND status='pending' RETURNING *",[id,status,JSON.stringify(output),expires])).rows[0];
   const row=saved||(await pool.query('SELECT * FROM gocho_requests WHERE id=$1',[id])).rows[0];res.json({request:serial(row)});
  }catch(err){await pool.query("UPDATE gocho_requests SET status='failed',output=$2 WHERE id=$1",[id,JSON.stringify({text:err.status?err.message:'No se pudo completar la consulta. No se aplicaron cambios.'})]);throw err;}
 }));
 app.post('/api/admin/gocho/:id/confirm',owner,wrap(async(req,res)=>{
  uuid(req.params.id);if(req.body.confirm!==true)throw error(400,'Confirma expresamente la acción propuesta.');
  const result=await scheduleTransaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM gocho_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!row)throw error(404,'Propuesta no encontrada.');if(row.status==='applied')return serial(row);
   const now=clock(),plan=row.output,settings=(await db.query('SELECT data FROM settings')).rows[0].data;
   if(row.status!=='proposed'||!['weekend_off','create_offer'].includes(plan?.action)||!plan?.canConfirm||row.expires_at.getTime()<=now||plan.timezone!==settings.timezone)throw error(409,'La propuesta ya no es válida. Pide una nueva.');
   if(plan.action==='create_offer'){
    const data=offerData(plan.offer),services=await offerServices(db,data.serviceIds);
    if(plan.until<=now||services.length!==plan.services.length||services.some((s,i)=>s.id!==plan.services[i].id||s.priceCents!==plan.services[i].priceCents||s.name.es!==plan.services[i].name.es||s.name.en!==plan.services[i].name.en))throw error(409,'La vigencia o los servicios cambiaron. Pide una oferta nueva.');
    const offerId=randomUUID();await db.query('INSERT INTO offers(id,data,starts_at,ends_at,active) VALUES($1,$2,$3,$4,true)',[offerId,JSON.stringify(data),new Date(Math.max(plan.from,now)),new Date(plan.until)]);
    const output={...plan,offerId,text:'Oferta guardada. Aparece en la app de clientes durante su vigencia. No se modificaron los precios de citas ya confirmadas.'};
    return serial((await db.query("UPDATE gocho_requests SET status='applied',output=$2,confirmed_at=$3 WHERE id=$1 RETURNING *",[row.id,JSON.stringify(output),new Date(now)])).rows[0]);
   }
   if(plan.from<=now)throw error(409,'La propuesta ya no es válida. Pide una nueva.');
   await expire(db,now);if((await conflicts(db,plan.from,plan.until)).length)throw error(409,'La agenda cambió. No se aplicó el bloqueo; revisa y pide otra propuesta.');
   const blockId=randomUUID();await db.query("INSERT INTO calendar_entries(id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,'block','blocked',$2,$3,$3,$4)",[blockId,new Date(plan.from),new Date(plan.until),JSON.stringify({reason:'Fin de semana libre · IA Gocho IA',gochoRequestId:row.id})]);
   const output={...plan,blockId,text:'Bloqueo guardado en Agenda. No se cancelaron ni movieron citas. Puedes retirarlo desde Agenda.'};
   return serial((await db.query("UPDATE gocho_requests SET status='applied',output=$2,confirmed_at=$3 WHERE id=$1 RETURNING *",[row.id,JSON.stringify(output),new Date(now)])).rows[0]);
  });res.json({request:result});
 }));
}
