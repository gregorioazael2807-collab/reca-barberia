import express from 'express';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {digest,error,text} from './security.js';
import {scheduleTransaction,uuid} from './bookings.js';
import {refreshWaitlist} from './waitlist.js';
import {sendNewAppointmentEmails} from './email-delivery.js';

// Transactional outbox; delivery is separately gated by the authorized mailer.
export function automationRunnerStatus(lastPoll,now=Date.now()){
  if(!lastPoll)return 'never';
  const age=now-new Date(lastPoll).getTime();
  return Number.isFinite(age)&&age>=-30000&&age<=180000?'connected':'stale';
}
export async function invalidateNotifications(db,bookingId,now) {
  await db.query("UPDATE notification_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=$2 WHERE booking_id=$1 AND status IN ('queued','drafting','prepared','failed')",[bookingId,new Date(now)]);
}
export async function enqueueNotification(db,booking,event,appUrl,now) {
  // Superseded drafts must never be mistaken for the current booking conditions.
  await invalidateNotifications(db,booking.id,now);
  const customer=(await db.query('SELECT name,email FROM users WHERE id=$1',[booking.user_id])).rows[0];
  if(!customer)return;
  const s=booking.snapshot;
  const payload={event,customerName:customer.name,email:customer.email,recipientPhone:null,start:booking.starts_at.toISOString(),timezone:s.timezone,city:s.city,serviceName:s.service.name.es,priceCents:s.service.priceCents,cancellationNoticeMinutes:s.cancellationNoticeMinutes,appUrl};
  await db.query("INSERT INTO notification_jobs(id,booking_id,revision,event,dedupe_key,due_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(dedupe_key) DO NOTHING",[randomUUID(),booking.id,booking.notification_revision,event,`${booking.id}:${booking.notification_revision}:${event}`,new Date(now),JSON.stringify(payload)]);
}
export async function scrubNotifications(db,userId) {
  await db.query("UPDATE notification_jobs j SET status='cancelled',draft=NULL,lease_token=NULL,lease_until=NULL,payload=(j.payload - 'customerName' - 'email') || '{\"customerName\":\"cliente\",\"email\":null}'::jsonb,updated_at=now() FROM calendar_entries c WHERE c.id=j.booking_id AND c.user_id=$1",[userId]);
}
export async function automationSummary(pool,{now=Date.now(),origin='http://127.0.0.1:8081',appointmentMailer=null}={}) {
  await scheduleTransaction(pool,db=>refreshWaitlist(db,now,origin));
  const [counts,state,jobs,waitlistCount,waitlistNotices]=await Promise.all([
    pool.query('SELECT status,count(*)::integer AS count FROM notification_jobs GROUP BY status'),
    pool.query('SELECT last_poll,last_prepared FROM automation_state WHERE id=true'),
    pool.query('SELECT id,event,status,draft,attempts,last_error,created_at,(SELECT status FROM notification_email_deliveries WHERE job_id=notification_jobs.id) AS email_status FROM notification_jobs ORDER BY created_at DESC LIMIT 20'),
    pool.query('SELECT count(*)::int AS count FROM waitlist_subscriptions'),
    pool.query("SELECT id,draft,starts_at FROM waitlist_notices WHERE status='prepared' ORDER BY created_at DESC LIMIT 20")
  ]);
  const emailStatus=appointmentMailer?await appointmentMailer.status():{enabled:false};
  const deliveryCounts=(await pool.query('SELECT status,count(*)::int AS count FROM notification_email_deliveries GROUP BY status')).rows;
  return {runnerStatus:automationRunnerStatus(state.rows[0]?.last_poll,now),mode:emailStatus.enabled?'email':'draft-only',canSend:emailStatus.enabled,channels:['email'],emailStatus,emailDeliveries:Object.fromEntries(deliveryCounts.map(row=>[row.status,row.count])),remindersConfigured:true,reminderNoticeMinutes:60,counts:Object.fromEntries(counts.rows.map(r=>[r.status,r.count])),lastPoll:state.rows[0]?.last_poll??null,lastPrepared:state.rows[0]?.last_prepared??null,jobs:jobs.rows,waitlistCount:waitlistCount.rows[0].count,waitlistNotices:waitlistNotices.rows};
}
export function installAutomation(app,pool,{automationToken,clock=()=>Date.now(),appointmentMailer=null}) {
  const router=express.Router();
  router.use(express.json({limit:'32kb'}));
  router.use((req,res,next)=>{
    const header=req.get('authorization')||'';
    const candidate=header.startsWith('Bearer ')?header.slice(7):'';
    if(!automationToken||!candidate||!timingSafeEqual(Buffer.from(digest(candidate)),Buffer.from(digest(automationToken))))return next(error(401,'Acceso exclusivo para la automatización.'));
    next();
  });
  router.post('/claim',async(req,res,next)=>{
    try {
      const jobs=await scheduleTransaction(pool,async db=>{
        const now=new Date(clock());
        await db.query('UPDATE automation_state SET last_poll=$1 WHERE id=true',[now]);
        await refreshWaitlist(db,now.getTime(),app.locals.origin);
        // Only current confirmed bookings with an existing notification are eligible.
        // Runs locally at the one-hour threshold; deduplication survives repeated polls.
        await db.query(`INSERT INTO notification_jobs(id,booking_id,revision,event,dedupe_key,due_at,payload)
          SELECT gen_random_uuid(),c.id,c.notification_revision,'reminder',
            c.id::text || ':' || c.notification_revision::text || ':reminder',
            c.starts_at - interval '1 hour',
            j.payload || jsonb_build_object('event','reminder','customerName',u.name,'email',u.email)
          FROM calendar_entries c
          JOIN users u ON u.id=c.user_id
          JOIN notification_jobs j ON j.booking_id=c.id AND j.revision=c.notification_revision
            AND j.event IN ('confirmed','rescheduled')
          WHERE c.status='confirmed' AND c.starts_at>$1 AND c.starts_at<= $1 + interval '1 hour'
          ON CONFLICT(dedupe_key) DO NOTHING`,[now]);
        await db.query("UPDATE notification_jobs j SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=$1 FROM calendar_entries c WHERE c.id=j.booking_id AND j.status IN ('queued','drafting','prepared','failed') AND (j.revision<>c.notification_revision OR (j.event='cancelled' AND c.status<>'cancelled') OR (j.event<>'cancelled' AND (c.status<>'confirmed' OR c.starts_at<=$1)))",[now]);
        await db.query("UPDATE notification_jobs SET status='failed',last_error='n8n no completó la redacción tras cinco intentos.',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE status='drafting' AND lease_until<=$1 AND attempts>=5",[now]);
        const rows=(await db.query("SELECT j.* FROM notification_jobs j JOIN calendar_entries c ON c.id=j.booking_id WHERE j.revision=c.notification_revision AND j.due_at<=$1 AND j.attempts<5 AND (j.status='queued' OR (j.status='drafting' AND j.lease_until<=$1)) ORDER BY j.due_at,j.created_at LIMIT 10 FOR UPDATE OF j SKIP LOCKED",[now])).rows;
        const result=[];
        for(const row of rows) {
          const leaseToken=randomUUID();
          await db.query("UPDATE notification_jobs SET status='drafting',lease_token=$2,lease_until=$3,attempts=attempts+1,updated_at=$4 WHERE id=$1",[row.id,leaseToken,new Date(now.getTime()+300000),now]);
          result.push({id:row.id,leaseToken,payload:row.payload});
        }
        return result;
      });
      res.json({mode:'draft-only',canSend:false,jobs});
    }catch(err){next(err);}
  });
  router.post('/jobs/:id/draft',async(req,res,next)=>{
    try {
      uuid(req.params.id);uuid(req.body.leaseToken);
      const value=req.body.message;
      if(!value||typeof value!=='object')throw error(400,'Mensaje inválido.');
      const draft={subject:text(value.subject,200),emailText:text(value.emailText,4000)};
      await scheduleTransaction(pool,async db=>{
        const now=new Date(clock());
        const row=(await db.query('SELECT j.*,c.notification_revision,c.status AS booking_status,c.starts_at AS booking_start FROM notification_jobs j JOIN calendar_entries c ON c.id=j.booking_id WHERE j.id=$1 FOR UPDATE OF j',[req.params.id])).rows[0];
        if(!row)throw error(404,'Mensaje no encontrado.');
        // A repeated acknowledgement cannot overwrite an already prepared draft.
        if(row.status==='prepared'&&row.lease_token===req.body.leaseToken)return;
        if(row.status!=='drafting'||row.lease_token!==req.body.leaseToken||row.lease_until<=now||row.revision!==row.notification_revision||(row.event==='cancelled'?row.booking_status!=='cancelled':row.booking_status!=='confirmed'||row.booking_start<=now))throw error(409,'La tarea caducó o la cita cambió. No guardar este mensaje.');
        await db.query("UPDATE notification_jobs SET status='prepared',draft=$2,lease_until=NULL,updated_at=$3 WHERE id=$1",[row.id,JSON.stringify(draft),now]);
        await db.query('UPDATE automation_state SET last_prepared=$1 WHERE id=true',[now]);
      });res.json({ok:true,status:'prepared',sent:false});
    }catch(err){next(err);}
  });
  router.post('/email/run',async(req,res,next)=>{
    try{res.json(await sendNewAppointmentEmails(pool,{mailer:appointmentMailer,now:clock()}));}catch(err){next(err);}
  });
  router.use((req,res)=>res.status(404).json({error:'Ruta de automatización no encontrada.'}));
  app.use('/api/automation',router);
}
