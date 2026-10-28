import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';import {createApp} from '../app.js';import {token} from '../security.js';import {resetOwnerAccess} from '../owner-access.js';
test('reiniciar dueño: correo editable, sesiones revocadas y auditoría/negocio conservados',async()=>{
 const name='reca_owner_reset_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name);let server;
 try{
  await initialize(pool);let setupToken=token();
  async function start(){const app=createApp(pool,{setupToken,rateLimit:100,saveRecoveryDraft:async()=>{}});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;return base;}
  let base=await start();let cookie='';
  async function request(url,body,extra={}){const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,data:await res.json()};}
  const initial=await request('/api/auth/setup',{email:'old-owner@example.test',name:'Dueño inicial',password:'Private owner reset password!'},{'X-Setup-Token':setupToken});assert.equal(initial.status,200);const id=initial.data.user.id;
  await pool.query("INSERT INTO gocho_requests(id,user_id,mode,input,status) VALUES($1,$2,'direct','{}','done')",[randomUUID(),id]);
  const settingsBefore=(await pool.query('SELECT data FROM settings')).rows[0].data;
  await assert.rejects(resetOwnerAccess(pool,{expectedEmail:'wrong@example.test'}));assert.equal((await request('/api/me')).status,200);
  await resetOwnerAccess(pool,{expectedEmail:'old-owner@example.test'});assert.equal((await request('/api/me')).status,401);assert.equal((await request('/api/auth/status')).data.ownerConfigured,false);
  assert.equal((await request('/api/auth/owner-login',{email:'old-owner@example.test',password:'Private owner reset password!'})).status,401);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM users WHERE email='old-owner@example.test'")).rows[0].count,0);
  await new Promise(resolve=>server.close(resolve));setupToken=token();base=await start();
  const invalid=await request('/api/auth/setup',{email:'not-an-email',name:'Nuevo dueño',password:'New private owner password!'},{'X-Setup-Token':setupToken});assert.equal(invalid.status,400);
  const customer=await request('/api/auth/register',{email:'new-owner@example.test',name:'Cliente conservado',password:'Private shared client password!'});assert.equal(customer.status,200);const customerId=customer.data.user.id;
  const restored=await request('/api/auth/setup',{email:'New-owner@example.test',name:'Nuevo dueño',password:'New private owner password!'},{'X-Setup-Token':setupToken});assert.equal(restored.status,200);assert.equal(restored.data.user.id,id);assert.equal(restored.data.user.email,'new-owner@example.test');
  assert.equal((await request('/api/auth/status')).data.ownerConfigured,true);assert.equal((await pool.query('SELECT count(*)::int AS count FROM gocho_requests WHERE user_id=$1',[id])).rows[0].count,1);assert.deepEqual((await pool.query('SELECT data FROM settings')).rows[0].data,settingsBefore);
  assert.equal((await pool.query('SELECT id FROM users WHERE email=$1 AND role=$2',['new-owner@example.test','customer'])).rows[0].id,customerId);
  assert.equal((await request('/api/auth/login',{email:'new-owner@example.test',password:'New private owner password!'})).status,401);
  assert.equal((await request('/api/auth/owner-login',{email:'new-owner@example.test',password:'Private shared client password!'})).status,401);
  const clientLogin=await request('/api/auth/login',{email:'new-owner@example.test',password:'Private shared client password!'});assert.equal(clientLogin.status,200);assert.equal(clientLogin.data.user.id,customerId);assert.equal((await request('/api/admin')).status,403);
  await request('/api/auth/forgot-password',{email:'new-owner@example.test'});
  assert.equal((await pool.query('SELECT user_id FROM password_resets')).rows[0].user_id,customerId);
  const ownerLogin=await request('/api/auth/owner-login',{email:'new-owner@example.test',password:'New private owner password!'});assert.equal(ownerLogin.status,200);assert.equal(ownerLogin.data.user.id,id);assert.equal((await request('/api/admin')).status,200);
  assert.equal((await request('/api/auth/setup',{email:'another@example.test',name:'Otro',password:'Another private owner password!'},{'X-Setup-Token':setupToken})).status,403);
 }finally{if(server?.listening)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();}
});
