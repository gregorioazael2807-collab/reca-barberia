import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
test('finanzas privadas: cobros reales, gastos, idempotencia, semana, plan y anulaciones auditables',async t=>{
 const name='reca_finance_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name);let server;
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,rateLimit:100,clock:()=>Date.parse('2027-01-10T12:00:00Z')});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client(),anonymous=client();await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private finance owner password!'}});await customer('/api/auth/register',{method:'POST',body:{name:'Client isolated',email:'finance@example.test',password:'Private finance client password!'}});await owner('/api/admin/settings',{method:'PATCH',body:{timezone:'America/New_York'}});
  const payment={idempotencyKey:randomUUID(),kind:'income',amountCents:3500,date:'2027-01-04',category:'Cortes',note:'Cobro real de prueba aislada',paymentMethod:'cash',settled:true};let incomeId,expenseId;
  await t.test('solo dueño, CSRF y confirmación de efectivo recibido/pagado',async()=>{
   assert.equal((await anonymous('/api/admin/finance?start=2027-01-04')).status,401);assert.equal((await customer('/api/admin/finance?start=2027-01-04')).status,403);
   assert.equal((await customer('/api/admin/finance/entries',{method:'POST',body:payment})).status,403);assert.equal((await owner('/api/admin/finance/entries',{method:'POST',body:payment,headers:{'X-CSRF-Token':'bad'}})).status,403);
   for(const body of [{...payment,settled:false},{...payment,date:'2027-01-11'},{...payment,amountCents:0},{...payment,amountCents:35.5}])assert.equal((await owner('/api/admin/finance/entries',{method:'POST',body})).status,400);
   assert.equal((await owner('/api/admin/finance?start=2027-01-04')).data.incomeCents,0);
  });
  await t.test('dos solicitudes iguales no duplican un cobro; importes en centavos exactos',async()=>{
   const results=await Promise.all([owner('/api/admin/finance/entries',{method:'POST',body:payment}),owner('/api/admin/finance/entries',{method:'POST',body:payment})]);assert.equal(results[0].status,201);assert.equal(results[0].data.entry.id,results[1].data.entry.id);incomeId=results[0].data.entry.id;assert.equal((await pool.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,1);
   assert.equal((await owner('/api/admin/finance/entries',{method:'POST',body:{...payment,amountCents:1}})).status,409);
   const expense=await owner('/api/admin/finance/entries',{method:'POST',body:{...payment,idempotencyKey:randomUUID(),kind:'expense',amountCents:1000,category:'Materiales'}});expenseId=expense.data.entry.id;
   await owner('/api/admin/finance/entries',{method:'POST',body:{...payment,idempotencyKey:randomUUID(),amountCents:2500,date:'2027-01-10'}});
   await owner('/api/admin/finance/entries',{method:'POST',body:{...payment,idempotencyKey:randomUUID(),kind:'expense',amountCents:9999,date:'2027-01-03'}});
   const report=(await owner('/api/admin/finance?start=2027-01-04')).data;assert.equal(report.incomeCents,6000);assert.equal(report.expenseCents,1000);assert.equal(report.balanceCents,5000);assert.equal(report.endExclusive,'2027-01-11');assert.equal(report.count,3);assert.equal(report.categories.find(c=>c.category==='Materiales').amountCents,1000);
  });
  await t.test('plan separado de cifras reales y sin metas inventadas',async()=>{
   assert.equal((await owner('/api/admin/finance?start=2027-01-04')).data.plan,null);
   assert.equal((await owner('/api/admin/finance/plan',{method:'PUT',body:{start:'2027-01-04',incomeTargetCents:10000,expenseLimitCents:2000,note:'Meta privada, no garantizada'}})).status,200);
   const report=(await owner('/api/admin/finance?start=2027-01-04')).data;assert.equal(report.plan.incomeTargetCents,10000);assert.equal(report.incomeCents,6000);assert.equal(report.expenseCents,1000);
  });
  await t.test('anular conserva original/motivo y recalcula saldo, sin borrar historia',async()=>{
   assert.equal((await owner('/api/admin/finance/entries/'+expenseId+'/void',{method:'POST',body:{reason:'Registro equivocado'}})).status,200);
   await owner('/api/admin/finance/entries/'+expenseId+'/void',{method:'POST',body:{reason:'No sobrescribir motivo'}});
   const report=(await owner('/api/admin/finance?start=2027-01-04')).data;assert.equal(report.expenseCents,0);assert.equal(report.balanceCents,6000);assert.equal(report.entries.find(e=>e.id===expenseId).voidReason,'Registro equivocado');assert.ok(report.entries.find(e=>e.id===expenseId).voidedAt);assert.ok(report.entries.find(e=>e.id===incomeId));
   assert.equal((await customer('/api/public')).data.settings.finance,undefined);
  });
  await t.test('citas por cobrar: clientes únicos, precio con descuento, todas las fechas y sin ingresos ficticios',async()=>{
   const userId=(await pool.query("SELECT id FROM users WHERE email='finance@example.test'")).rows[0].id;
   const other=client();const second=(await other('/api/auth/register',{method:'POST',body:{name:'Another client',email:'pending-finance@example.test',password:'Private pending client password!'}})).data.user.id;
   let day=10;
   const booking=async({status='confirmed',price=4000,user=userId,kind='booking'}={})=>{
    const id=randomUUID(),date=`2027-01-${String(day++).padStart(2,'0')}`,snapshot={timezone:'America/New_York',cancellationNoticeMinutes:0,service:{id:'men',name:{es:'Corte',en:'Haircut'},...(price===null?{}:{priceCents:price})},...(price===2625?{discount:{type:'referral',percent:25,originalPriceCents:3500}}:{})};
    await pool.query('INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,expires_at,snapshot) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8)',[id,user,kind,status,new Date(date+'T16:00Z'),new Date(date+'T17:00Z'),status==='held'?new Date('2027-01-10T12:10Z'):null,JSON.stringify(snapshot)]);return id;
   };
   const discounted=await booking({price:2625}),cancel=await booking(),manual=await booking({price:2500,user:second});
   await booking({status:'cancelled'});await booking({status:'held'});await booking({status:'expired'});await booking({status:'completed'});await booking({kind:'block',status:'blocked'});await booking({price:null});
   const ledgerBefore=(await pool.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n;
   const report=(await owner('/api/admin/finance?start=2027-01-04')).data;
   assert.deepEqual(report.pendingBookings,{bookingCount:4,customerCount:2,amountCents:9125,unpricedCount:1});assert.equal(report.incomeCents,6000);
   assert.deepEqual((await owner('/api/admin/finance?start=2027-02-01')).data.pendingBookings,report.pendingBookings);
   assert.deepEqual((await owner('/api/admin/calendar')).data.pendingBookings,report.pendingBookings);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,ledgerBefore);
   assert.equal((await owner(`/api/admin/bookings/${discounted}/arrive`,{method:'POST',body:{received:true}})).status,200);
   assert.equal((await owner(`/api/admin/bookings/${discounted}/arrive`,{method:'POST',body:{received:true}})).status,200);
   const arrived=(await owner('/api/admin/finance?start=2027-01-04')).data;assert.equal(arrived.pendingBookings.amountCents,6500);assert.equal(arrived.pendingBookings.bookingCount,3);assert.equal(arrived.incomeCents,8625);
   assert.equal((await owner(`/api/bookings/${cancel}/cancel`,{method:'POST',body:{}})).status,200);
   assert.equal((await owner('/api/admin/calendar')).data.pendingBookings.amountCents,2500);
   const paid=await owner('/api/admin/finance/entries',{method:'POST',body:{...payment,idempotencyKey:randomUUID(),bookingId:manual,amountCents:2500,date:'2027-01-10'}});assert.equal(paid.status,201);
   const pending=(await owner('/api/admin/finance?start=2027-01-04')).data.pendingBookings;assert.equal(pending.amountCents,0);assert.equal(pending.bookingCount,1);assert.equal(pending.unpricedCount,1);
   await owner('/api/admin/finance/entries/'+paid.data.entry.id+'/void',{method:'POST',body:{reason:'Corrección aislada'}});
   assert.equal((await owner('/api/admin/finance?start=2027-01-04')).data.pendingBookings.amountCents,2500);
   const publicData=(await customer('/api/public')).data;assert.equal(publicData.pendingBookings,undefined);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();}
});
