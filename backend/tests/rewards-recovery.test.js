import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token,digest} from '../security.js';

test('recuperación y recomendaciones: base aislada, cero envíos',async t=>{
  const database='reca_rewards_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
  await control.query(`CREATE DATABASE "${database}"`);const pool=makePool(database);let server;
  let now=Date.parse('2027-01-10T12:00:00Z');const drafts=new Map();
  try{
    await initialize(pool);const setupToken=token();
    const app=createApp(pool,{setupToken,rateLimit:200,clock:()=>now,saveRecoveryDraft:async draft=>drafts.set(draft.userId,draft),removeRecoveryDrafts:async id=>drafts.delete(id)});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{
      const response=await fetch(base+url,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
      const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};
    };}
    const owner=client(),referrer=client(),referred=client(),anonymous=client();const secret='Private isolated test password!';
    assert.equal((await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Dueño aislado',password:secret}})).status,200);
    assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:'Tampa, Florida',timezone:'America/New_York',bookingNoticeMinutes:0,cancellationNoticeMinutes:300,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))}})).status,200);
    await owner('/api/admin/services/men',{method:'PUT',body:{name:{es:'Corte',en:'Haircut'},description:{es:'Prueba',en:'Test'},priceCents:3500,active:true}});
    const registration=await referrer('/api/auth/register',{method:'POST',body:{email:'referrer@example.test',name:'Recomendador',password:secret}});const referrerId=registration.data.user.id;
    let code,booking;
    async function reserve(who,start,useReferralReward=false){
      const hold=await who('/api/holds',{method:'POST',body:{serviceId:'men',start}});assert.equal(hold.status,201);
      return who(`/api/holds/${hold.data.id}/confirm`,{method:'POST',body:{useReferralReward}});
    }
    await t.test('QR privado por cliente, sin datos personales ni puntos ficticios',async()=>{
      assert.equal((await anonymous('/api/referrals')).status,401);assert.equal((await owner('/api/referrals')).status,403);
      const info=(await referrer('/api/referrals')).data;code=info.code;
      assert.equal(info.points,0);assert.equal(info.availableRewards,0);assert.equal(info.publicSharingReady,false);
      assert.equal(info.url,`${base}/#ref/${code}`);assert.match(info.qrDataUrl,/^data:image\/png;base64,/);
      assert.equal((await referrer('/api/referrals')).data.code,code);assert.equal(info.url.includes('example.test'),false);
    });
    await t.test('solo registro nuevo con código válido; no se acredita al reservar',async()=>{
      const invalid=await anonymous('/api/auth/register',{method:'POST',body:{email:'bad@example.test',name:'Inválido',password:secret,referralCode:'f'.repeat(32)}});assert.equal(invalid.status,400);
      assert.equal((await pool.query("SELECT 1 FROM users WHERE email='bad@example.test'")).rowCount,0);
      assert.equal((await referred('/api/auth/register',{method:'POST',body:{email:'referred@example.test',name:'Recomendado',password:secret,referralCode:code}})).status,200);
      booking=(await reserve(referred,'2027-01-11T15:00:00Z')).data;
      assert.equal((await referrer('/api/referrals')).data.points,0);
      assert.equal((await referred(`/api/admin/bookings/${booking.id}/complete`,{method:'POST',body:{}})).status,403);
      assert.equal((await owner(`/api/admin/bookings/${booking.id}/complete`,{method:'POST',body:{}})).status,409);
      assert.equal((await referrer('/api/me',{method:'PATCH',body:{referralCode:code}})).status,400);
    });
    await t.test('corte atendido: un punto y un descuento, aun con reintentos concurrentes',async()=>{
      now=Date.parse('2027-01-11T16:01:00Z');
      const responses=await Promise.all([owner(`/api/admin/bookings/${booking.id}/complete`,{method:'POST',body:{}}),owner(`/api/admin/bookings/${booking.id}/complete`,{method:'POST',body:{}})]);
      assert.ok(responses.every(r=>r.status===200));
      const summary=(await referrer('/api/referrals')).data;assert.equal(summary.points,1);assert.equal(summary.availableRewards,1);
      const repeat=(await reserve(referred,'2027-01-12T15:00:00Z')).data;
      now=Date.parse('2027-01-12T16:01:00Z');assert.equal((await owner(`/api/admin/bookings/${repeat.id}/complete`,{method:'POST',body:{}})).status,200);
      assert.equal((await referrer('/api/referrals')).data.points,1);
    });
    await t.test('25 % real, un solo uso, precio congelado y devolución al cancelar',async()=>{
      const discounted=await reserve(referrer,'2027-01-13T15:00:00Z',true);assert.equal(discounted.status,200);
      assert.equal(discounted.data.snapshot.service.priceCents,2625);assert.equal(discounted.data.snapshot.discount.originalPriceCents,3500);
      assert.equal((await referrer('/api/referrals')).data.availableRewards,0);
      const hold=await referrer('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-14T15:00:00Z'}});
      assert.equal((await referrer(`/api/holds/${hold.data.id}/confirm`,{method:'POST',body:{useReferralReward:true}})).status,409);
      assert.equal((await referrer(`/api/bookings/${discounted.data.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-13T16:00:00Z'}})).data.snapshot.service.priceCents,2625);
      assert.equal((await referrer(`/api/bookings/${discounted.data.id}/cancel`,{method:'POST',body:{}})).status,200);
      assert.equal((await referrer('/api/referrals')).data.availableRewards,1);
      assert.equal((await referrer(`/api/holds/${hold.data.id}/confirm`,{method:'POST',body:{useReferralReward:true}})).status,200);
      assert.equal((await referrer('/api/referrals')).data.availableRewards,0);
      await referrer(`/api/bookings/${hold.data.id}/cancel`,{method:'POST',body:{}});
    });
    await t.test('recuperación no revela cuentas ni enlaces; tokens hashed y sin envíos',async()=>{
      const request=email=>anonymous('/api/auth/forgot-password',{method:'POST',body:{email}});
      const found=await request('referrer@example.test'),missing=await request('missing@example.test'),privateOwner=await request('demo-8b9489f0@example.com');
      assert.deepEqual(found.data,missing.data);assert.deepEqual(found.data,privateOwner.data);assert.equal(found.data.sent,false);
      assert.equal(drafts.size,1);const draft=drafts.get(referrerId);assert.equal(draft.sent,false);
      const raw=draft.url.split('/#reset/')[1];const stored=(await pool.query('SELECT * FROM password_resets')).rows[0];
      assert.equal(stored.token_hash,digest(raw));assert.equal(JSON.stringify(stored).includes(raw),false);
      await request('referrer@example.test');assert.equal(drafts.get(referrerId).url,draft.url);
      assert.equal((await anonymous('/api/auth/reset-password',{method:'POST',body:{token:raw,password:'short'}})).status,400);
      const newSecret='New private isolated password!';
      const results=await Promise.all([anonymous('/api/auth/reset-password',{method:'POST',body:{token:raw,password:newSecret}}),anonymous('/api/auth/reset-password',{method:'POST',body:{token:raw,password:newSecret}})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(drafts.size,0);
      assert.equal((await referrer('/api/me')).status,401);
      assert.equal((await anonymous('/api/auth/login',{method:'POST',body:{email:'referrer@example.test',password:secret}})).status,401);
      assert.equal((await referrer('/api/auth/login',{method:'POST',body:{email:'referrer@example.test',password:newSecret}})).status,200);
    });
    await t.test('caducidad exacta de 30 minutos y limpieza al eliminar cuenta',async()=>{
      await anonymous('/api/auth/forgot-password',{method:'POST',body:{email:'referrer@example.test'}});
      const draft=drafts.get(referrerId);now+=30*60000;
      assert.equal((await anonymous('/api/auth/reset-password',{method:'POST',body:{token:draft.url.split('/#reset/')[1],password:'Another private password!'}})).status,400);
      assert.equal((await referrer('/api/me',{method:'DELETE'})).status,200);assert.equal(drafts.has(referrerId),false);
      assert.equal((await pool.query('SELECT 1 FROM password_resets WHERE user_id=$1',[referrerId])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM referral_codes WHERE user_id=$1',[referrerId])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM referral_rewards WHERE user_id=$1',[referrerId])).rowCount,0);
    });
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();
  }
});
