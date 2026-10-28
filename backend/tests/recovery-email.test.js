import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {digest,passwordHash} from '../security.js';

test('recuperación por correo: envío simulado después de commit y sin filtrar cuentas',async t=>{
  const database='reca_email_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
  const pool=makePool(database),sent=[],drafts=new Map();let server,enabled=false,fail=false;
  let now=Date.parse('2027-01-10T12:00:00Z');
  try{
    await initialize(pool);const customerId=randomUUID(),secret='Private email recovery password!';
    await pool.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,'email@example.test','Cliente aislado','customer',$2)",[customerId,await passwordHash(secret)]);
    const app=createApp(pool,{rateLimit:100,clock:()=>now,recoveryEmailStatus:async()=>({enabled,configured:true}),saveRecoveryDraft:async draft=>drafts.set(draft.userId,draft),removeRecoveryDrafts:async id=>drafts.delete(id),sendRecoveryEmail:async draft=>{
      // Query a separate pool connection: an emailed token must already be committed.
      const raw=draft.url.split('/#reset/')[1];const row=(await pool.query('SELECT * FROM password_resets WHERE token_hash=$1',[digest(raw)])).rows[0];assert.equal(row.delivery_state,'pending');
      sent.push(draft);if(fail)throw new Error('private provider error');
    }});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    const post=async(url,body)=>{const response=await fetch(base+url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
    const forgot=email=>post('/api/auth/forgot-password',{email});
    await t.test('habilitación explícita, borrador anterior no bloquea correo real',async()=>{
      assert.equal((await forgot('email@example.test')).data.mode,'draft-only');assert.equal(sent.length,0);const old=drafts.get(customerId).url;
      enabled=true;const result=await forgot('email@example.test');assert.equal(result.data.mode,'email');assert.equal(sent.length,1);assert.notEqual(sent[0].url,old);assert.equal(drafts.size,0);
      assert.equal((await pool.query('SELECT delivery_state FROM password_resets WHERE used_at IS NULL')).rows[0].delivery_state,'sent');
      const status=await (await fetch(base+'/api/auth/recovery-status')).json();assert.equal(status.enabled,true);assert.equal(status.localOnly,true);
      await forgot('email@example.test');assert.equal(sent.length,1);
      assert.deepEqual((await forgot('unknown@example.test')).data,result.data);assert.deepEqual((await forgot('demo-8b9489f0@example.com')).data,result.data);
      assert.equal(JSON.stringify(result.data).includes(sent[0].url),false);
    });
    await t.test('enlace enviado funciona una sola vez y cambia la contraseña',async()=>{
      const raw=sent[0].url.split('/#reset/')[1];assert.equal((await post('/api/auth/reset-password',{token:raw,password:'New private email password!'})).status,200);
      assert.equal((await post('/api/auth/reset-password',{token:raw,password:'New private email password!'})).status,400);
      assert.equal((await post('/api/auth/login',{email:'email@example.test',password:secret})).status,401);
      assert.equal((await post('/api/auth/login',{email:'email@example.test',password:'New private email password!'})).status,200);
    });
    await t.test('fallo de entrega invalida el token y permite volver a solicitarlo',async()=>{
      t.mock.method(console,'error',()=>{});fail=true;
      const failed=await forgot('email@example.test');assert.equal(failed.status,200);const raw=sent.at(-1).url.split('/#reset/')[1];
      assert.equal((await post('/api/auth/reset-password',{token:raw,password:'Another private password!'})).status,400);
      fail=false;now+=1000;await forgot('email@example.test');assert.equal(sent.length,3);assert.notEqual(sent.at(-1).url.split('/#reset/')[1],raw);
      assert.equal(drafts.size,0);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();}
});
