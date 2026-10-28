import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize} from '../db.js';
import {createAppointmentEmail} from '../appointment-email.js';
import {authorizedSender} from '../gmail.js';
import {sendNewAppointmentEmails} from '../email-delivery.js';
import {createApp} from '../app.js';

test('correo de citas: activación separada, prueba fija, TLS y fallos privados',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'reca-appointment-mail-')),credentialsPath=path.join(directory,'gmail.env'),configPath=path.join(directory,'appointment-email.json');
 const messages=[],options=[];let fail=false;
 const mailer=createAppointmentEmail({credentialsPath,configPath,createTransport:value=>{options.push(value);return {sendMail:async message=>{messages.push(message);if(fail)throw new Error('PRIVATE SMTP DETAIL');return {accepted:[message.to],rejected:[]};},close(){}};}});
 try{
  assert.equal((await mailer.status()).enabled,false);await assert.rejects(mailer.sendPreview());assert.equal(messages.length,0);
  await writeFile(credentialsPath,`GMAIL_USER=${authorizedSender}\nGMAIL_APP_PASSWORD=aaaabbbbccccdddd\nRECOVERY_EMAIL_ENABLED=true\n`);
  assert.equal((await mailer.status()).enabled,false);await assert.rejects(mailer.send({to:'client@example.test',subject:'Test',body:'Test'}));
  await mailer.sendPreview();assert.equal(messages[0].to,authorizedSender);assert.match(messages[0].text,/No corresponde a ninguna cita/);
  assert.equal(options[0].tls.rejectUnauthorized,true);assert.equal(options[0].secure,true);assert.equal(options[0].debug,false);
  await writeFile(configPath,JSON.stringify({enabled:true,sender:authorizedSender,activatedAt:'2026-10-11T10:00:00Z'}));
  assert.equal((await mailer.status()).enabled,true);
  await mailer.send({to:'client@example.test',subject:'Confirmación',body:'Cita real',messageId:'<test@example.test>'});
  assert.equal(messages[1].messageId,'<test@example.test>');assert.equal(messages[1].disableUrlAccess,true);
  fail=true;await assert.rejects(mailer.sendPreview(),error=>!error.message.includes('PRIVATE'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('envío n8n: solo nuevos eventos, privacidad, idempotencia y resultados inciertos sin reenvío',async()=>{
 const name='reca_delivery_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);
 const pool=makePool(name),now=Date.parse('2027-01-10T12:00:00Z'),cutoff=new Date(now-60000).toISOString();let server;
 const messages=[];let enabled=false,fail=false;
 const mailer={status:async()=>({enabled,activatedAt:cutoff}),send:async message=>{messages.push(message);if(fail)throw new Error('PRIVATE ERROR');return {accepted:true};}};
 try{
  await initialize(pool);const user=randomUUID();await pool.query("INSERT INTO users(id,role,name,email,password_hash) VALUES($1,'customer','Ana prueba','ana@example.test','isolated')",[user]);
  let sequence=0;
  async function job({created=new Date(now-1000),event='confirmed',status='confirmed',revision=1,original=false}={}){
   const booking=randomUUID(),id=randomUUID(),snapshot={},start=new Date(Date.parse('2027-01-11T15:00:00Z')+sequence++*7200000),end=new Date(start.getTime()+3600000);
   await pool.query("INSERT INTO calendar_entries(id,kind,status,user_id,starts_at,service_ends_at,ends_at,snapshot,notification_revision) VALUES($1,'booking',$2,$3,$5,$6,$6,$4,1)",[booking,status,user,JSON.stringify(snapshot),start,end]);
   const payload={event,customerName:'Ana prueba',email:'wrong@example.test',start:'2027-01-11T15:00:00Z',timezone:'America/New_York',city:'Tampa',serviceName:'Corte',priceCents:4000,cancellationNoticeMinutes:300,appUrl:'http://localhost:8081'};
   await pool.query("INSERT INTO notification_jobs(id,booking_id,revision,event,dedupe_key,due_at,status,payload,draft,created_at) VALUES($1::uuid,$2,$3,$4,$1::uuid::text,$5,'prepared',$6,'{}',$7)",[id,booking,revision,event,new Date(now-1000),JSON.stringify(payload),created]);
   if(original)await pool.query("INSERT INTO notification_jobs(id,booking_id,revision,event,dedupe_key,due_at,status,payload,created_at) VALUES($1::uuid,$2,1,'confirmed',$1::uuid::text,$3,'cancelled',$4,$5)",[randomUUID(),booking,new Date(now-1000),JSON.stringify({...payload,event:'confirmed'}),new Date(now-120000)]);
   return id;
  }
  await job({created:new Date(now-120000)});const eligible=await job();await job({status:'cancelled'});await job({revision:2});await job({event:'reminder',original:true});
  assert.equal((await sendNewAppointmentEmails(pool,{mailer,now})).enabled,false);assert.equal(messages.length,0);
  enabled=true;await Promise.all([sendNewAppointmentEmails(pool,{mailer,now}),sendNewAppointmentEmails(pool,{mailer,now})]);
  assert.equal(messages.length,1);assert.equal(messages[0].to,'ana@example.test');assert.match(messages[0].subject,/confirmada/);assert.match(messages[0].messageId,new RegExp(eligible));
  assert.equal((await pool.query('SELECT status FROM notification_email_deliveries WHERE job_id=$1',[eligible])).rows[0].status,'accepted');
  await sendNewAppointmentEmails(pool,{mailer,now});assert.equal(messages.length,1);
  const cancelled=await job({event:'cancelled',status:'cancelled'});await sendNewAppointmentEmails(pool,{mailer,now});assert.equal(messages.length,2);
  assert.equal((await pool.query('SELECT status FROM notification_email_deliveries WHERE job_id=$1',[cancelled])).rows[0].status,'accepted');
  fail=true;const uncertain=await job();await sendNewAppointmentEmails(pool,{mailer,now});await sendNewAppointmentEmails(pool,{mailer,now});assert.equal(messages.length,3);
  const result=(await pool.query('SELECT * FROM notification_email_deliveries WHERE job_id=$1',[uncertain])).rows[0];assert.equal(result.status,'uncertain');assert.ok(!result.last_error.includes('PRIVATE'));
  const app=createApp(pool,{automationToken:'service-test',appointmentMailer:mailer,clock:()=>now});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/automation/email/run',{method:'POST'})).status,401);
  const response=await fetch(base+'/api/automation/email/run',{method:'POST',headers:{Authorization:'Bearer service-test','Content-Type':'application/json'},body:JSON.stringify({to:'attacker@example.test',subject:'ignored'})});
  assert.equal(response.status,200);assert.equal((await response.json()).accepted,0);assert.equal(messages.length,3);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();}
});
