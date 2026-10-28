import {pendingBookingIncome} from './booking-income.js';
import {Temporal} from '@js-temporal/polyfill';
import {randomUUID} from 'node:crypto';
import {error,number,text} from './security.js';
import {localDate,localInstants,scheduleTransaction,uuid} from './bookings.js';
const serial=row=>({id:row.id,kind:row.kind,amountCents:row.amount_cents,date:row.local_date,category:row.category,note:row.note,paymentMethod:row.payment_method,bookingId:row.booking_id,voidedAt:row.voided_at?.toISOString()||null,voidReason:row.void_reason});
const total=value=>{const n=Number(value||0);if(!Number.isSafeInteger(n))throw error(500,'Total fuera de rango.');return n;};
async function timezone(db){const zone=(await db.query('SELECT data FROM settings')).rows[0].data.timezone;if(!zone)throw error(409,'Configura primero la zona horaria de la barbería.');return zone;}
function at(date,time,zone){const values=localInstants(date,time,zone);if(values.length!==1)throw error(400,'La fecha u hora no existe o es ambigua en la zona de la barbería.');return new Date(values[0]);}
export function installFinance(app,pool,{owner,wrap,clock=()=>Date.now()}){
 app.get('/api/admin/finance',owner,wrap(async(req,res)=>{
  const start=localDate(req.query.start).toString(),end=localDate(start).add({days:7}).toString();
  const result=await scheduleTransaction(pool,async db=>{
   const zone=await timezone(db),from=at(start,'00:00',zone),until=at(end,'00:00',zone);
   const entries=await db.query('SELECT * FROM finance_entries WHERE occurred_at>=$1 AND occurred_at<$2 ORDER BY occurred_at DESC,created_at DESC LIMIT 500',[from,until]);
   const sums=await db.query("SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind='income' AND voided_at IS NULL),0) AS income,COALESCE(sum(amount_cents) FILTER (WHERE kind='expense' AND voided_at IS NULL),0) AS expenses,count(*)::int AS count FROM finance_entries WHERE occurred_at>=$1 AND occurred_at<$2",[from,until]);
   const categories=await db.query("SELECT kind,category,sum(amount_cents) AS amount FROM finance_entries WHERE occurred_at>=$1 AND occurred_at<$2 AND voided_at IS NULL GROUP BY kind,category ORDER BY kind,category",[from,until]);
   const plan=await db.query('SELECT * FROM finance_plans WHERE start_date=$1',[start]);
   const incomeCents=total(sums.rows[0].income),expenseCents=total(sums.rows[0].expenses),p=plan.rows[0];
   return {pendingBookings:await pendingBookingIncome(db),start,endExclusive:end,timezone:zone,incomeCents,expenseCents,balanceCents:incomeCents-expenseCents,count:sums.rows[0].count,entries:entries.rows.map(serial),categories:categories.rows.map(row=>({kind:row.kind,category:row.category,amountCents:total(row.amount)})),plan:p?{incomeTargetCents:p.income_target_cents,expenseLimitCents:p.expense_limit_cents,note:p.note}:null};
  });res.json(result);
 }));
 app.post('/api/admin/finance/entries',owner,wrap(async(req,res)=>{
  const v=req.body,key=uuid(v.idempotencyKey),date=localDate(v.date).toString();
  if(!['income','expense'].includes(v.kind)||v.settled!==true||!['cash','card','other'].includes(v.paymentMethod))throw error(400,'Confirma un cobro recibido o gasto pagado y su método.');
  const amount=number(v.amountCents,1,100000000),category=text(v.category,100),note=text(v.note,500,true),bookingId=v.bookingId==null?null:uuid(v.bookingId);
  if(bookingId&&v.kind!=='income')throw error(400,'Solo un cobro puede relacionarse con una cita.');
  const entry=await scheduleTransaction(pool,async db=>{
   const zone=await timezone(db),today=Temporal.Instant.fromEpochMilliseconds(clock()).toZonedDateTimeISO(zone).toPlainDate();if(Temporal.PlainDate.compare(localDate(date),today)>0)throw error(400,'Un cobro o gasto real no puede tener fecha futura. Usa el plan para metas.');
   const existing=(await db.query('SELECT * FROM finance_entries WHERE idempotency_key=$1',[key])).rows[0];
   if(existing){if(existing.kind!==v.kind||existing.amount_cents!==amount||existing.local_date!==date||existing.category!==category||existing.note!==note||existing.payment_method!==v.paymentMethod||existing.booking_id!==bookingId)throw error(409,'La solicitud ya se registró con otros datos.');return existing;}
   if(bookingId){const booking=(await db.query("SELECT id,arrived_at FROM calendar_entries WHERE id=$1 AND kind='booking' AND status IN ('confirmed','completed')",[bookingId])).rows[0];if(!booking)throw error(400,'Cita inválida para este cobro.');if(booking.arrived_at)throw error(409,'El cobro de esta cita ya se registró al confirmar su llegada. Corrige el movimiento existente en Finanzas, sin crear otro cobro para la misma cita.');}
   return (await db.query('INSERT INTO finance_entries(id,idempotency_key,kind,amount_cents,occurred_at,local_date,category,note,payment_method,booking_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[randomUUID(),key,v.kind,amount,at(date,'12:00',zone),date,category,note,v.paymentMethod,bookingId])).rows[0];
  });res.status(201).json({entry:serial(entry)});
 }));
 app.post('/api/admin/finance/entries/:id/void',owner,wrap(async(req,res)=>{
  uuid(req.params.id);const reason=text(req.body.reason,500);
  await scheduleTransaction(pool,async db=>{const result=await db.query('UPDATE finance_entries SET voided_at=COALESCE(voided_at,$2),void_reason=COALESCE(void_reason,$3) WHERE id=$1 RETURNING id',[req.params.id,new Date(clock()),reason]);if(!result.rowCount)throw error(404,'Movimiento no encontrado.');});res.json({ok:true});
 }));
 app.put('/api/admin/finance/plan',owner,wrap(async(req,res)=>{
  const v=req.body,start=localDate(v.start).toString(),income=v.incomeTargetCents==null?null:number(v.incomeTargetCents,0,100000000),expense=v.expenseLimitCents==null?null:number(v.expenseLimitCents,0,100000000),note=text(v.note,500,true);
  await scheduleTransaction(pool,db=>db.query('INSERT INTO finance_plans(start_date,income_target_cents,expense_limit_cents,note) VALUES($1,$2,$3,$4) ON CONFLICT(start_date) DO UPDATE SET income_target_cents=EXCLUDED.income_target_cents,expense_limit_cents=EXCLUDED.expense_limit_cents,note=EXCLUDED.note,updated_at=now()',[start,income,expense,note]));res.json({ok:true});
 }));
}
