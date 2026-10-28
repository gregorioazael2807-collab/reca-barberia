import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {makePool,initialize} from '../db.js';import {createApp} from '../app.js';import {token} from '../security.js';
test('ofertas por IA: datos completos, confirmación, cliente real, precios históricos e idempotencia; proveedor simulado',async t=>{
 const name='reca_gocho_offers_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-gocho-offers-'));let server,now=Date.parse('2027-01-04T17:00:00Z');const contexts=[];let intent={action:'create_offer',startDate:'2027-01-04',endDateExclusive:'2027-01-11',offer:{percent:10,serviceIds:['men']}};
 try{
  await initialize(pool);await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/New_York\"}'::jsonb");await pool.query("UPDATE services SET data=data || '{\"active\":true,\"priceCents\":3500}'::jsonb");
  const setupToken=token(),app=createApp(pool,{setupToken,uploads,clock:()=>now,rateLimit:200,gocho:{available:true,dailyLimit:20,classify:async(command,context)=>{contexts.push(context);return intent;}}});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...(url==='/api/auth/setup'?{'X-Setup-Token':setupToken}:{})},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client();await owner('/api/auth/setup',{method:'POST',body:{name:'Owner isolated',password:'Private offers owner password!'}});const user=(await customer('/api/auth/register',{method:'POST',body:{name:'Client isolated',email:'gocho-offers@example.test',password:'Private offers client password!'}})).data.user;
  const bookingId=randomUUID();await pool.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,$2,'booking','confirmed','2027-01-05T17:00:00Z','2027-01-05T18:00:00Z','2027-01-05T18:00:00Z','{\"service\":{\"id\":\"men\",\"priceCents\":3500}}')",[bookingId,user.id]);
  const ask=()=>owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'Prepara oferta de 10% para caballeros desde hoy hasta domingo'}}),confirm=id=>owner('/api/admin/gocho/'+id+'/confirm',{method:'POST',body:{confirm:true}});let proposal;
  await t.test('cliente no administra; propuesta no publica y confirmar publica una vez',async()=>{
   assert.equal((await customer('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'Publica oferta'}})).status,403);
   const result=await ask();assert.equal(result.status,200);proposal=result.data.request;assert.equal(proposal.status,'proposed');assert.equal(proposal.output.offer.percent,10);assert.equal((await customer('/api/public')).data.offers.length,0);
   assert.equal((await owner('/api/admin/gocho/'+proposal.id+'/confirm',{method:'POST',body:{confirm:false}})).status,400);
   const results=await Promise.all([confirm(proposal.id),confirm(proposal.id)]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.request.output.offerId,results[1].data.request.output.offerId);
   const offers=(await customer('/api/public')).data.offers;assert.equal(offers.length,1);assert.equal(offers[0].percent,10);assert.deepEqual(offers[0].serviceIds,['men']);assert.equal((await pool.query('SELECT snapshot FROM calendar_entries WHERE id=$1',[bookingId])).rows[0].snapshot.service.priceCents,3500);
  });
  await t.test('sin porcentaje, fechas o servicios pide una orden completa sin inventar/publicar',async()=>{
   intent={action:'create_offer',startDate:null,endDateExclusive:null,offer:null};const result=await ask();assert.equal(result.status,200);assert.equal(result.data.request.output.needsInput,true);assert.notEqual(result.data.request.status,'proposed');assert.equal((await pool.query('SELECT count(*)::int AS n FROM offers')).rows[0].n,1);
   intent={action:'create_offer',startDate:'2027-01-04',endDateExclusive:'2027-01-11',offer:{percent:100,serviceIds:['men']}};assert.equal((await ask()).status,400);
  });
  await t.test('abrir una vacante no se convierte en cerrar el fin de semana aunque el modelo se equivoque',async()=>{
   intent={action:'weekend_off',startDate:'2027-01-10',endDateExclusive:'2027-01-11',offer:null};
   const result=await owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'quiero que abras una vacante para el domingo después de las 12'}});
   assert.equal(result.status,200);assert.equal(result.data.request.status,'done');assert.match(result.data.request.output.text,/No hice cambios/);assert.match(result.data.request.output.text,/todavía no puede retirar bloqueos/);assert.equal(result.data.request.output.canConfirm,undefined);
   intent={action:'help',startDate:null,endDateExclusive:null,offer:null};const explained=await owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'quiero que abras una vacante para el domingo después de las 12'}});assert.equal(explained.status,200);assert.match(explained.data.request.output.text,/todavía no puede retirar bloqueos/);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM calendar_entries WHERE kind='block'")).rows[0].n,0);
  });
  await t.test('conversación aislada por dueño/hilo, órdenes previas sin respuestas ni registros',async()=>{
   const threadId=randomUUID(),send=command=>owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command,threadId}});
   intent={action:'create_offer',startDate:null,endDateExclusive:null,offer:null};assert.equal((await send('Prepara una oferta')).data.request.output.needsInput,true);assert.deepEqual(contexts.at(-1).previousOrders,[]);
   intent={action:'create_offer',startDate:'2027-01-04',endDateExclusive:'2027-01-11',offer:{percent:10,serviceIds:['kids']}};const result=await send('10% para niños desde hoy hasta domingo');assert.equal(result.data.request.status,'proposed');assert.deepEqual(contexts.at(-1).previousOrders,['Prepara una oferta']);assert.deepEqual(Object.keys(contexts.at(-1)).sort(),['previousOrders','timezone','today']);assert.equal((await pool.query('SELECT count(*)::int AS n FROM offers')).rows[0].n,1);
   intent={action:'help',startDate:null,endDateExclusive:null,offer:null};await owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'Hola',threadId:randomUUID()}});assert.deepEqual(contexts.at(-1).previousOrders,[]);
   assert.equal((await owner('/api/admin/gocho/request',{method:'POST',body:{mode:'natural',idempotencyKey:randomUUID(),command:'Hola',threadId:'bad'}})).status,400);
  });
  await t.test('precio/servicio cambiado y propuesta vencida impiden publicar',async()=>{
   intent={action:'create_offer',startDate:'2027-01-04',endDateExclusive:'2027-01-11',offer:{percent:15,serviceIds:['men']}};const pending=(await ask()).data.request;
   await pool.query("UPDATE services SET data=data || '{\"priceCents\":3600}'::jsonb WHERE id='men'");assert.equal((await confirm(pending.id)).status,409);
   const expiring=(await ask()).data.request;now+=15*60000;assert.equal((await confirm(expiring.id)).status,409);
   await pool.query("UPDATE services SET data=data || '{\"active\":false}'::jsonb WHERE id='men'");assert.equal((await ask()).status,409);assert.equal((await pool.query('SELECT count(*)::int AS n FROM offers')).rows[0].n,1);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
