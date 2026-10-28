import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {makePool,initialize} from '../db.js';import {createApp} from '../app.js';import {token} from '../security.js';import {gochoRange} from '../gocho.js';
test('IA Gocho IA: datos reales, límites, propuestas y confirmación segura; cero llamadas externas',async t=>{
 const name='reca_gocho_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-gocho-'));let server,now=Date.parse('2027-01-04T17:00:00Z'),calls=0,intent={action:'gastos',startDate:null,endDateExclusive:null};const contexts=[];
 const provider={available:false,model:'mock-test',dailyLimit:2,classify:async(command,context)=>{calls++;contexts.push(context);return intent;}};
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,clock:()=>now,gocho:provider,rateLimit:200});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client();await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner test',password:'Private gocho owner password!'}});const user=(await customer('/api/auth/register',{method:'POST',body:{name:'Client test',email:'gocho@example.test',password:'Private gocho client password!'}})).data.user;
  await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/New_York\"}'::jsonb");
  const ask=(action,extra={})=>owner('/api/admin/gocho/request',{method:'POST',body:{idempotencyKey:randomUUID(),mode:'direct',action,...extra}});
  await t.test('solo dueño, CSRF, sin clave no hay IA simulada',async()=>{
   assert.equal((await customer('/api/admin/gocho/status')).status,403);assert.equal((await customer('/api/admin/gocho/history')).status,403);assert.equal((await fetch(base+'/api/admin/gocho/status')).status,401);assert.equal((await owner('/api/admin/gocho/status')).data.available,false);
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{idempotencyKey:randomUUID(),mode:'natural',command:'Busca mis gastos'}})).status,503);assert.equal(calls,0);
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',headers:{'X-CSRF-Token':'bad'},body:{idempotencyKey:randomUUID(),mode:'direct',action:'agenda'}})).status,403);
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{idempotencyKey:randomUUID(),mode:'natural',command:'Clave sk-abcdefghijklmnopqrs'}})).status,400);
   assert.equal((await ask('delete_everything')).status,400);
  });
  await t.test('gastos e ingresos del libro real; anulados excluidos, sin pagos inferidos',async()=>{
   for(const [kind,amount,voided] of [['expense',1200,false],['income',3500,false],['expense',500,true]])await pool.query("INSERT INTO finance_entries(id,idempotency_key,kind,amount_cents,occurred_at,local_date,category,note,payment_method,voided_at,void_reason) VALUES($1,$2,$3,$4,'2027-01-04T17:00:00Z','2027-01-04','Prueba','Nota privada no enviada','cash',$5,$6)",[randomUUID(),randomUUID(),kind,amount,voided?new Date(now):null,voided?'Prueba':null]);
   const data=(await ask('finanzas')).data.request.output;assert.equal(data.expenseCents,1200);assert.equal(data.incomeCents,3500);assert.equal(data.categories.length,2);assert.equal((await ask('gastos')).data.request.output.incomeCents,0);assert.equal((await ask('agenda')).data.request.output.count,0);
   assert.equal((await ask('gastos',{startDate:'2027-01-01',endDateExclusive:'2027-03-01'})).status,400);
  });
  let plan;
  await t.test('proponer no bloquea; confirmar dos veces crea un solo bloqueo auditable',async()=>{
   const result=await ask('weekend_off');assert.equal(result.status,200);plan=result.data.request;assert.equal(plan.output.canConfirm,true);assert.equal(plan.output.startDate,'2027-01-09');assert.equal((await pool.query('SELECT count(*)::int AS n FROM calendar_entries')).rows[0].n,0);
   assert.equal((await owner('/api/admin/gocho/'+plan.id+'/confirm',{method:'POST',body:{confirm:false}})).status,400);
   const results=await Promise.all([1,2].map(()=>owner('/api/admin/gocho/'+plan.id+'/confirm',{method:'POST',body:{confirm:true}})));assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.request.output.blockId,results[1].data.request.output.blockId);assert.equal((await pool.query("SELECT count(*)::int AS n FROM calendar_entries WHERE status='blocked'")).rows[0].n,1);
   assert.equal((await ask('weekend_off')).data.request.output.canConfirm,false);
  });
  await t.test('agenda cambia: no desplaza una retención/cita para ejecutar una propuesta vieja',async()=>{
   const block=(await pool.query("SELECT id FROM calendar_entries WHERE kind='block'")).rows[0];await owner('/api/admin/blocks/'+block.id,{method:'DELETE'});const result=(await ask('weekend_off')).data.request;
   await pool.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,expires_at,snapshot) VALUES($1,$2,'booking','held',$3,$4,$4,$5,'{}')",[randomUUID(),user.id,new Date(result.output.from+3600000),new Date(result.output.from+7200000),new Date(now+20*60000)]);
   assert.equal((await owner('/api/admin/gocho/'+result.id+'/confirm',{method:'POST',body:{confirm:true}})).status,409);assert.equal((await pool.query("SELECT count(*)::int AS n FROM calendar_entries WHERE status='held'")).rows[0].n,1);
  });
  await t.test('caducidad, zona cambiada y fechas DST se validan en servidor',async()=>{
   const request=(await ask('weekend_off',{startDate:'2027-01-16',endDateExclusive:'2027-01-18'})).data.request;now+=15*60000;assert.equal((await owner('/api/admin/gocho/'+request.id+'/confirm',{method:'POST',body:{confirm:true}})).status,409);
   const other=(await ask('weekend_off',{startDate:'2027-01-23',endDateExclusive:'2027-01-25'})).data.request;await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/Chicago\"}'::jsonb");assert.equal((await owner('/api/admin/gocho/'+other.id+'/confirm',{method:'POST',body:{confirm:true}})).status,409);await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/New_York\"}'::jsonb");
   const range=gochoRange({action:'weekend_off',startDate:'2027-03-13',endDateExclusive:'2027-03-15'},'America/New_York',now);assert.equal((range.until-range.from)/3600000,47);
  });
  await t.test('consulta interrumpida no se anuncia ejecutada ni se puede confirmar',async()=>{
   const id=randomUUID(),ownerId=(await pool.query("SELECT id FROM users WHERE role='owner'")).rows[0].id;await pool.query("INSERT INTO gocho_requests(id,user_id,mode,input,status,created_at) VALUES($1,$2,'direct','{\"action\":\"agenda\"}','pending',$3)",[id,ownerId,new Date(now-180000)]);
   const entry=(await owner('/api/admin/gocho/history')).data.requests.find(row=>row.id===id);assert.equal(entry.status,'failed');assert.match(entry.output.text,/interrumpió/);assert.equal((await owner('/api/admin/gocho/'+id+'/confirm',{method:'POST',body:{confirm:true}})).status,409);
  });
  await t.test('clasificador sin datos de clientes/libro, idempotencia y límite diario real',async()=>{
   provider.available=true;const id=randomUUID(),body={idempotencyKey:id,mode:'natural',command:'Busca mis gastos de esta semana'};assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body})).status,200);assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body})).status,200);assert.equal(calls,1);assert.deepEqual(contexts[0],{today:'2027-01-04',timezone:'America/New_York'});
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{...body,command:'otra orden'}})).status,409);
   intent={action:'drop_tables',startDate:null,endDateExclusive:null};assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{...body,idempotencyKey:randomUUID()}})).status,400);assert.equal(calls,2);
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{...body,idempotencyKey:randomUUID()}})).status,429);assert.equal(calls,2);assert.ok((await owner('/api/admin/gocho/history')).data.requests.length>0);const quota=(await owner('/api/admin/gocho/status')).data;assert.equal(quota.used,2);assert.equal(quota.remaining,0);assert.equal(quota.resetAt,'2027-01-05T00:00:00.000Z');
   provider.dailyLimit=0;intent={action:'gastos',startDate:null,endDateExclusive:null};assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{...body,idempotencyKey:randomUUID()}})).status,200);const uncapped=(await owner('/api/admin/gocho/status')).data;assert.equal(uncapped.unlimited,true);assert.equal(uncapped.remaining,null);assert.equal(uncapped.used,3);assert.equal(calls,3);
  });
  await t.test('respuestas generales sin cambios y fecha/hora autoritativa del servidor',async()=>{
   provider.dailyLimit=0;provider.available=true;
   const before=await pool.query('SELECT (SELECT count(*) FROM calendar_entries) AS calendar,(SELECT count(*) FROM finance_entries) AS finance,(SELECT count(*) FROM offers) AS offers');
   const send=command=>owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command}});
   intent={action:'help',answer:'¡Hola! Puedo explicarte cómo organizar tu día.',startDate:null,endDateExclusive:null,offer:null};
   const reply=await send('Hola, dame un consejo');assert.equal(reply.status,200);assert.equal(reply.data.request.status,'done');assert.equal(reply.data.request.output.text,intent.answer);assert.equal(reply.data.request.output.canConfirm,undefined);
   assert.equal((await owner('/api/admin/gocho/'+reply.data.request.id+'/confirm',{method:'POST',body:{confirm:true}})).status,409);
   intent={action:'datetime',answer:'Son las 99:99 del año 1900',startDate:null,endDateExclusive:null,offer:null};
   const time=await send('¿Qué hora y fecha es?');assert.equal(time.status,200);assert.equal(time.data.request.output.asOf,new Date(now).toISOString());assert.equal(time.data.request.output.timezone,'America/New_York');assert.match(time.data.request.output.text,/2027/);assert.doesNotMatch(time.data.request.output.text,/99:99|1900/);
   now=Date.parse('2027-01-05T02:00:00Z');const local=(await ask('datetime')).data.request.output;assert.match(local.text,/lunes, 4 de enero de 2027/);assert.match(local.text,/9:00:00 p\.m\./);
   intent={action:'help',answer:'x'.repeat(4001)};assert.equal((await send('Hola')).status,400);
   intent={action:'help',answer:{text:'no válido'}};assert.equal((await send('Hola')).status,400);
   assert.deepEqual((await pool.query('SELECT (SELECT count(*) FROM calendar_entries) AS calendar,(SELECT count(*) FROM finance_entries) AS finance,(SELECT count(*) FROM offers) AS offers')).rows,before.rows);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
