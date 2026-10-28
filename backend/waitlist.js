import {randomUUID} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {error} from './security.js';
import {bookingReadiness,freeSlots,localDate,scheduleTransaction,uuid} from './bookings.js';

function time(value){
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw error(400,'Hora inválida.');
  return value;
}
async function config(db,serviceId){
  if(!['men','kids'].includes(serviceId))throw error(400,'Servicio inválido.');
  const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
  const service=(await db.query('SELECT data FROM services WHERE id=$1',[serviceId])).rows[0]?.data;
  const reason=bookingReadiness(settings,service);if(reason)throw error(409,reason);
  return {settings,service};
}
async function matchingSlots(db,subscription,settings,service,now){
  const slots=await freeSlots(db,settings,service,subscription.local_date,now);
  return slots.filter(slot=>{
    const local=Temporal.Instant.from(slot.start).toZonedDateTimeISO(settings.timezone);
    const wall=`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`;
    return wall>=subscription.from_time&&wall<=subscription.to_time;
  });
}
function serial(row){
  return {id:row.id,serviceId:row.service_id,date:row.local_date,from:row.from_time,to:row.to_time,emailConsent:row.email_consent,whatsappConsent:row.whatsapp_consent,phone:row.phone};
}
// Called under the same calendar lock. Only newly available times produce drafts.
// Never contact a provider, reserve a time or report delivery here.
export async function refreshWaitlist(db,now,origin,userId=null){
  await db.query("UPDATE calendar_entries SET status='expired',updated_at=$1 WHERE status='held' AND expires_at<=$1",[new Date(now)]);
  const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
  if(!settings.timezone)return;
  const today=Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(settings.timezone).toPlainDate().toString();
  await db.query('DELETE FROM waitlist_subscriptions WHERE local_date<$1',[today]);
  const rows=(await db.query('SELECT w.*,u.name,u.email,s.data AS service FROM waitlist_subscriptions w JOIN users u ON u.id=w.user_id JOIN services s ON s.id=w.service_id WHERE ($1::uuid IS NULL OR w.user_id=$1) ORDER BY w.local_date,w.id FOR UPDATE OF w',[userId])).rows;
  for(const row of rows){
    const ready=!bookingReadiness(settings,row.service);
    const slots=ready?await matchingSlots(db,row,settings,row.service,now):[];
    const starts=slots.map(slot=>slot.start),previous=new Set(row.known_available);
    await db.query("UPDATE waitlist_notices SET status='cancelled' WHERE subscription_id=$1 AND status='prepared' AND NOT (starts_at=ANY($2::timestamptz[]))",[row.id,starts]);
    for(const slot of slots.filter(slot=>!previous.has(slot.start))){
      const when=new Intl.DateTimeFormat('es-US',{timeZone:settings.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(slot.start));
      const message=`${row.name.replace(/[\r\n]/g,' ')}, hay un horario disponible para ${row.service.name.es}: ${when} (${settings.timezone}).\nConsulta y reserva en ${origin}/#booking\nEste aviso no retiene ni garantiza la cita. La disponibilidad se comprueba de nuevo al reservar. Pago en el local.\nPuedes salir de la lista de espera desde Reservar.`;
      const draft={subject:'RECA Barbería · Horario disponible',email:row.email_consent?row.email:null,recipientPhone:row.whatsapp_consent?row.phone:null,emailText:row.email_consent?message:null,whatsappText:row.whatsapp_consent?message:null};
      await db.query('INSERT INTO waitlist_notices(id,subscription_id,starts_at,draft,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(subscription_id,starts_at) DO NOTHING',[randomUUID(),row.id,slot.start,JSON.stringify(draft),new Date(now)]);
    }
    await db.query('UPDATE waitlist_subscriptions SET known_available=$2 WHERE id=$1',[row.id,JSON.stringify(starts)]);
  }
}
export function installWaitlist(app,pool,{auth,owner,wrap,clock=()=>Date.now()}){
  const customer=(req,res,next)=>req.user?.role==='customer'?next():next(error(403,'La lista de espera es para clientes.'));
  app.get('/api/waitlist',auth,customer,wrap(async(req,res)=>{
    const result=await scheduleTransaction(pool,async db=>{
      await refreshWaitlist(db,clock(),app.locals.origin,req.user.id);
      const entries=(await db.query('SELECT * FROM waitlist_subscriptions WHERE user_id=$1 ORDER BY local_date,from_time',[req.user.id])).rows.map(serial);
      const notices=(await db.query("SELECT n.id,n.starts_at,w.service_id,w.local_date FROM waitlist_notices n JOIN waitlist_subscriptions w ON w.id=n.subscription_id WHERE w.user_id=$1 AND n.status='prepared' ORDER BY n.starts_at",[req.user.id])).rows.map(row=>({id:row.id,start:row.starts_at.toISOString(),serviceId:row.service_id,date:row.local_date}));
      return {mode:'draft-only',canSend:false,entries,notices};
    });res.json(result);
  }));
  app.post('/api/waitlist',auth,customer,wrap(async(req,res)=>{
    const value=req.body,date=localDate(value.date).toString(),from=time(value.from),to=time(value.to);
    if(from>to)throw error(400,'La hora final debe ser igual o posterior a la inicial.');
    if(typeof value.emailConsent!=='boolean'||typeof value.whatsappConsent!=='boolean'||(!value.emailConsent&&!value.whatsappConsent))throw error(400,'Selecciona al menos un canal de avisos.');
    const phone=value.whatsappConsent?value.phone:null;
    if(value.whatsappConsent&&(typeof phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(phone)))throw error(400,'Usa un teléfono internacional válido, por ejemplo +18135551234.');
    const result=await scheduleTransaction(pool,async db=>{
      const now=clock();await db.query("UPDATE calendar_entries SET status='expired' WHERE status='held' AND expires_at<=$1",[new Date(now)]);
      const {settings,service}=await config(db,value.serviceId);
      const existing=(await db.query('SELECT id FROM waitlist_subscriptions WHERE user_id=$1 AND service_id=$2 AND local_date=$3',[req.user.id,value.serviceId,date])).rows[0];
      if(!existing&&(await db.query('SELECT count(*)::int AS n FROM waitlist_subscriptions WHERE user_id=$1',[req.user.id])).rows[0].n>=5)throw error(409,'Puedes mantener como máximo cinco preferencias de espera.');
      const known=await matchingSlots(db,{local_date:date,from_time:from,to_time:to},settings,service,now);
      const row=(await db.query(`INSERT INTO waitlist_subscriptions(id,user_id,service_id,local_date,from_time,to_time,email_consent,whatsapp_consent,phone,consent_at,known_available)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(user_id,service_id,local_date) DO UPDATE SET from_time=EXCLUDED.from_time,to_time=EXCLUDED.to_time,email_consent=EXCLUDED.email_consent,whatsapp_consent=EXCLUDED.whatsapp_consent,phone=EXCLUDED.phone,consent_at=EXCLUDED.consent_at,known_available=EXCLUDED.known_available RETURNING *`,[existing?.id||randomUUID(),req.user.id,value.serviceId,date,from,to,value.emailConsent,value.whatsappConsent,phone,new Date(now),JSON.stringify(known.map(slot=>slot.start))])).rows[0];
      // Editing consent invalidates any prior drafts, including their old phone/email.
      await db.query('DELETE FROM waitlist_notices WHERE subscription_id=$1',[row.id]);
      return serial(row);
    });res.status(201).json({entry:result,sent:false});
  }));
  app.delete('/api/waitlist/:id',auth,customer,wrap(async(req,res)=>{
    uuid(req.params.id);
    await scheduleTransaction(pool,db=>db.query('DELETE FROM waitlist_subscriptions WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]));
    res.json({ok:true});
  }));
  app.get('/api/admin/waitlist',owner,wrap(async(req,res)=>{
    const result=await scheduleTransaction(pool,async db=>{
      await refreshWaitlist(db,clock(),app.locals.origin);
      const entries=(await db.query('SELECT w.*,u.name FROM waitlist_subscriptions w JOIN users u ON u.id=w.user_id ORDER BY local_date')).rows.map(row=>({...serial(row),name:row.name}));
      const notices=(await db.query('SELECT id,status,draft,starts_at FROM waitlist_notices ORDER BY created_at DESC LIMIT 20')).rows;
      return {mode:'draft-only',canSend:false,entries,notices};
    });res.json(result);
  }));
}
