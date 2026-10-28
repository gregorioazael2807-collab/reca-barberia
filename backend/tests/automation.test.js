import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
import {renderMessage} from '../message-texts.js';
import {buildWorkflow} from '../../automation/build-workflow.js';

const payload={event:'confirmed',customerName:'Ana\nPrueba',start:'2027-01-11T15:00:00Z',timezone:'America/New_York',city:'Tampa, Florida',serviceName:'Corte caballeros',priceCents:3500,cancellationNoticeMinutes:300,appUrl:'http://localhost:8081'};
test('textos revisados: nombre, precio acordado, Tampa, política y eventos',()=>{
  const draft=renderMessage(payload);assert.match(draft.whatsappText,/Ana Prueba/);assert.match(draft.whatsappText,/10:00/);assert.match(draft.whatsappText,/35\.00/);assert.match(draft.whatsappText,/5 horas/);assert.match(draft.whatsappText,/Pago en el local/);assert.doesNotMatch(draft.whatsappText,/duración|60 minutos/);
  assert.match(renderMessage({...payload,event:'rescheduled'}).whatsappText,/Actualizamos/);
  const cancelled=renderMessage({...payload,event:'cancelled'}).whatsappText;
  assert.match(cancelled,/está cancelada/);assert.match(cancelled,/hora de la barbería/);assert.match(cancelled,/\/\#booking/);
  assert.match(draft.whatsappText,/Tampa, Florida/);assert.match(draft.whatsappText,/\/\#appointments/);
  assert.match(draft.emailText,/Fecha:/);assert.match(draft.emailText,/Total de la reserva:/);assert.match(draft.emailText,/no es publicidad/);assert.match(draft.emailText,/misma red Wi-Fi/);
  assert.throws(()=>renderMessage({...payload,appUrl:'javascript:alert(1)'}));
  for(const event of ['confirmed','rescheduled','cancelled','reminder']) {
    const message=renderMessage({...payload,event});
    assert.equal(message.emailText,message.whatsappText);
    assert.doesNotMatch(message.whatsappText,/✂️|📅|🕒|💈|💵|📍|¡Gracias/);
  }
  assert.throws(()=>renderMessage({...payload,event:'sent'}));
  assert.match(renderMessage({...payload,start:'2027-07-11T14:00:00Z'}).whatsappText,/10:00/);
});
test('n8n solo consulta RECA: redacta y solicita envío controlado sin credenciales SMTP',()=>{
  const workflow=buildWorkflow();assert.equal(workflow.active,false);assert.equal(workflow.nodes.length,5);assert.equal(buildWorkflow({test:true}).nodes.length,4);
  const http=workflow.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest');assert.equal(http.length,3);
  for(const node of http){assert.ok(node.parameters.url.startsWith('={{ $env.RECA_AUTOMATION_BASE_URL'));assert.doesNotMatch(JSON.stringify(node),/graph\.facebook|smtp|twilio|whatsappSender|phoneE164/);}
  assert.equal(workflow.settings.saveDataSuccessExecution,'none');assert.equal(workflow.settings.saveDataErrorExecution,'none');
  const code=workflow.nodes.find(n=>n.type==='n8n-nodes-base.code').parameters.jsCode;
  const run=new Function('$input',code);const output=run({all:()=>[{json:{jobs:[{id:'isolated',leaseToken:'private-test',payload}]}}]});
  const message=renderMessage(payload);assert.deepEqual(output[0].json.message,{subject:message.subject,emailText:message.emailText});assert.equal(output[0].json.message.whatsappText,undefined);assert.deepEqual(run({all:()=>[{json:{jobs:[]}}]}),[]);
});

test('tramo 4: outbox privado, transaccional, concurrente y envíos desactivados sin configuración',async t=>{
  const database='reca_automation_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
  const pool=makePool(database);let server,now=Date.parse('2027-01-10T12:00:00Z');
  try {
    await initialize(pool);const setupToken=token(),automationToken=token(),app=createApp(pool,{setupToken,automationToken,rateLimit:100,clock:()=>now});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{
      const res=await fetch(base+url,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const sc=res.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const data=await res.json();if(data.csrf)csrf=data.csrf;return {status:res.status,data};
    };}
    const owner=client(),customer=client(),anonymous=client();
    await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private isolated owner password!'}});
    await customer('/api/auth/register',{method:'POST',body:{name:'Ana aislada',email:'ana@example.test',password:'Private isolated customer password!'}});
    await owner('/api/admin/settings',{method:'PATCH',body:{city:'Tampa, Florida',timezone:'America/New_York',cancellationNoticeMinutes:300,bookingSpacingMinutes:60,bookingNoticeMinutes:0,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))}});
    const service={name:{es:'Corte caballeros',en:'Men haircut'},description:{es:'Prueba',en:'Test'},priceCents:3500,active:true};await owner('/api/admin/services/men',{method:'PUT',body:service});
    async function worker(url='/claim',body={}){const res=await fetch(base+'/api/automation'+url,{method:'POST',headers:{Authorization:`Bearer ${automationToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
    const claim=()=>worker();const save=job=>worker(`/jobs/${job.id}/draft`,{leaseToken:job.leaseToken,message:renderMessage(job.payload)});
    const jobs=()=>pool.query('SELECT * FROM notification_jobs ORDER BY created_at');let booking,leased;
    await t.test('sin clave válida nadie accede; clientes no ven los borradores',async()=>{
      assert.equal((await anonymous('/api/automation/claim',{method:'POST',body:{}})).status,401);
      assert.equal((await customer('/api/automation/claim',{method:'POST',body:{},headers:{Authorization:'Bearer incorrect'}})).status,401);
      assert.equal((await anonymous('/api/admin/automation')).status,401);assert.equal((await customer('/api/admin/automation')).status,403);
      assert.equal((await claim()).data.canSend,false);
    });
    await t.test('retener no notifica; confirmar/reintentar crea una sola tarea',async()=>{
      const held=await customer('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-11T15:00:00Z'}});assert.equal(held.status,201);booking=held.data;
      assert.equal((await jobs()).rowCount,0);
      for(let i=0;i<2;i++)assert.equal((await customer(`/api/holds/${booking.id}/confirm`,{method:'POST',body:{}})).status,200);
      const result=await jobs();assert.equal(result.rowCount,1);assert.equal(result.rows[0].payload.recipientPhone,null);assert.equal(result.rows[0].payload.priceCents,3500);
    });
    await t.test('dos trabajadores no recogen la misma tarea; guardado idempotente',async()=>{
      const results=await Promise.all([claim(),claim()]);const combined=results.flatMap(r=>r.data.jobs);assert.equal(combined.length,1);leased=combined[0];
      assert.equal((await save(leased)).data.sent,false);assert.equal((await save(leased)).status,200);
      assert.equal((await claim()).data.jobs.length,0);assert.equal((await jobs()).rows[0].status,'prepared');
      const summary=(await owner('/api/admin/automation')).data;assert.equal(summary.canSend,false);assert.ok(summary.lastPoll);assert.deepEqual(summary.channels,['email']);assert.match(summary.jobs[0].draft.emailText,/Ana aislada/);assert.equal(summary.jobs[0].draft.whatsappText,undefined);
    });
    await t.test('cambio conserva precio/política; reintento no duplica; invalida el anterior',async()=>{
      await owner('/api/admin/services/men',{method:'PUT',body:{...service,priceCents:4000}});
      for(let i=0;i<2;i++)assert.equal((await customer(`/api/bookings/${booking.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-11T16:00:00Z'}})).status,200);
      const result=await jobs();assert.equal(result.rowCount,2);assert.equal(result.rows[0].status,'cancelled');
      assert.equal((await save(leased)).status,409);leased=(await claim()).data.jobs[0];assert.equal(leased.payload.priceCents,3500);assert.equal(leased.payload.cancellationNoticeMinutes,300);assert.match(renderMessage(leased.payload).whatsappText,/11:00/);
    });
    await t.test('cancelar libera sin depender de n8n y rechaza una redacción en vuelo',async()=>{
      for(let i=0;i<2;i++)assert.equal((await customer(`/api/bookings/${booking.id}/cancel`,{method:'POST',body:{}})).status,200);
      assert.equal((await save(leased)).status,409);const result=await jobs();assert.equal(result.rowCount,3);assert.equal(result.rows[1].status,'cancelled');
      assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[booking.id])).rows[0].status,'cancelled');
      leased=(await claim()).data.jobs[0];assert.equal(leased.payload.event,'cancelled');
    });
    await t.test('lease caducado se recupera y el token viejo no puede guardar',async()=>{
      const old=leased;now+=300001;leased=(await claim()).data.jobs[0];assert.equal(leased.id,old.id);assert.notEqual(leased.leaseToken,old.leaseToken);assert.equal((await save(old)).status,409);
      assert.equal((await save(leased)).status,200);
    });
    await t.test('cliente no puede habilitar proveedores; sin adaptador el envío permanece apagado',async()=>{
      assert.equal((await worker('/send',{sendEnabled:true,providerRequestsEnabled:true})).status,404);
      assert.equal((await worker(`/jobs/${leased.id}/send`,{sendEnabled:true})).status,404);
      assert.equal((await worker('/email/run')).data.enabled,false);
      assert.equal((await owner('/api/admin/automation')).data.mode,'draft-only');
    });
    await t.test('eliminar cuenta borra nombres/correos/textos de la cola',async()=>{
      assert.equal((await customer('/api/me',{method:'DELETE'})).status,200);
      const result=await jobs();assert.ok(result.rows.every(r=>r.status==='cancelled'&&r.draft===null&&r.payload.email===null&&r.payload.customerName==='cliente'));assert.equal(JSON.stringify(result.rows).includes('ana@example.test'),false);
      assert.equal((await save(leased)).status,409);
    });
    await t.test('máximo cinco intentos; un fallo de redacción no impide cancelar',async()=>{
      const other=client();await other('/api/auth/register',{method:'POST',body:{name:'Otro aislado',email:'otro@example.test',password:'Private isolated customer password!'}});
      const held=(await other('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-12T15:00:00Z'}})).data;await other(`/api/holds/${held.id}/confirm`,{method:'POST',body:{}});
      for(let i=0;i<5;i++){assert.equal((await claim()).data.jobs.length,1);now+=300001;}
      assert.equal((await claim()).data.jobs.length,0);const failed=(await pool.query("SELECT * FROM notification_jobs WHERE booking_id=$1",[held.id])).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.attempts,5);
      assert.equal((await other(`/api/bookings/${held.id}/cancel`,{method:'POST',body:{}})).status,200);assert.equal((await pool.query('SELECT status FROM notification_jobs WHERE id=$1',[failed.id])).rows[0].status,'cancelled');
    });
    await t.test('recordatorio una hora antes: umbral, deduplicación y caducidad',async()=>{
      const other=client();await other('/api/auth/register',{method:'POST',body:{name:'Recordatorio aislado',email:'reminder@example.test',password:'Private isolated customer password!'}});
      const held=(await other('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-13T15:00:00Z'}})).data;
      assert.equal((await other(`/api/holds/${held.id}/confirm`,{method:'POST',body:{}})).status,200);
      for(const job of (await claim()).data.jobs)await save(job);
      const start=Date.parse('2027-01-13T15:00:00Z');now=start-3600001;
      assert.equal((await claim()).data.jobs.length,0);
      now=start-3600000;
      const results=await Promise.all([claim(),claim()]);const reminders=results.flatMap(r=>r.data.jobs);
      assert.equal(reminders.length,1);const reminder=reminders[0];assert.equal(reminder.payload.event,'reminder');
      assert.match(renderMessage(reminder.payload).whatsappText,/ya terminó/);
      assert.equal((await save(reminder)).status,200);assert.equal((await claim()).data.jobs.length,0);
      const summary=(await owner('/api/admin/automation')).data;
      assert.equal(summary.remindersConfigured,true);assert.equal(summary.reminderNoticeMinutes,60);assert.equal(summary.canSend,false);
      now=start;assert.equal((await claim()).data.jobs.length,0);
      assert.equal((await pool.query('SELECT status FROM notification_jobs WHERE id=$1',[reminder.id])).rows[0].status,'cancelled');
    });
    await t.test('una cita atendida no deja borradores pendientes',async()=>{
      await pool.query("UPDATE calendar_entries SET status='completed',notification_revision=notification_revision+1 WHERE kind='booking'");
      assert.equal((await claim()).data.jobs.length,0);assert.equal((await pool.query("SELECT count(*)::int AS count FROM notification_jobs WHERE event='reminder' AND status<>'cancelled'")).rows[0].count,0);
    });
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();}
});
