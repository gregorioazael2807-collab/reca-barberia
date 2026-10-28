import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';

test('reseñas: visitas atendidas, todas las estrellas, privacidad, edición y borrado propios',async()=>{
 const name='reca_reviews_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);
 const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-reviews-'));let server;
 try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={}}={})=>{
   const response=await fetch(base+url,{method,headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
   const sc=response.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};
  };}
  const owner=client(),a=client(),b=client(),anon=client();
  await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Owner',password:'Private owner password!'}});
  const customerA=(await a('/api/auth/register',{method:'POST',body:{name:'Ana Private Surname',email:'a@example.test',password:'Private customer password!'}})).data.user;
  const customerB=(await b('/api/auth/register',{method:'POST',body:{name:'Bea',email:'b@example.test',password:'Private customer password!'}})).data.user;
  assert.equal((await anon('/api/reviews')).status,401);
  assert.equal((await a('/api/reviews')).data.average,null);
  assert.equal((await a('/api/reviews/me',{method:'PUT',body:{rating:5,body:'Before visit'}})).status,403);
  for(const [index,user] of [customerA,customerB].entries())await pool.query(`INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,$2,'booking','completed',$3,$4,$4,'{}')`,[randomUUID(),user.id,`2025-01-0${index+1}T10:00:00Z`,`2025-01-0${index+1}T11:00:00Z`]);
  assert.equal((await a('/api/reviews')).data.eligible,true);
  assert.equal((await a('/api/reviews/me',{method:'PUT',headers:{'X-CSRF-Token':'bad'},body:{rating:5,body:'CSRF'}})).status,403);
  for(const rating of [0,6,1.5,'5'])assert.equal((await a('/api/reviews/me',{method:'PUT',body:{rating,body:'Invalid'}})).status,400);
  for(const body of ['', '   ', 'x'.repeat(1001)])assert.equal((await a('/api/reviews/me',{method:'PUT',body:{rating:5,body}})).status,400);
  assert.equal((await owner('/api/reviews/me',{method:'PUT',body:{rating:5,body:'Owner'}})).status,403);
  assert.equal((await a('/api/reviews/me',{method:'PUT',body:{rating:1,body:'Necesita mejorar'}})).status,200);
  assert.equal((await b('/api/reviews/me',{method:'PUT',body:{rating:5,body:'Buena atención'}})).status,200);
  let data=(await a('/api/reviews')).data;assert.equal(data.total,2);assert.equal(data.average,3);assert.equal(data.mine.rating,1);
  assert.equal(data.reviews.some(r=>r.rating===1),true);assert.equal(data.reviews.find(r=>r.rating===1).name,'Ana');
  assert.doesNotMatch(JSON.stringify(data.reviews),/example.test|Private Surname|user_id/);
  await Promise.all([a('/api/reviews/me',{method:'PUT',body:{rating:2,body:'Editada'}}),a('/api/reviews/me',{method:'PUT',body:{rating:2,body:'Editada'}})]);
  assert.equal((await a('/api/reviews')).data.total,2);
  assert.equal((await a('/api/reviews/me',{method:'PUT',body:{rating:5,body:'No suplantar',userId:customerB.id}})).status,400);
  await a('/api/reviews/me',{method:'DELETE'});data=(await b('/api/reviews')).data;assert.equal(data.total,1);assert.equal(data.average,5);assert.equal(data.mine.body,'Buena atención');
  await b('/api/me',{method:'DELETE'});assert.equal((await owner('/api/reviews')).data.total,0);
 }finally{if(server)await new Promise(r=>server.close(r));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
});
