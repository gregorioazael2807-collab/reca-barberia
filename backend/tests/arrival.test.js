import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
test('llegada y cobro: autorización, ingreso atómico único y precio acordado',async t=>{
 const database='reca_arrival_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
 const pool=makePool(database);let server,now=Date.parse('2027-01-10T12:00:00Z');
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,rateLimit:200,clock:()=>now});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{
   const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
   if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};
  };}
  const owner=client(),customer=client(),anonymous=client();
  await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Arrival owner',password:'Private arrival owner password!'}});
  const registered=await customer('/api/auth/register',{method:'POST',body:{name:'Arrival customer',email:'arrival@example.test',password:'Private arrival customer password!'}});
  const userId=(await pool.query("SELECT id FROM users WHERE email='arrival@example.test'")).rows[0].id;
  assert.equal(registered.status,200);
  await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/New_York\"}'::jsonb");
  const snapshot={timezone:'America/New_York',city:'Test',cancellationNoticeMinutes:0,bookingSpacingMinutes:60,service:{id:'men',name:{es:'Corte',en:'Haircut'},priceCents:2625},discount:{type:'referral',percent:25,originalPriceCents:3500}};
  let slot=0;
  async function booking({status='confirmed',price=2625,start}={}){
   const id=randomUUID(),at=start??Date.parse('2027-01-10T15:00:00Z')+slot++*3600000;
   await pool.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot,expires_at) VALUES($1,$2,'booking',$3,$4,$5,$5,$6,$7)",[id,userId,status,new Date(at),new Date(at+3600000),JSON.stringify({...snapshot,service:{...snapshot.service,priceCents:price}}),status==='held'?new Date(now+600000):null]);return id;
  }
  const id=await booking(),arrive=(who,id,body={received:true},headers)=>who(`/api/admin/bookings/${id}/arrive`,{method:'POST',body,headers});
  const income=async()=> (await owner('/api/admin/finance?start=2027-01-04')).data;
  await t.test('reservar no cobra; solo dueño con CSRF y confirmación expresa',async()=>{
   assert.equal((await income()).incomeCents,0);
   assert.equal((await arrive(anonymous,id)).status,401);assert.equal((await arrive(customer,id)).status,403);
   assert.equal((await arrive(owner,id,{received:true},{'X-CSRF-Token':'bad'})).status,403);
   assert.equal((await arrive(owner,id,{})).status,400);assert.equal((await arrive(owner,id,{received:false})).status,400);
   assert.equal((await income()).incomeCents,0);
  });
  let entryId;
  await t.test('concurrencia y reintentos registran exactamente el importe congelado con descuento',async()=>{
   await pool.query("UPDATE services SET data=data || '{\"priceCents\":99999}'::jsonb");
   const results=await Promise.all(Array.from({length:4},()=>arrive(owner,id,{received:true,amountCents:1})));
   for(const result of results){assert.equal(result.status,200);assert.equal(result.data.receivedAmountCents,2625);assert.ok(result.data.arrivedAt);assert.equal(result.data.status,'confirmed');}
   const entries=(await pool.query('SELECT * FROM finance_entries WHERE booking_id=$1',[id])).rows;assert.equal(entries.length,1);entryId=entries[0].id;
   assert.equal(entries[0].amount_cents,2625);assert.equal(entries[0].occurred_at.getTime(),now);assert.equal(entries[0].local_date,'2027-01-10');assert.equal(entries[0].payment_method,'other');
   assert.equal((await income()).incomeCents,2625);
   const row=(await pool.query('SELECT * FROM calendar_entries WHERE id=$1',[id])).rows[0];assert.ok(row.arrival_confirmed_by);assert.equal(row.arrival_finance_entry_id,entryId);
   const visible=(await customer('/api/bookings')).data.bookings.find(b=>b.id===id);assert.ok(visible.arrivedAt);assert.equal(visible.receivedAmountCents,2625);
  });
  await t.test('una cita cobrada no se cambia/cancela ni acepta otro cobro manual vinculado',async()=>{
   assert.equal((await customer(`/api/bookings/${id}/cancel`,{method:'POST',body:{}})).status,409);
   assert.equal((await owner(`/api/bookings/${id}/cancel`,{method:'POST',body:{}})).status,409);
   assert.equal((await customer(`/api/bookings/${id}/reschedule`,{method:'PATCH',body:{start:'2027-01-10T20:00:00Z'}})).status,409);
   assert.equal((await owner('/api/admin/finance/entries',{method:'POST',body:{idempotencyKey:randomUUID(),kind:'income',amountCents:2625,date:'2027-01-10',category:'Cortes',note:'Duplicate',paymentMethod:'cash',settled:true,bookingId:id}})).status,409);
  });
  await t.test('se rechazan días distintos, bloqueos, retenciones, canceladas y citas atendidas antiguas',async()=>{
   for(const options of [{start:Date.parse('2027-01-11T15:00Z')},{start:Date.parse('2027-01-09T15:00Z')},{status:'cancelled'},{status:'completed'},{status:'held'}]){
    const other=await booking(options);assert.equal((await arrive(owner,other)).status,409);
   }
   const block=randomUUID();await pool.query("INSERT INTO calendar_entries(id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,'block','blocked','2027-01-12T15:00Z','2027-01-12T16:00Z','2027-01-12T16:00Z','{}')",[block]);assert.equal((await arrive(owner,block)).status,404);
   assert.equal((await arrive(owner,randomUUID())).status,404);
  });
  await t.test('no duplica cobros manuales previos; importe cero confirma sin movimiento ficticio',async()=>{
   const manual=await booking();await pool.query("INSERT INTO finance_entries(id,idempotency_key,kind,amount_cents,occurred_at,local_date,category,note,payment_method,booking_id) VALUES($1,$2,'income',2625,$3,'2027-01-10','Cortes','','cash',$4)",[randomUUID(),randomUUID(),new Date(now),manual]);assert.equal((await arrive(owner,manual)).status,409);
   const zero=await booking({price:0});assert.equal((await arrive(owner,zero)).data.receivedAmountCents,0);assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[zero])).rows[0].n,0);
  });
  await t.test('error posterior a insertar ingreso revierte también el ingreso',async()=>{
   const failed=await booking();
   await pool.query(`CREATE FUNCTION fail_arrival() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${failed}'::uuid AND NEW.arrived_at IS NOT NULL THEN RAISE EXCEPTION 'isolated rollback check'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_arrival BEFORE UPDATE ON calendar_entries FOR EACH ROW EXECUTE FUNCTION fail_arrival()`);
   assert.equal((await arrive(owner,failed)).status,500);
   assert.equal((await pool.query('SELECT arrived_at FROM calendar_entries WHERE id=$1',[failed])).rows[0].arrived_at,null);
   assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[failed])).rows[0].n,0);
   await pool.query('DROP TRIGGER fail_arrival ON calendar_entries; DROP FUNCTION fail_arrival()');
  });
  await t.test('el ingreso usa el día local de la barbería, no el día UTC del servidor',async()=>{
   now=Date.parse('2027-01-11T02:00Z');
   const late=await booking({start:Date.parse('2027-01-10T23:00Z')});assert.equal((await arrive(owner,late)).status,200);
   const entry=(await pool.query('SELECT local_date,occurred_at FROM finance_entries WHERE booking_id=$1',[late])).rows[0];assert.equal(entry.local_date,'2027-01-10');assert.equal(entry.occurred_at.toISOString(),'2027-01-11T02:00:00.000Z');
   assert.ok((await income()).entries.some(entry=>entry.bookingId===late));
  });
  await t.test('atender no cobra otra vez; anulación auditable no se deshace con reintentos',async()=>{
   now=Date.parse('2027-01-10T17:00Z');assert.equal((await owner(`/api/admin/bookings/${id}/complete`,{method:'POST',body:{}})).status,200);
   assert.equal((await arrive(owner,id)).status,200);assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[id])).rows[0].n,1);
   await owner('/api/admin/finance/entries/'+entryId+'/void',{method:'POST',body:{reason:'Arrival recorded in error'}});
   assert.equal((await arrive(owner,id)).status,200);assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[id])).rows[0].n,1);
   assert.ok((await pool.query('SELECT voided_at FROM finance_entries WHERE id=$1',[entryId])).rows[0].voided_at);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();}
});
