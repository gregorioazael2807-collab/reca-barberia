import {pendingBookingIncome} from './booking-income.js';
import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { error, text } from './security.js';
import { enqueueNotification, invalidateNotifications } from './automation.js';
import {awardReferral,applyReferralReward,releaseReferralReward} from './referrals.js';
import {applyOffer} from './content.js';

const occupied = ['held','confirmed','completed','blocked'];
const MINUTE = 60000;
export const HOLD_MINUTES = 10;
export const HORIZON_DAYS = 90;
export const SLOT_STEP_MINUTES = 15;
export function uuid(value) {
  if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw error(400,'Identificador inválido.');
  return value;
}
export function instant(value) {
  if(typeof value!=='string'||value.length>40||!/(Z|[+-]\d\d:\d\d)$/.test(value)) throw error(400,'La fecha debe incluir zona horaria.');
  try {return Number(Temporal.Instant.from(value).epochMilliseconds);} catch {throw error(400,'Fecha inválida.');}
}
export function localDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw error(400,'Fecha inválida.');
  try {return Temporal.PlainDate.from(value);} catch {throw error(400,'Fecha inválida.');}
}
// Return both occurrences of a repeated wall-clock time; omit nonexistent spring-forward times.
export function localInstants(date,time,timezone) {
  const plain=Temporal.PlainDateTime.from(`${date}T${time}`);
  const fields={timeZone:timezone,year:plain.year,month:plain.month,day:plain.day,hour:plain.hour,minute:plain.minute};
  const candidates=['earlier','later'].map(disambiguation=>Temporal.ZonedDateTime.from(fields,{disambiguation}));
  return [...new Set(candidates.filter(z=>z.toPlainDateTime().equals(plain)).map(z=>Number(z.epochMilliseconds)))];
}
export function bookingReadiness(settings,service) {
  if(!settings.timezone || !settings.city || !Number.isInteger(settings.cancellationNoticeMinutes) || !Number.isInteger(settings.bookingNoticeMinutes)) return 'El dueño debe completar ubicación y reglas de reserva.';
  if(!service?.active || !Number.isInteger(service.priceCents)) return 'El dueño debe completar el precio del servicio.';
  if(!Number.isInteger(settings.bookingSpacingMinutes)||settings.bookingSpacingMinutes<60) return 'El dueño debe definir al menos una hora entre reservas.';
  if(!settings.weekly.some(d=>!d.closed&&d.intervals.length)) return 'El dueño debe activar sus horarios de atención.';
  return null;
}
export function candidates(settings,service,date,now) {
  const plain=localDate(date);
  const today=Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(settings.timezone).toPlainDate();
  if(Temporal.PlainDate.compare(plain,today)<0 || Temporal.PlainDate.compare(plain,today.add({days:HORIZON_DAYS}))>0) throw error(400,`Elige una fecha entre hoy y los próximos ${HORIZON_DAYS} días.`);
  const day=settings.weekly[plain.dayOfWeek%7];
  if(day.closed) return [];
  const result=[];
  for(const [from,to] of day.intervals) {
    const openings=localInstants(date,from,settings.timezone),closings=localInstants(date,to,settings.timezone);
    if(!openings.length || !closings.length) continue;
    const startLimit=Math.min(...openings),endLimit=Math.max(...closings);
    const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
    for(let m=minutes(from);m<minutes(to);m+=SLOT_STEP_MINUTES) {
      const time=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      for(const start of localInstants(date,time,settings.timezone)) {
        // Calendar occupancy, not an estimate of haircut duration.
        const end=start+settings.bookingSpacingMinutes*MINUTE,serviceEnd=end;
        if(start>=startLimit && start>now && start>=now+settings.bookingNoticeMinutes*MINUTE && end<=endLimit) result.push({start:new Date(start).toISOString(),serviceEnd:new Date(serviceEnd).toISOString(),end:new Date(end).toISOString()});
      }
    }
  }
  return result.sort((a,b)=>a.start.localeCompare(b.start));
}
export async function scheduleTransaction(pool,fn) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    // Serialize calendar operations and configuration changes for the single barber.
    await db.query('SELECT pg_advisory_xact_lock(731204)');
    const result=await fn(db);await db.query('COMMIT');return result;
  } catch(err) {await db.query('ROLLBACK');throw err;} finally {db.release();}
}
export async function expire(db,now) {
  await db.query("UPDATE calendar_entries SET status='expired',updated_at=$1 WHERE status='held' AND expires_at<=$1",[new Date(now)]);
}
async function configuration(db,id) {
  if(!['men','kids'].includes(id)) throw error(400,'Servicio inválido.');
  const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
  const service=(await db.query('SELECT data FROM services WHERE id=$1',[id])).rows[0]?.data;
  return {settings,service};
}
function serial(row) {
  return {id:row.id,kind:row.kind,status:row.status,start:row.starts_at.toISOString(),serviceEnd:row.service_ends_at.toISOString(),end:row.ends_at.toISOString(),expiresAt:row.expires_at?.toISOString()??null,arrivedAt:row.arrived_at?.toISOString()??null,receivedAmountCents:row.arrival_amount_cents??null,snapshot:row.snapshot};
}
export async function freeSlots(db,settings,service,date,now,exclude=null) {
  const slots=candidates(settings,service,date,now);
  if(!slots.length) return [];
  const busy=(await db.query('SELECT starts_at,ends_at FROM calendar_entries WHERE status=ANY($1) AND ($2::uuid IS NULL OR id<>$2) AND starts_at<$3 AND ends_at>$4',[occupied,exclude,slots.at(-1).end,slots[0].start])).rows;
  return slots.filter(s=>!busy.some(b=>Date.parse(s.start)<b.ends_at.getTime()&&Date.parse(s.end)>b.starts_at.getTime()));
}
async function chosenSlot(db,body,now,exclude=null) {
  const {settings,service}=await configuration(db,body.serviceId);
  const reason=bookingReadiness(settings,service);if(reason) throw error(409,reason);
  const start=instant(body.start);
  const date=Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(settings.timezone).toPlainDate().toString();
  const slots=await freeSlots(db,settings,service,date,now,exclude);
  const slot=slots.find(s=>Date.parse(s.start)===start);
  if(!slot) throw error(409,'Ese horario ya no está disponible. Elige otro.');
  return {settings,service,slot};
}
async function reference(db,id,serviceId) {
  if(id==null) return null;
  const row=(await db.query('SELECT data FROM gallery WHERE id=$1 AND active=true',[text(id,100)])).rows[0];
  if(!row || row.data.audience!==serviceId) throw error(400,'La referencia no está disponible para este servicio.');
  return row.data;
}
async function ownEntry(db,id,user) {
  uuid(id);
  const row=(await db.query('SELECT * FROM calendar_entries WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row || row.kind!=='booking' || (user.role!=='owner'&&row.user_id!==user.id)) throw error(404,'Cita no encontrada.');
  return row;
}
function cutoff(row,user,now) {
  if(user.role!=='owner' && row.starts_at.getTime()-now<row.snapshot.cancellationNoticeMinutes*MINUTE) throw error(409,`Debes cancelar o cambiar la cita al menos ${row.snapshot.cancellationNoticeMinutes/60} horas antes.`);
}
export function installBookings(app,pool,{auth,owner,wrap,clock=()=>Date.now(),referralOptions={}}) {
  const tx=fn=>scheduleTransaction(pool,async db=>{const now=clock();await expire(db,now);return fn(db,now);});
  app.get('/api/availability',auth,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      let {settings,service}=await configuration(db,req.query.serviceId);
      let exclude=null;
      if(req.query.rescheduleId) {
        if(!req.user)throw error(401,'Inicia sesión.');
        const original=await ownEntry(db,req.query.rescheduleId,req.user);
        if(original.status!=='confirmed')throw error(409,'Solo se pueden cambiar citas confirmadas.');
        cutoff(original,req.user,now);
        service=original.snapshot.service;exclude=original.id;
        settings={...settings,cancellationNoticeMinutes:original.snapshot.cancellationNoticeMinutes,bookingSpacingMinutes:original.snapshot.bookingSpacingMinutes??settings.bookingSpacingMinutes};
      }
      const date=localDate(req.query.date).toString();
      const reason=bookingReadiness(settings,service);
      return {date,timezone:settings.timezone,ready:!reason,reason,serverNow:new Date(now).toISOString(),holdMinutes:HOLD_MINUTES,slots:reason?[]:await freeSlots(db,settings,service,date,now,exclude)};
    });res.json(result);
  }));
  app.get('/api/bookings',auth,wrap(async(req,res)=>{
    const rows=await tx(async db=>(await db.query("SELECT * FROM calendar_entries WHERE user_id=$1 AND kind='booking' AND status NOT IN ('held','expired','cancelled') ORDER BY starts_at DESC",[req.user.id])).rows);
    res.json({bookings:rows.map(serial)});
  }));
  app.get('/api/holds',auth,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>({serverNow:new Date(now).toISOString(),hold:(await db.query("SELECT * FROM calendar_entries WHERE user_id=$1 AND status='held' ORDER BY created_at DESC LIMIT 1",[req.user.id])).rows.map(serial)[0]??null}));
    res.json(result);
  }));
  app.post('/api/holds',auth,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      // One active hold per account; switching selections is atomic.
      await db.query("UPDATE calendar_entries SET status='cancelled',updated_at=$2 WHERE user_id=$1 AND status='held'",[req.user.id,new Date(now)]);
      const {settings,service,slot}=await chosenSlot(db,req.body,now);
      const cut=await reference(db,req.body.referenceId,service.id);
      const snapshot={service,reference:cut,timezone:settings.timezone,city:settings.city,cancellationNoticeMinutes:settings.cancellationNoticeMinutes,bookingSpacingMinutes:settings.bookingSpacingMinutes};
      const row=(await db.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,expires_at,snapshot) VALUES($1,$2,'booking','held',$3,$4,$5,$6,$7) RETURNING *",[randomUUID(),req.user.id,slot.start,slot.serviceEnd,slot.end,new Date(now+HOLD_MINUTES*MINUTE),JSON.stringify(snapshot)])).rows[0];
      return {...serial(row),serverNow:new Date(now).toISOString()};
    });res.status(201).json(result);
  }));
  app.delete('/api/holds/:id',auth,wrap(async(req,res)=>{
    await tx(async(db,now)=>{const row=await ownEntry(db,req.params.id,req.user);if(row.status==='held')await db.query("UPDATE calendar_entries SET status='cancelled',updated_at=$2 WHERE id=$1",[row.id,new Date(now)]);});res.json({ok:true});
  }));
  app.post('/api/holds/:id/confirm',auth,wrap(async(req,res)=>{
    // Commit expiration even when reporting an expired hold.
    const result=await tx(async(db,now)=>{
      const row=await ownEntry(db,req.params.id,req.user);
      if(row.status==='confirmed')return serial(row); // Retrying confirmation cannot duplicate a booking.
      if(row.status!=='held'||row.expires_at.getTime()<=now||row.starts_at.getTime()<=now)return null;
      if(req.body.useReferralReward!==undefined&&typeof req.body.useReferralReward!=='boolean')throw error(400,'Selección de descuento inválida.');
      if(req.body.offerId!=null&&typeof req.body.offerId!=='string')throw error(400,'Oferta inválida.');
      if(req.body.offerId&&req.body.useReferralReward)throw error(400,'No se acumulan ofertas y descuentos por recomendación.');
      const snapshot=req.body.offerId?await applyOffer(db,row,req.body.offerId,now):req.body.useReferralReward?await applyReferralReward(db,row,now,referralOptions):row.snapshot;
      const confirmed=(await db.query("UPDATE calendar_entries SET status='confirmed',snapshot=$3,notification_revision=notification_revision+1,updated_at=$2 WHERE id=$1 RETURNING *",[row.id,new Date(now),JSON.stringify(snapshot)])).rows[0];
      await enqueueNotification(db,confirmed,'confirmed',app.locals.origin,now);
      return serial(confirmed);
    });if(!result)throw error(409,'La retención caducó. Selecciona otro horario.');res.json(result);
  }));
  app.post('/api/bookings/:id/cancel',auth,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      const row=await ownEntry(db,req.params.id,req.user);
      if(row.status==='cancelled')return serial(row);
      if(row.status!=='confirmed')throw error(409,'Esta cita no se puede cancelar.');
      if(row.arrived_at)throw error(409,'La llegada y el cobro ya están confirmados. Revisa cualquier corrección con el dueño; el ingreso no se elimina al cancelar.');
      cutoff(row,req.user,now);
      const cancelled=(await db.query("UPDATE calendar_entries SET status='cancelled',notification_revision=notification_revision+1,updated_at=$2 WHERE id=$1 RETURNING *",[row.id,new Date(now)])).rows[0];
      await releaseReferralReward(db,row.id);
      await enqueueNotification(db,cancelled,'cancelled',app.locals.origin,now);
      return serial(cancelled);
    });res.json(result);
  }));
  app.patch('/api/bookings/:id/reschedule',auth,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      const row=await ownEntry(db,req.params.id,req.user);
      if(row.status!=='confirmed')throw error(409,'Solo se pueden cambiar citas confirmadas.');
      if(row.arrived_at)throw error(409,'La llegada y el cobro ya están confirmados. Esta cita no se puede cambiar.');
      cutoff(row,req.user,now);
      const {settings}=await configuration(db,row.snapshot.service.id);
      // Keep the agreed price and calendar spacing when configuration changes.
      const service=row.snapshot.service;
      const frozenSettings={...settings,cancellationNoticeMinutes:row.snapshot.cancellationNoticeMinutes,bookingSpacingMinutes:row.snapshot.bookingSpacingMinutes??settings.bookingSpacingMinutes};
      const reason=bookingReadiness(frozenSettings,service);if(reason)throw error(409,reason);
      const start=instant(req.body.start);
      const date=Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(settings.timezone).toPlainDate().toString();
      const frozenSlot=(await freeSlots(db,frozenSettings,service,date,now,row.id)).find(s=>Date.parse(s.start)===start);
      if(!frozenSlot)throw error(409,'La separación original de la agenda no cabe en ese horario.');
      if(row.starts_at.toISOString()===frozenSlot.start&&row.ends_at.toISOString()===frozenSlot.end)return serial(row);
      const snapshot={...row.snapshot,timezone:settings.timezone,city:settings.city};
      const changed=(await db.query('UPDATE calendar_entries SET starts_at=$2,service_ends_at=$3,ends_at=$4,snapshot=$5,notification_revision=notification_revision+1,updated_at=$6 WHERE id=$1 RETURNING *',[row.id,frozenSlot.start,frozenSlot.serviceEnd,frozenSlot.end,JSON.stringify(snapshot),new Date(now)])).rows[0];
      await enqueueNotification(db,changed,'rescheduled',app.locals.origin,now);
      return serial(changed);
    });res.json(result);
  }));
  app.get('/api/admin/calendar',owner,wrap(async(req,res)=>{
    const result=await tx(async db=>{
      const rows=(await db.query("SELECT c.*,u.name AS customer_name,u.email AS customer_email FROM calendar_entries c LEFT JOIN users u ON u.id=c.user_id WHERE c.status NOT IN ('expired','held','cancelled') ORDER BY c.starts_at DESC LIMIT 500")).rows;
      return {entries:rows.map(r=>({...serial(r),customer:r.kind==='booking'?{name:r.customer_name??'Cuenta eliminada',email:r.customer_email??''}:null})),pendingBookings:await pendingBookingIncome(db)};
    });res.json(result);
  }));
  app.post('/api/admin/bookings/:id/arrive',owner,wrap(async(req,res)=>{
    if(req.body.received!==true)throw error(400,'Confirma la llegada del cliente y que el importe fue recibido.');
    const result=await tx(async(db,now)=>{
      const row=await ownEntry(db,req.params.id,req.user);
      // A retry (even after completion or a financial correction) never charges again.
      if(row.arrived_at)return serial(row);
      if(row.status!=='confirmed')throw error(409,'Solo se puede confirmar la llegada de una cita confirmada.');
      const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
      const zone=settings.timezone;
      if(!zone)throw error(409,'Configura primero la zona horaria de la barbería.');
      const today=Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate().toString();
      const bookingDate=Temporal.Instant.fromEpochMilliseconds(row.starts_at.getTime()).toZonedDateTimeISO(zone).toPlainDate().toString();
      if(bookingDate!==today)throw error(409,'Confirma la llegada únicamente el día de la cita en la barbería.');
      const amount=row.snapshot.service.priceCents;
      if(!Number.isSafeInteger(amount)||amount<0)throw error(409,'La cita no tiene un importe acordado válido.');
      const previous=await db.query("SELECT id FROM finance_entries WHERE booking_id=$1 AND kind='income' AND voided_at IS NULL",[row.id]);
      if(previous.rowCount)throw error(409,'Esta cita ya tiene un cobro registrado. Revisa el movimiento en Finanzas antes de confirmar para no duplicarlo.');
      let entryId=null;
      if(amount>0){
        entryId=randomUUID();
        await db.query("INSERT INTO finance_entries(id,idempotency_key,kind,amount_cents,occurred_at,local_date,category,note,payment_method,booking_id) VALUES($1,$2,'income',$3,$4,$5,'Cortes','Cobro recibido al confirmar la llegada. Método de pago no especificado.','other',$6)",[entryId,randomUUID(),amount,new Date(now),today,row.id]);
      }
      const arrived=(await db.query('UPDATE calendar_entries SET arrived_at=$2,arrival_confirmed_by=$3,arrival_amount_cents=$4,arrival_finance_entry_id=$5,updated_at=$2 WHERE id=$1 RETURNING *',[row.id,new Date(now),req.user.id,amount,entryId])).rows[0];
      return serial(arrived);
    });res.json(result);
  }));
  app.post('/api/admin/bookings/:id/complete',owner,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      const row=await ownEntry(db,req.params.id,req.user);
      if(row.status==='completed')return serial(row);
      if(row.status!=='confirmed'||row.service_ends_at.getTime()>now)throw error(409,'Solo puedes marcar atendida una cita después de finalizar su turno de agenda.');
      const completed=(await db.query("UPDATE calendar_entries SET status='completed',notification_revision=notification_revision+1,updated_at=$2 WHERE id=$1 RETURNING *",[row.id,new Date(now)])).rows[0];
      await invalidateNotifications(db,row.id,now);
      await awardReferral(db,completed,now,referralOptions);
      return serial(completed);
    });res.json(result);
  }));
  app.post('/api/admin/blocks',owner,wrap(async(req,res)=>{
    const result=await tx(async(db,now)=>{
      const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
      const local=value=>{
        if(!settings.timezone || typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw error(400,'Fecha local o zona horaria inválida.');
        let values;try {values=localInstants(value.slice(0,10),value.slice(11),settings.timezone);} catch {throw error(400,'Fecha local inválida.');}
        if(values.length!==1)throw error(400,'La hora local no existe o es ambigua por el cambio de horario. Usa una hora distinta o una fecha con desplazamiento UTC.');
        return values[0];
      };
      const start=req.body.startLocal!==undefined?local(req.body.startLocal):instant(req.body.start),end=req.body.endLocal!==undefined?local(req.body.endLocal):instant(req.body.end);
      if(start<=now || end<=start || end-start>31*86400000)throw error(400,'El bloqueo debe ser futuro y durar como máximo 31 días.');
      const row=(await db.query("INSERT INTO calendar_entries(id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,'block','blocked',$2,$3,$3,$4) RETURNING *",[randomUUID(),new Date(start),new Date(end),JSON.stringify({reason:text(req.body.reason,200)})])).rows[0];return serial(row);
    });res.status(201).json(result);
  }));
  app.delete('/api/admin/blocks/:id',owner,wrap(async(req,res)=>{
    uuid(req.params.id);
    const result=await tx(async(db,now)=>db.query("UPDATE calendar_entries SET status='cancelled',updated_at=$2 WHERE id=$1 AND kind='block' RETURNING id",[req.params.id,new Date(now)]));
    if(!result.rowCount)throw error(404,'Bloqueo no encontrado.');res.json({ok:true});
  }));
}
