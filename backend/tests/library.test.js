import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
test('bibliotecas privadas: archivos persistentes, créditos, selección y retirada segura',async t=>{
 const name='reca_library_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-library-'));let server;
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,raw=false,headers={}}={})=>{const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':raw?'video/mp4':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};};}
  const owner=client(),customer=client();await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner isolated',password:'Private library owner password!'}});await customer('/api/auth/register',{method:'POST',body:{name:'Client isolated',email:'library@example.test',password:'Private library client password!'}});
  let videoId,musicId;
  await t.test('privacidad y carga guarda un archivo sin cambiar la selección pública',async()=>{
   assert.equal((await customer('/api/admin/library')).status,403);assert.equal((await fetch(base+'/api/admin/library')).status,401);
   const video=await readFile(path.join(root,'prototipo/assets/videos/login-musica.mp4'));const upload=await owner('/api/admin/videos/upload',{method:'POST',body:video,raw:true,headers:{'X-Media-Permission':'confirmed','X-Media-Title':encodeURIComponent('Video aislado')}});assert.equal(upload.status,201);videoId=upload.data.mediaId;
   const list=(await owner('/api/admin/library')).data.items;assert.equal(list.length,1);assert.equal(list[0].title,'Video aislado');assert.equal((await customer('/api/public')).data.settings.welcomeVideos,undefined);
  });
  await t.test('selección autorizada mantiene fuentes/créditos visibles y no publica toda la biblioteca',async()=>{
   const bytes=await readFile(path.join(root,'backend/tests/fixtures/music-test.m4a'));musicId=randomUUID();const file=musicId+'.m4a';await writeFile(path.join(uploads,file),bytes);
   const data={url:'/media/'+file,title:'Música aislada',sourceTitle:'Título original de prueba',author:'Autor de prueba',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://example.test/fixture',permissionConfirmed:true,durationSeconds:15};await pool.query('INSERT INTO media_library(id,kind,data) VALUES($1,$2,$3)',[musicId,'music',JSON.stringify(data)]);
   assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'POST',body:{}})).status,200);const settings=(await customer('/api/public')).data.settings;assert.equal(settings.backgroundMusic.credit.title,data.sourceTitle);assert.equal(settings.mediaLibrary,undefined);
   assert.equal((await owner('/api/admin/library/'+videoId+'/use',{method:'POST',body:{slot:'wrong'}})).status,400);
   assert.equal((await owner('/api/admin/library/'+videoId+'/use',{method:'POST',body:{slot:'home'}})).status,200);assert.equal((await owner('/api/site')).data.welcomeVideoCredits.home.title,'Video aislado');
   assert.equal((await customer('/api/admin/library/'+musicId+'/use',{method:'POST',body:{}})).status,403);
  });
  await t.test('archivar no rompe activos ni permite volver a publicar un archivo retirado',async()=>{
   assert.equal((await owner('/api/admin/library/'+videoId,{method:'DELETE'})).status,409);await owner('/api/admin/videos/home',{method:'PUT',body:{video:null}});
   assert.equal((await owner('/api/admin/library/'+videoId,{method:'DELETE'})).status,200);assert.equal((await owner('/api/admin/library/'+videoId+'/use',{method:'POST',body:{slot:'home'}})).status,404);assert.equal((await owner('/api/admin/library')).data.items.length,1);
  });
  await t.test('quitar de app no borra biblioteca y ocultar video no vuelve al original',async()=>{
   assert.equal((await customer('/api/admin/videos/register',{method:'DELETE'})).status,403);
   assert.equal((await owner('/api/admin/videos/register',{method:'DELETE'})).status,200);assert.equal((await owner('/api/site')).data.hiddenWelcomeVideos.register,true);
   assert.equal((await owner('/api/admin/videos/unknown',{method:'DELETE'})).status,400);
   assert.equal((await owner('/api/admin/videos/register',{method:'PUT',body:{video:null}})).status,200);assert.equal((await owner('/api/site')).data.hiddenWelcomeVideos.register,undefined);
   assert.equal((await customer('/api/admin/library/'+musicId+'/use',{method:'DELETE'})).status,403);
   assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'DELETE'})).status,200);assert.equal((await customer('/api/public')).data.settings.backgroundMusic,undefined);assert.equal((await owner('/api/admin/library')).data.items.length,1);
   assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'DELETE'})).status,409);
   const clip=await readFile(path.join(root,'prototipo/assets/videos/login-musica.mp4'));const uploaded=await owner('/api/admin/videos/upload',{method:'POST',body:clip,raw:true,headers:{'X-Media-Permission':'confirmed'}});const bothId=uploaded.data.mediaId;
   for(const slot of ['home','register'])assert.equal((await owner('/api/admin/library/'+bothId+'/use',{method:'POST',body:{slot}})).status,200);
   assert.equal((await owner('/api/admin/library/'+bothId+'/use',{method:'DELETE'})).status,200);const site=(await owner('/api/site')).data;assert.equal(site.hiddenWelcomeVideos.home,true);assert.equal(site.hiddenWelcomeVideos.register,true);assert.equal(site.welcomeVideos.home,undefined);assert.equal(site.welcomeVideos.register,undefined);
  });
  await t.test('sin permiso, archivo perdido o CSRF no se aplica la selección',async()=>{
   assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'POST',body:{},headers:{'X-CSRF-Token':'wrong'}})).status,403);
   await pool.query("UPDATE media_library SET data=jsonb_set(data,'{permissionConfirmed}','false') WHERE id=$1",[musicId]);assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'POST',body:{}})).status,400);
   await pool.query("UPDATE media_library SET data=jsonb_set(jsonb_set(data,'{permissionConfirmed}','true'),'{url}',$2::jsonb) WHERE id=$1",[musicId,JSON.stringify('/media/'+randomUUID()+'.m4a')]);assert.equal((await owner('/api/admin/library/'+musicId+'/use',{method:'POST',body:{}})).status,409);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
