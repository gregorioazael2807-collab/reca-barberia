import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
import {localInstants,candidates} from '../bookings.js';

const service={id:'men',name:{es:'Corte de prueba',en:'Test haircut'},description:{es:'Prueba aislada',en:'Isolated test'},active:true,priceCents:2500,durationMinutes:40,cleaningMinutes:20};
const weekly=Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','14:00'],['16:00','20:00']]}));

test('zona horaria: cambio estacional, horas inexistentes y repetidas',()=>{
  assert.deepEqual(localInstants('2027-03-14','02:30','America/New_York'),[]);
  const repeated=localInstants('2027-11-07','01:30','America/New_York');assert.equal(repeated.length,2);assert.equal(repeated[1]-repeated[0],3600000);
  assert.equal(new Date(localInstants('2027-01-10','10:00','America/New_York')[0]).toISOString(),'2027-01-10T15:00:00.000Z');
  assert.equal(new Date(localInstants('2027-07-10','10:00','America/New_York')[0]).toISOString(),'2027-07-10T14:00:00.000Z');
  const config={timezone:'America/New_York',bookingNoticeMinutes:0,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['01:00','04:00']]}))};
  const slots=candidates(config,{...service,durationMinutes:20,cleaningMinutes:10},'2027-03-14',Date.parse('2027-03-13T00:00:00Z'));
  assert.ok(slots.every(s=>!s.start.startsWith('2027-03-14T06:')||Date.parse(s.end)<=Date.parse('2027-03-14T08:00:00Z')));
  assert.equal(slots.some(s=>s.start==='2027-03-14T07:00:00.000Z'),true);
  assert.equal(new Set(slots.map(s=>s.start)).size,slots.length);
});

test('tramo 3: reservas reales, concurrencia, cancelación y agenda',async t=>{
  const database='reca_booking_'+randomUUID().replaceAll('-','');
  const control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
  const pool=makePool(database),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-booking-'));
  let server,now=Date.parse('2027-01-10T12:00:00Z'); // 07:00 Tampa; auth still uses the database's real clock.
  try {
    await initialize(pool);const setupToken=token();const app=createApp(pool,{setupToken,uploads,rateLimit:100,clock:()=>now});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){let cookie='',csrf='';return async(url,{method='GET',body}={})=>{
      const response=await fetch(base+url,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};
    };}
    const owner=client(),a=client(),b=client(),anon=client();
    await owner('/api/auth/setup',{method:'POST',body:{name:'Owner test',password:'Private owner test password!'}}); // Missing token must not configure owner.
    const setupResponse=await fetch(base+'/api/auth/setup',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Setup-Token':setupToken},body:JSON.stringify({name:'Owner test',password:'Private owner test password!'})});assert.equal(setupResponse.status,200);
    assert.equal((await owner('/api/auth/owner-login',{method:'POST',body:{email:'demo-54b54911@example.com',password:'Private owner test password!'}})).status,200);
    for(const [user,address] of [[a,'a@example.test'],[b,'b@example.test']])assert.equal((await user('/api/auth/register',{method:'POST',body:{name:'Test customer',email:address,password:'Private customer test password!'}})).status,200);
    const availability=(user=a,date='2027-01-10')=>user(`/api/availability?serviceId=men&date=${date}`);
    const hold=(user,start,extra={})=>user('/api/holds',{method:'POST',body:{serviceId:'men',start,...extra}});
    const confirm=(user,id)=>user(`/api/holds/${id}/confirm`,{method:'POST',body:{}});
    let first;
    await t.test('configuración incompleta no inventa horarios; auth y campos se validan',async()=>{
      assert.equal((await availability(anon)).status,401);
      assert.equal((await availability()).data.ready,false);
      assert.equal((await hold(anon,'2027-01-10T15:00:00Z')).status,401);
      assert.equal((await hold(a,'2027-01-10T15:00:00Z')).status,409);
      assert.equal((await availability(a,'2027-02-31')).status,400);
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:'Tampa, Florida',timezone:'America/New_York',weekly,cancellationNoticeMinutes:300,bookingNoticeMinutes:0,bookingSpacingMinutes:60}})).status,200);
      assert.equal((await owner('/api/admin/services/men',{method:'PUT',body:service})).status,200);
      assert.equal((await hold(a,'bad')).status,400);
      assert.equal((await a('/api/availability?serviceId=no&date=2027-01-10')).status,400);
      assert.equal((await availability(a,'2028-01-10')).status,400);
    });
    await t.test('disponibilidad separa turnos una hora y excluye descansos/cierre',async()=>{
      const result=await availability();assert.equal(result.data.ready,true);assert.equal(result.data.timezone,'America/New_York');
      assert.equal(result.data.slots[0].start,'2027-01-10T15:00:00.000Z');assert.equal(result.data.slots[0].end,'2027-01-10T16:00:00.000Z');
      assert.equal(result.data.slots.some(s=>s.start==='2027-01-10T18:15:00.000Z'),false); // Would run after 14:00.
      assert.equal(result.data.slots.some(s=>s.start==='2027-01-10T20:00:00.000Z'),false); // Lunch break.
      assert.equal((await hold(a,'2027-01-10T15:00:00Z',{referenceId:'kids-classic'})).status,400);
    });
    await t.test('dos clientes compiten por un turno: solo uno gana',async()=>{
      const responses=await Promise.all([hold(a,'2027-01-10T15:00:00Z'),hold(b,'2027-01-10T15:00:00Z')]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
      const winner=responses[0].status===201?a:b;first=responses.find(r=>r.status===201).data;
      first.user=winner;assert.equal((await confirm(winner,first.id)).status,200);assert.equal((await confirm(winner,first.id)).status,200);
      assert.equal((await pool.query("SELECT count(*) FROM calendar_entries WHERE status='confirmed'")).rows[0].count,'1');
    });
    await t.test('PostgreSQL rechaza solapamientos incluso sin pasar por la API',async()=>{
      await assert.rejects(pool.query("INSERT INTO calendar_entries(id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,'block','blocked','2027-01-10T15:30:00Z','2027-01-10T16:30:00Z','2027-01-10T16:30:00Z','{}')",[randomUUID()]),{code:'23P01'});
      assert.equal((await hold(a,'2027-01-10T15:45:00Z')).status,409); // The first booking occupies the full hour.
      const adjacent=await hold(a,'2027-01-10T16:00:00Z');assert.equal(adjacent.status,201);assert.equal((await a(`/api/holds/${adjacent.data.id}`,{method:'DELETE'})).status,200);
    });
    await t.test('aislamiento de citas, privacidad y prohibición de administrar',async()=>{
      const other=first.user===a?b:a;
      assert.equal((await other(`/api/bookings/${first.id}/cancel`,{method:'POST',body:{}})).status,404);
      assert.equal((await other(`/api/bookings/${first.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-11T15:00:00Z'}})).status,404);
      assert.equal((await other('/api/bookings')).data.bookings.length,0);
      assert.equal((await a('/api/admin/calendar')).status,403);
      assert.equal((await a('/api/admin/blocks',{method:'POST',body:{}})).status,403);
      assert.equal(JSON.stringify((await availability()).data).includes('example.test'),false);
      assert.equal((await first.user('/api/me',{method:'DELETE'})).status,409);
    });
    await t.test('caducidad del servidor libera el turno; confirmar caducado falla',async()=>{
      const r=await hold(a,'2027-01-10T16:00:00Z');assert.equal(r.status,201);
      assert.equal((await a('/api/holds')).data.hold.id,r.data.id);
      now+=10*60000;
      assert.equal((await confirm(a,r.data.id)).status,409);
      assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[r.data.id])).rows[0].status,'expired');
      assert.equal((await availability()).data.slots.some(s=>s.start==='2027-01-10T16:00:00.000Z'),true);
      now=Date.parse('2027-01-10T12:00:00Z');
    });
    await t.test('bloqueos reales excluyen disponibilidad; retirar libera; cruces se rechazan',async()=>{
      const body={start:'2027-01-10T17:00:00Z',end:'2027-01-10T18:00:00Z',reason:'Test break'};
      const block=await owner('/api/admin/blocks',{method:'POST',body});assert.equal(block.status,201);
      assert.equal((await availability()).data.slots.some(s=>s.start==='2027-01-10T17:00:00.000Z'),false);
      assert.equal((await hold(b,body.start)).status,409);
      assert.equal((await owner('/api/admin/blocks',{method:'POST',body:{...body,start:'2027-01-10T15:00:00Z'}})).status,409);
      assert.equal((await owner(`/api/admin/blocks/${block.data.id}`,{method:'DELETE'})).status,200);
      assert.equal((await availability()).data.slots.some(s=>s.start===body.start.replace('Z','.000Z')),true);
      const local=await owner('/api/admin/blocks',{method:'POST',body:{startLocal:'2027-01-11T10:00',endLocal:'2027-01-11T11:00',reason:'Local time'}});assert.equal(local.status,201);assert.equal(local.data.start,'2027-01-11T15:00:00.000Z');
      await owner(`/api/admin/blocks/${local.data.id}`,{method:'DELETE'});
    });
    await t.test('5 horas: dentro del plazo se rechaza; el límite exacto se permite',async()=>{
      const held=await hold(a,'2027-01-11T15:00:00Z');assert.equal(held.status,201);await confirm(a,held.data.id);
      now=Date.parse('2027-01-11T10:00:00.001Z');
      assert.equal((await a(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,409);
      assert.equal((await a(`/api/bookings/${held.data.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-12T15:00:00Z'}})).status,409);
      now=Date.parse('2027-01-11T10:00:00Z');
      assert.equal((await a(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,200);
      assert.equal((await a(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,200);
      assert.equal((await availability(a,'2027-01-11')).data.slots.some(s=>s.start==='2027-01-11T15:00:00.000Z'),true);
      assert.equal((await a('/api/bookings')).data.bookings.some(e=>e.id===held.data.id),false);
      assert.equal((await owner('/api/admin/calendar')).data.entries.some(e=>e.id===held.data.id),false);
      assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[held.data.id])).rows[0].status,'cancelled');
      now=Date.parse('2027-01-10T12:00:00Z');
    });
    await t.test('reprogramación atómica conserva precio/separación y cita original si falla',async()=>{
      const held=await hold(a,'2027-01-12T15:00:00Z');await confirm(a,held.data.id);
      const blocked=await owner('/api/admin/blocks',{method:'POST',body:{start:'2027-01-12T17:00:00Z',end:'2027-01-12T18:00:00Z',reason:'Busy'}});
      assert.equal((await a(`/api/bookings/${held.data.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-12T17:00:00Z'}})).status,409);
      assert.equal((await a('/api/bookings')).data.bookings.find(x=>x.id===held.data.id).start,'2027-01-12T15:00:00.000Z');
      await owner('/api/admin/services/men',{method:'PUT',body:{...service,priceCents:3000,durationMinutes:30}});
      const changed=await a(`/api/bookings/${held.data.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-12T16:00:00Z'}});assert.equal(changed.status,200);assert.equal(changed.data.snapshot.service.priceCents,2500);assert.equal(changed.data.end,'2027-01-12T17:00:00.000Z');
      assert.equal((await availability(a,'2027-01-12')).data.slots.some(s=>s.start==='2027-01-12T15:00:00.000Z'),true);
      await owner(`/api/admin/blocks/${blocked.data.id}`,{method:'DELETE'});
      await owner('/api/admin/services/men',{method:'PUT',body:service});
    });
    await t.test('anticipación, día cerrado y servicio desactivado se respetan',async()=>{
      now=Date.parse('2027-01-15T14:30:00Z');
      await owner('/api/admin/settings',{method:'PATCH',body:{bookingNoticeMinutes:60}});
      const slots=(await availability(a,'2027-01-15')).data.slots;assert.equal(slots[0].start,'2027-01-15T15:30:00.000Z');
      assert.equal((await hold(a,'2027-01-15T15:00:00Z')).status,409);
      assert.equal((await availability(a,'2027-01-14')).status,400);
      const closed=structuredClone(weekly);closed[5]={day:5,closed:true,intervals:[]};
      await owner('/api/admin/settings',{method:'PATCH',body:{weekly:closed}});assert.equal((await availability(a,'2027-01-15')).data.slots.length,0);
      await owner('/api/admin/settings',{method:'PATCH',body:{weekly,bookingNoticeMinutes:0}});
      await owner('/api/admin/services/men',{method:'PUT',body:{...service,active:false}});assert.equal((await availability(a,'2027-01-15')).data.ready,false);
      await owner('/api/admin/services/men',{method:'PUT',body:service});now=Date.parse('2027-01-10T12:00:00Z');
    });
    await t.test('mínimo una hora se impone en servidor, independiente del corte',async()=>{
      for(const invalid of [0,30,59,60.5,'60'])assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{bookingSpacingMinutes:invalid}})).status,400);
      const h=await hold(a,'2027-01-18T15:00:00Z');assert.equal(h.status,201);assert.equal(h.data.end,'2027-01-18T16:00:00.000Z');assert.equal(h.data.snapshot.bookingSpacingMinutes,60);assert.equal(Object.hasOwn(h.data.snapshot.service,'durationMinutes'),false);
      for(const start of ['2027-01-18T15:15:00Z','2027-01-18T15:30:00Z','2027-01-18T15:45:00Z'])assert.equal((await hold(b,start)).status,409);
      const adjacent=await hold(b,'2027-01-18T16:00:00Z');assert.equal(adjacent.status,201);
      await a(`/api/holds/${h.data.id}`,{method:'DELETE'});await b(`/api/holds/${adjacent.data.id}`,{method:'DELETE'});
    });
    await t.test('selecciones sustituidas y reintentos no producen varias retenciones',async()=>{
      const original=await hold(a,'2027-01-16T15:00:00Z');assert.equal(original.status,201);
      const busy=await hold(b,'2027-01-16T17:00:00Z');assert.equal(busy.status,201);
      assert.equal((await hold(a,'2027-01-16T17:00:00Z')).status,409);
      assert.equal((await a('/api/holds')).data.hold.id,original.data.id); // Failed replacement rolls back.
      const replaced=await hold(a,'2027-01-16T16:00:00Z');assert.equal(replaced.status,201);
      assert.equal((await confirm(a,original.data.id)).status,409);
      assert.equal((await pool.query("SELECT count(*) FROM calendar_entries WHERE user_id=(SELECT id FROM users WHERE email='a@example.test') AND status='held'")).rows[0].count,'1');
      await a(`/api/holds/${replaced.data.id}`,{method:'DELETE'});await b(`/api/holds/${busy.data.id}`,{method:'DELETE'});
      const race=await Promise.all([hold(a,'2027-01-16T15:00:00Z'),hold(b,'2027-01-16T15:15:00Z')]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
      await (race[0].status===201?a:b)(`/api/holds/${race.find(r=>r.status===201).data.id}`,{method:'DELETE'});
    });
    await t.test('condiciones confirmadas no cambian retroactivamente; dueño resuelve excepciones',async()=>{
      const held=await hold(a,'2027-01-17T15:00:00Z');await confirm(a,held.data.id);
      await owner('/api/admin/settings',{method:'PATCH',body:{cancellationNoticeMinutes:60}});
      now=Date.parse('2027-01-17T12:00:00Z');
      assert.equal((await a(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,409);
      assert.equal((await owner(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,200);
      await owner('/api/admin/settings',{method:'PATCH',body:{cancellationNoticeMinutes:300}});now=Date.parse('2027-01-10T12:00:00Z');
    });
    await t.test('agenda del dueño persiste; atendida solo después del servicio',async()=>{
      assert.equal((await owner(`/api/admin/bookings/${first.id}/complete`,{method:'POST',body:{}})).status,409);
      await initialize(pool);assert.ok((await owner('/api/admin/calendar')).data.entries.some(e=>e.id===first.id&&e.customer.email));
      now=Date.parse('2027-01-10T16:00:00Z');assert.equal((await owner(`/api/admin/bookings/${first.id}/complete`,{method:'POST',body:{}})).status,200);
      assert.equal((await first.user('/api/bookings')).data.bookings.find(e=>e.id===first.id).status,'completed');
      assert.equal((await first.user(`/api/bookings/${first.id}/cancel`,{method:'POST',body:{}})).status,409);
    });
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});
  }
});
