import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
import {inspectVideo} from '../video-files.js';

test('ofertas y videos reales: permisos, precios acordados, vigencia, no acumulación y MP4 validado',async t=>{
 const name='reca_content_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-content-'));let server;
 const now=Date.parse('2027-01-10T12:00:00Z');
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100,clock:()=>now});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={},raw=false}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':raw?'video/mp4':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client(),anonymous=client();
  await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private content owner password!'}});
  await customer('/api/auth/register',{method:'POST',body:{name:'Customer isolated',email:'content@example.test',password:'Private content client password!'}});
  await owner('/api/admin/settings',{method:'PATCH',body:{city:'Tampa, Florida',timezone:'America/New_York',cancellationNoticeMinutes:300,bookingNoticeMinutes:0,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))}});
  await pool.query("UPDATE services SET data=data || '{\"priceCents\":3500}'::jsonb");
  const promotion={title:{es:'Oferta aislada',en:'Isolated offer'},description:{es:'Descuento de prueba',en:'Test discount'},conditions:{es:'No acumulable',en:'Cannot combine'},percent:10,serviceIds:['men'],startsAt:'2027-01-10T00:00:00Z',endsAt:'2027-01-15T00:00:00Z',active:true};let offer,booking;
  await t.test('solo el dueño administra; datos y vigencias validados',async()=>{
   assert.equal((await customer('/api/admin/offers')).status,403);assert.equal((await anonymous('/api/admin/offers')).status,401);
   assert.equal((await customer('/api/admin/offers',{method:'POST',body:promotion})).status,403);
   assert.equal((await owner('/api/admin/offers',{method:'POST',body:{...promotion,percent:101}})).status,400);
   const response=await owner('/api/admin/offers',{method:'POST',body:promotion});assert.equal(response.status,201);offer=response.data.offer;
   assert.equal((await customer('/api/public')).data.offers.length,1);
   const expired=await owner('/api/admin/offers',{method:'POST',body:{...promotion,startsAt:'2027-01-01T00:00:00Z',endsAt:'2027-01-02T00:00:00Z'}});assert.equal(expired.status,201);assert.equal((await customer('/api/public')).data.offers.length,1);
  });
  await t.test('precio calculado por servidor y oferta opcional sin acumulación',async()=>{
   const held=await customer('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-11T15:00:00Z'}});assert.equal(held.status,201);
   assert.equal((await customer(`/api/holds/${held.data.id}/confirm`,{method:'POST',body:{offerId:offer.id,useReferralReward:true}})).status,400);
   const result=await customer(`/api/holds/${held.data.id}/confirm`,{method:'POST',body:{offerId:offer.id,priceCents:1}});assert.equal(result.status,200);booking=result.data;
   assert.equal(booking.snapshot.service.priceCents,3150);assert.equal(booking.snapshot.discount.type,'offer');assert.equal(booking.snapshot.discount.conditions.es,'No acumulable');
   await owner('/api/admin/offers/'+offer.id,{method:'PUT',body:{...promotion,percent:20}});
   await owner('/api/admin/offers/'+offer.id,{method:'DELETE'});assert.equal((await customer('/api/public')).data.offers.length,0);
   const changed=await customer(`/api/bookings/${booking.id}/reschedule`,{method:'PATCH',body:{start:'2027-01-12T15:00:00Z'}});assert.equal(changed.status,200);assert.equal(changed.data.snapshot.service.priceCents,3150);assert.equal(changed.data.snapshot.discount.percent,10);
  });
  await t.test('oferta retirada o fecha fuera de vigencia no puede aplicarse',async()=>{
   const held=await customer('/api/holds',{method:'POST',body:{serviceId:'men',start:'2027-01-13T15:00:00Z'}});
   assert.equal((await customer(`/api/holds/${held.data.id}/confirm`,{method:'POST',body:{offerId:offer.id}})).status,409);
   const result=await customer(`/api/holds/${held.data.id}/confirm`,{method:'POST',body:{}});assert.equal(result.data.snapshot.service.priceCents,3500);
  });
  await t.test('videos: permiso exclusivo, consentimiento y rechazo a contenidos inválidos',async()=>{
   const clip=await readFile(path.join(root,'prototipo/assets/videos/login-musica.mp4'));assert.deepEqual(inspectVideo(clip),{durationSeconds:15,hasAudio:true});
   assert.throws(()=>inspectVideo(Buffer.from('<script>bad</script>')));assert.throws(()=>inspectVideo(Buffer.alloc(31*1024*1024)));
   assert.equal((await customer('/api/admin/videos/upload',{method:'POST',body:clip,raw:true})).status,403);
   assert.equal((await owner('/api/admin/videos/upload',{method:'POST',body:clip,raw:true})).status,400);
   assert.equal((await owner('/api/admin/videos/upload',{method:'POST',body:Buffer.from('fake MP4'),raw:true,headers:{'X-Media-Permission':'confirmed'}})).status,400);
   const uploaded=await owner('/api/admin/videos/upload',{method:'POST',body:clip,raw:true,headers:{'X-Media-Permission':'confirmed'}});assert.equal(uploaded.status,201);assert.equal(uploaded.data.hasAudio,true);
   for(const slot of ['register','home'])assert.equal((await owner('/api/admin/videos/'+slot,{method:'PUT',body:{video:uploaded.data.video}})).status,200);
   assert.equal((await anonymous('/api/site')).data.welcomeVideos.register,uploaded.data.video);assert.equal((await customer('/api/public')).data.settings.welcomeVideos.home,uploaded.data.video);
   const range=await fetch(base+uploaded.data.video,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');
   assert.equal((await owner('/api/admin/videos/home',{method:'PUT',body:{video:'https://external.invalid/video.mp4'}})).status,400);
   await owner('/api/admin/videos/home',{method:'PUT',body:{video:null}});assert.equal((await customer('/api/public')).data.settings.welcomeVideos.home,undefined);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
