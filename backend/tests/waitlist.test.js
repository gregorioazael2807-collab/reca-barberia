import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';

test('lista de espera real: consentimiento, vacantes, deduplicación, privacidad y competencia sin envíos',async t=>{
  const name='reca_waitlist_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
  await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name);let server,now=Date.parse('2027-01-10T12:00:00Z');
  try{
    await initialize(pool);const setupToken=token(),automationToken=token();
    const app=createApp(pool,{setupToken,automationToken,rateLimit:100,clock:()=>now});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{
      const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};
    };}
    const owner=client(),a=client(),b=client(),anonymous=client();
    await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private waitlist owner password!'}});
    for(const [client,email] of [[a,'a@example.test'],[b,'b@example.test']])await client('/api/auth/register',{method:'POST',body:{name:email,email,password:'Private waitlist client password!'}});
    await owner('/api/admin/settings',{method:'PATCH',body:{city:'Tampa, Florida',timezone:'America/New_York',cancellationNoticeMinutes:300,bookingNoticeMinutes:0,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))}});
    await pool.query("UPDATE services SET data=data || '{\"priceCents\":3500}'::jsonb");
    const held=await b('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-11T15:00:00Z'}});assert.equal(held.status,201);
    await b(`/api/holds/${held.data.id}/confirm`,{method:'POST',body:{}});
    const preference={serviceId:'men',date:'2027-01-11',from:'10:00',to:'10:00',emailConsent:true,whatsappConsent:false};let entryA,entryB;
    await t.test('requiere cuenta de cliente, CSRF, fechas válidas y consentimiento explícito',async()=>{
      assert.equal((await anonymous('/api/waitlist')).status,401);
      assert.equal((await owner('/api/waitlist')).status,403);
      assert.equal((await a('/api/admin/waitlist')).status,403);
      assert.equal((await a('/api/waitlist',{method:'POST',body:preference,headers:{'X-CSRF-Token':'wrong'}})).status,403);
      for(const body of [{...preference,emailConsent:false},{...preference,whatsappConsent:true,phone:'123'},{...preference,date:'2027-01-09'},{...preference,from:'25:00'},{...preference,from:'12:00',to:'10:00'}])assert.equal((await a('/api/waitlist',{method:'POST',body})).status,400);
    });
    await t.test('preferencias persistentes y privadas; apuntarse no ocupa la agenda',async()=>{
      const one=await a('/api/waitlist',{method:'POST',body:preference});assert.equal(one.status,201);entryA=one.data.entry;
      const two=await b('/api/waitlist',{method:'POST',body:{...preference,emailConsent:false,whatsappConsent:true,phone:'+18135551234'}});assert.equal(two.status,201);entryB=two.data.entry;
      assert.equal((await a('/api/waitlist')).data.entries.length,1);assert.equal((await a('/api/waitlist')).data.notices.length,0);
      assert.equal((await a('/api/waitlist')).data.entries[0].phone,null);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM calendar_entries')).rows[0].n,1);
      await a('/api/waitlist/'+entryB.id,{method:'DELETE'});assert.equal((await b('/api/waitlist')).data.entries.length,1);
      assert.equal((await a('/api/waitlist',{method:'POST',body:preference})).data.entry.id,entryA.id);
    });
    await t.test('cancelar libera aunque los envíos estén apagados; n8n prepara avisos únicos',async()=>{
      assert.equal((await b(`/api/bookings/${held.data.id}/cancel`,{method:'POST',body:{}})).status,200);
      for(let i=0;i<2;i++){
        const response=await fetch(base+'/api/automation/claim',{method:'POST',headers:{Authorization:`Bearer ${automationToken}`,'Content-Type':'application/json'},body:'{}'});
        assert.equal(response.status,200);assert.equal((await response.json()).canSend,false);
      }
      assert.equal((await a('/api/waitlist')).data.notices.length,1);
      const notices=(await pool.query('SELECT n.*,w.user_id FROM waitlist_notices n JOIN waitlist_subscriptions w ON w.id=n.subscription_id')).rows;assert.equal(notices.length,2);
      for(const row of notices){assert.equal(row.status,'prepared');assert.match(row.draft.emailText||row.draft.whatsappText,/no retiene ni garantiza/);}
      assert.equal((await owner('/api/admin/waitlist')).data.canSend,false);
    });
    await t.test('el aviso no garantiza la reserva; competidores no se solapan y el aviso obsoleto desaparece',async()=>{
      const results=await Promise.all([a,b].map(client=>client('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-11T15:00:00Z'}})));
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      assert.equal((await a('/api/waitlist')).data.notices.length,0);
      assert.equal((await b('/api/waitlist')).data.notices.length,0);
      now+=11*60000;
      await a('/api/waitlist');assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notices')).rows[0].n,2);
    });
    await t.test('salir limpia borradores y teléfono; eliminar cuenta elimina toda la lista',async()=>{
      await b('/api/waitlist/'+entryB.id,{method:'DELETE'});
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notices')).rows[0].n,1);
      assert.equal((await a('/api/me',{method:'DELETE'})).status,200);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_subscriptions')).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notices')).rows[0].n,0);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();}
});
