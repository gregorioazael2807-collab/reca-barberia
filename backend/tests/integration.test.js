import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { makePool, initialize } from '../db.js';
import { createApp } from '../app.js';
import { token } from '../security.js';

test('tramo 2: API real con base de pruebas aislada',async t=>{
  const database='reca_test_'+randomUUID().replaceAll('-','');
  const control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
  const pool=makePool(database),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-uploads-'));
  let server;
  try {
    await initialize(pool);const setupToken=token();const app=createApp(pool,{setupToken,uploads,rateLimit:100,allowedOrigins:['http://localhost:8081']});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){
      let cookie='',csrf='';
      return async(url,{method='GET',body,headers={},origin=base,raw=false,omitCsrf=false}={})=>{
        const response=await fetch(base+url,{method,headers:{...(method!=='GET'?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(!omitCsrf&&csrf?{'X-CSRF-Token':csrf}:{}),...(!raw&&body?{'Content-Type':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});
        const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
        const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data,headers:response.headers};
      };
    }
    const anonymous=client(),owner=client(),customer=client(),other=client();
    await t.test('sin sesión solo hay marca: catálogo y disponibilidad requieren registro',async()=>{
      const site=await anonymous('/api/site');assert.equal(site.status,200);assert.deepEqual(Object.keys(site.data).sort(),['hiddenWelcomeVideos','name','ownerPhoto','welcomeVideoCredits','welcomeVideos']);
      assert.equal((await anonymous('/api/public')).status,401);
      assert.equal((await anonymous('/api/availability?serviceId=men&date=2027-01-10')).status,401);
      assert.equal((await anonymous('/api/admin')).status,401);
      assert.equal((await anonymous('/api/me')).status,401);
    });
    await t.test('dueño solo con enlace privado y una única cuenta',async()=>{
      assert.equal((await anonymous('/api/auth/setup',{method:'POST',body:{name:'Owner',password:'A long private password!'},headers:{'X-Setup-Token':'bad'}})).status,403);
      const r=await owner('/api/auth/setup',{method:'POST',body:{name:'Owner',email:'new-owner@example.test',password:'A long private password!'},headers:{'X-Setup-Token':setupToken}});assert.equal(r.status,200);assert.equal(r.data.user.role,'owner');assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
      assert.equal((await anonymous('/api/auth/setup',{method:'POST',body:{name:'Other Owner',password:'A long private password!'},headers:{'X-Setup-Token':setupToken}})).status,403);
      assert.equal((await anonymous('/api/auth/status')).data.ownerConfigured,true);
    });
    await t.test('registro público siempre cliente; correo del dueño reservado',async()=>{
      assert.equal((await anonymous('/api/auth/register',{method:'POST',body:{name:'Fake owner',email:'New-owner@example.test',password:'Long testing password!'}})).status,400);
      const r=await customer('/api/auth/register',{method:'POST',body:{name:'Customer',email:'customer@example.test',password:'Long testing password!',role:'owner'}});assert.equal(r.status,200);assert.equal(r.data.user.role,'customer');
      assert.equal((await other('/api/auth/register',{method:'POST',body:{name:'Other',email:'other@example.test',password:'Long testing password!'}})).status,200);
    });
    await t.test('entradas separadas: cliente no entra como dueño ni dueño por formulario cliente',async()=>{
      assert.equal((await anonymous('/api/auth/owner-login',{method:'POST',body:{email:'customer@example.test',password:'Long testing password!'}})).status,401);
      assert.equal((await anonymous('/api/auth/login',{method:'POST',body:{email:'new-owner@example.test',password:'A long private password!'}})).status,401);
      const privateLogin=client();const r=await privateLogin('/api/auth/owner-login',{method:'POST',body:{email:'new-owner@example.test',password:'A long private password!'}});assert.equal(r.status,200);assert.equal(r.data.user.role,'owner');
      assert.equal((await privateLogin('/api/admin')).status,200);
    });
    await t.test('cliente no puede administrar, subir fotos o elevar permisos',async()=>{
      assert.equal((await customer('/api/admin')).status,403);
      assert.equal((await customer('/api/admin/settings',{method:'PATCH',body:{city:'No'}})).status,403);
      assert.equal((await customer('/api/admin/upload',{method:'POST',body:Buffer.from('bad'),raw:true,headers:{'Content-Type':'image/png'}})).status,403);
      assert.equal((await customer('/api/me',{method:'PATCH',body:{name:'Oops',role:'owner'}})).status,400);
    });
    await t.test('aislamiento entre usuarios y actualización solo de su nombre',async()=>{
      const mine=(await customer('/api/me')).data.user,another=(await other('/api/me')).data.user;
      assert.notEqual(mine.id,another.id);
      assert.equal((await customer('/api/me',{method:'PATCH',body:{name:'Intruder',id:another.id}})).status,400);
      assert.equal((await other('/api/me')).data.user.name,'Other');
      assert.equal((await customer('/api/me',{method:'PATCH',body:{name:'My new name'}})).data.user.name,'My new name');
      assert.equal((await customer('/api/users/'+another.id)).status,404);
    });
    await t.test('CSRF y origen externo bloquean modificaciones',async()=>{
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:'Wrong'},omitCsrf:true})).status,403);
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:'Wrong'},origin:'https://evil.example'})).status,403);
      assert.equal((await owner('/api/public')).data.settings.city,'');
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:''},origin:'http://localhost:8081'})).status,200);
    });
    await t.test('dueño guarda precio USD sin estimación de duración',async()=>{
      const data={name:{es:'Corte editado',en:'Edited haircut'},description:{es:'Descripción editada',en:'Edited description'},priceCents:2500,durationMinutes:40,cleaningMinutes:10,active:true};
      assert.equal((await owner('/api/admin/services/men',{method:'PUT',body:data})).status,200);
      const svc=(await customer('/api/public')).data.services.find(x=>x.id==='men');assert.equal(svc.priceCents,2500);assert.equal(Object.hasOwn(svc,'durationMinutes'),false);assert.equal(Object.hasOwn(svc,'cleaningMinutes'),false);
      assert.equal((await owner('/api/admin/services/men',{method:'PUT',body:{...data,priceCents:-1}})).status,400);
    });
    await t.test('zona horaria y turnos sin cruces se validan',async()=>{
      const weekly=Array.from({length:7},(_,day)=>({day,closed:true,intervals:[]}));weekly[1]={day:1,closed:false,intervals:[['10:00','14:00'],['16:00','20:00']]};
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{city:'Test city',timezone:'America/New_York',cancellationNoticeMinutes:300,weekly}})).status,200);
      const overlap=structuredClone(weekly);overlap[1].intervals=[['10:00','14:00'],['13:00','16:00']];
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{weekly:overlap}})).status,400);
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{timezone:'Fake/Zone'}})).status,400);
      for(const invalid of [-1,1.5,10081,'300']) assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{cancellationNoticeMinutes:invalid}})).status,400);
      assert.equal((await owner('/api/public')).data.settings.cancellationNoticeMinutes,300);
    });
    await t.test('fotos se decodifican, optimizan y publican solo con permiso del dueño',async()=>{
      assert.equal((await owner('/api/admin/upload',{method:'POST',body:Buffer.from('<svg>bad</svg>'),raw:true,headers:{'Content-Type':'image/png'}})).status,400);
      const image=await sharp({create:{width:1600,height:1400,channels:3,background:'#d4af37'}}).png().toBuffer();
      const result=await owner('/api/admin/upload',{method:'POST',body:image,raw:true,headers:{'Content-Type':'image/png'}});assert.equal(result.status,201);
      const photo=result.data.image;
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{ownerPhoto:photo}})).status,200);
      assert.equal((await owner('/api/public')).data.settings.ownerPhoto,photo);
      const response=await fetch(base+photo);assert.equal(response.status,200);const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.ok(metadata.width<=1200);
      const data={image:photo,name:{es:'Foto nueva',en:'New photo'},description:{es:'Mi referencia',en:'My inspiration'},audience:'men',style:'classic',author:'Owner',source:'Foto propia de prueba',license:'Permiso de prueba',position:0,permissionConfirmed:false};
      assert.equal((await owner('/api/admin/gallery',{method:'POST',body:data})).status,400);
      const newCut=await owner('/api/admin/gallery',{method:'POST',body:{...data,permissionConfirmed:true}});assert.equal(newCut.status,201);
      assert.equal((await owner('/api/public')).data.gallery.length,23);
      assert.equal((await owner('/api/admin/gallery/'+newCut.data.id,{method:'PATCH',body:{active:false,position:3}})).status,200);
      assert.equal((await owner('/api/public')).data.gallery.length,22);
      assert.equal((await owner('/api/admin/settings',{method:'PATCH',body:{ownerPhoto:null}})).status,200);
    });
    await t.test('datos persisten al repetir inicialización sin sobrescribir cambios',async()=>{
      await initialize(pool);const settings=(await owner('/api/public')).data.settings;assert.equal(settings.city,'Test city');assert.equal(settings.cancellationNoticeMinutes,300);
      const hashes=(await pool.query('SELECT password_hash FROM users')).rows;assert.ok(hashes.every(x=>!x.password_hash.includes('password')));
    });
    await t.test('logout revoca sesión y cuenta cliente se puede eliminar',async()=>{
      assert.equal((await customer('/api/logout',{method:'POST',body:{}})).status,200);assert.equal((await customer('/api/me')).status,401);
      assert.equal((await customer('/api/auth/login',{method:'POST',body:{email:'customer@example.test',password:'wrong'}})).status,401);
      assert.equal((await customer('/api/auth/login',{method:'POST',body:{email:'customer@example.test',password:'Long testing password!'}})).status,200);
      assert.equal((await customer('/api/me',{method:'DELETE'})).status,200);assert.equal((await customer('/api/me')).status,401);
    });
    await t.test('sesión caducada no permite acceder al perfil',async()=>{
      await pool.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE user_id=(SELECT id FROM users WHERE email='other@example.test')");
      assert.equal((await other('/api/me')).status,401);
      assert.equal((await other('/api/public')).status,401);
      assert.equal((await other('/api/availability?serviceId=men&date=2027-01-10')).status,401);
    });
    await t.test('archivos privados no se sirven desde el sitio',async()=>{
      assert.equal((await fetch(base+'/.local/owner-setup-token')).status,404);
      assert.equal((await fetch(base+'/backend/schema.sql')).status,404);
    });
    await t.test('limitación de intentos de autenticación',async()=>{
      let limited=false;
      for(let i=0;i<105;i++){
        const result=await anonymous('/api/auth/setup',{method:'POST',body:{},headers:{'X-Setup-Token':'bad'}});
        if(result.status===429){limited=true;break;}
      }
      assert.equal(limited,true);
    });
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await pool.end();
    await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});
  }
});
