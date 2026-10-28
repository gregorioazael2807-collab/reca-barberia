import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
import {inspectMusic} from '../music-files.js';
test('música: MP3/M4A limitados, permisos privados, misma pista y reproducción configurable',async t=>{
 const name='reca_music_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-music-'));let server;
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,raw=false,headers={}}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':raw?'audio/mp4':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client();await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private music owner password!'}});await customer('/api/auth/register',{method:'POST',body:{name:'Client isolated',email:'music@example.test',password:'Private music client password!'}});
  const clip=await readFile(path.join(root,'backend/tests/fixtures/music-test.m4a'));let url;
  await t.test('estructura, límites y formatos no admitidos',()=>{
   assert.equal(inspectMusic(clip,'m4a').durationSeconds,15);assert.throws(()=>inspectMusic(Buffer.alloc(21*1024*1024),'mp3'));assert.throws(()=>inspectMusic(Buffer.from('<script>not music</script>'.repeat(3)),'mp3'));
   const frame=Buffer.alloc(417);frame.set([255,251,144,0]);assert.ok(inspectMusic(Buffer.concat([frame,frame]),'mp3').durationSeconds>0);assert.throws(()=>inspectMusic(Buffer.concat([frame,frame.subarray(0,10)]),'mp3'));
  });
  await t.test('solo dueño con CSRF y permisos de música explícitos',async()=>{
   assert.equal((await customer('/api/admin/music/upload',{method:'POST',body:clip,raw:true})).status,403);
   assert.equal((await owner('/api/admin/music/upload',{method:'POST',body:clip,raw:true})).status,400);
   assert.equal((await owner('/api/admin/music/upload',{method:'POST',body:clip,raw:true,headers:{'X-Media-Permission':'confirmed','X-CSRF-Token':'wrong'}})).status,403);
   const result=await owner('/api/admin/music/upload',{method:'POST',body:clip,raw:true,headers:{'X-Media-Permission':'confirmed'}});assert.equal(result.status,201);url=result.data.audio;assert.match(url,/^\/media\/.+\.m4a$/);
  });
  await t.test('pista disponible en settings del cliente y soporte Range; no enlaces externos',async()=>{
   const result=await owner('/api/admin/music',{method:'PUT',body:{audio:url,title:'Música aislada'}});assert.equal(result.status,200);assert.equal(result.data.track.durationSeconds,15);
   const data=(await customer('/api/public')).data;assert.equal(data.settings.backgroundMusic.url,url);assert.equal(data.settings.backgroundMusic.title,'Música aislada');assert.equal(data.settings.backgroundMusic.autoplay,undefined);
   const audio=await fetch(base+url,{headers:{Range:'bytes=0-99'}});assert.equal(audio.status,206);assert.equal((await audio.arrayBuffer()).byteLength,100);
   assert.equal((await owner('/api/admin/music',{method:'PUT',body:{audio:'https://external.invalid/song.mp3',title:'External'}})).status,400);
   assert.equal((await customer('/api/admin/music',{method:'PUT',body:{audio:null}})).status,403);
  });
  await t.test('reproducción al entrar: ajuste exclusivo del dueño, booleano y compartido al cliente',async()=>{
   assert.equal((await customer('/api/admin/music/playback',{method:'PUT',body:{autoplay:true}})).status,403);
   assert.equal((await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:'true'}})).status,400);
   assert.equal((await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:true}})).status,200);
   assert.equal((await customer('/api/public')).data.settings.musicAutoplay,true);
   await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:false}});
  });
  await t.test('zona de galería configurable, validada y conservada con clientes anteriores',async()=>{
   assert.equal((await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:true,scope:'video'}})).status,400);
   assert.equal((await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:true,scope:'gallery'}})).status,200);
   assert.equal((await customer('/api/public')).data.settings.musicScope,'gallery');
   await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:false}});
   assert.equal((await customer('/api/public')).data.settings.musicScope,'gallery');
   assert.equal((await owner('/api/admin/music/playback',{method:'PUT',body:{autoplay:false,scope:'app'}})).status,200);
   assert.equal((await customer('/api/public')).data.settings.musicScope,'app');
  });
  await t.test('retirar pista elimina selección sin borrar archivos referenciados',async()=>{
   assert.equal((await owner('/api/admin/music',{method:'PUT',body:{audio:null}})).status,200);assert.equal((await customer('/api/public')).data.settings.backgroundMusic,undefined);assert.equal((await fetch(base+url)).status,200);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
