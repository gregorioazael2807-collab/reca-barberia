import {scheduleTransaction} from './bookings.js';
import {renderMessage} from './message-texts.js';
// n8n requests a run, never supplies a recipient, body, or arbitrary SMTP settings.
export async function sendNewAppointmentEmails(pool,{mailer,now=Date.now(),limit=3}={}){
 if(!mailer)return {enabled:false,accepted:0,uncertain:0};
 const status=await mailer.status();
 if(!status.enabled||!Number.isFinite(Date.parse(status.activatedAt)))return {enabled:false,accepted:0,uncertain:0};
 let accepted=0,uncertain=0;
 for(let index=0;index<Math.min(limit,3);index++){
  const job=await scheduleTransaction(pool,async db=>{
   await db.query("UPDATE notification_email_deliveries SET status='uncertain',last_error='Proceso interrumpido: comprobar recepción antes de reintentar.',updated_at=$1 WHERE status='sending' AND created_at<$1::timestamptz - interval '10 minutes'",[new Date(now)]);
   const row=(await db.query(`SELECT j.id,j.payload,u.email FROM notification_jobs j
     JOIN calendar_entries c ON c.id=j.booking_id JOIN users u ON u.id=c.user_id
     LEFT JOIN notification_email_deliveries d ON d.job_id=j.id
     WHERE j.status='prepared' AND j.revision=c.notification_revision AND d.job_id IS NULL
       AND j.created_at>=$2 AND j.due_at<=$1 AND u.role='customer'
       AND (j.event='cancelled' AND c.status='cancelled' OR j.event<>'cancelled' AND c.status='confirmed' AND c.starts_at>$1)
       AND (j.event<>'reminder' OR EXISTS (SELECT 1 FROM notification_jobs original WHERE original.booking_id=j.booking_id AND original.revision=j.revision AND original.event IN ('confirmed','rescheduled') AND original.created_at>=$2))
     ORDER BY j.due_at,j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,[new Date(now),new Date(status.activatedAt)])).rows[0];
   if(!row)return null;
   await db.query("INSERT INTO notification_email_deliveries(job_id,status,created_at,updated_at) VALUES($1,'sending',$2,$2)",[row.id,new Date(now)]);
   return row;
  });
  if(!job)break;
  try{
   // Recheck immediately before contacting SMTP; cancellations remain independent of mail.
   const valid=(await pool.query(`SELECT 1 FROM notification_jobs j JOIN calendar_entries c ON c.id=j.booking_id JOIN users u ON u.id=c.user_id
     WHERE j.id=$1 AND j.status='prepared' AND j.revision=c.notification_revision AND u.email=$2
     AND (j.event='cancelled' AND c.status='cancelled' OR j.event<>'cancelled' AND c.status='confirmed' AND c.starts_at>$3)`,[job.id,job.email,new Date(now)])).rowCount;
   if(!valid){await pool.query("UPDATE notification_email_deliveries SET status='cancelled',updated_at=$2 WHERE job_id=$1",[job.id,new Date(now)]);continue;}
   const draft=renderMessage(job.payload);
   await mailer.send({to:job.email,subject:draft.subject,body:draft.emailText,messageId:`<reca-${job.id}@artesglobalmarket.com>`});
   await pool.query("UPDATE notification_email_deliveries SET status='accepted',updated_at=$2 WHERE job_id=$1",[job.id,new Date(now)]);accepted++;
  }catch{
   await pool.query("UPDATE notification_email_deliveries SET status='uncertain',last_error='No se confirmó la aceptación del correo. Revisar antes de reenviar.',updated_at=$2 WHERE job_id=$1",[job.id,new Date(now)]);uncertain++;
  }
 }
 return {enabled:true,accepted,uncertain};
}
