import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtimeConfig} from '../runtime-config.js';
import {databaseConfig,makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';

test('servidor: HTTPS, discos privados y PostgreSQL con TLS verificado',()=>{
  assert.throws(()=>runtimeConfig({NODE_ENV:'production'}),/HTTPS/);
  const env={NODE_ENV:'production',RECA_ORIGIN:'https://barber.example',DATABASE_URL:'postgresql://example:private-example@db.example/business',UPLOAD_DIR:'/data/uploads',PRIVATE_DIR:'/data/private'};
  const config=runtimeConfig(env);assert.equal(config.secureCookies,true);assert.equal(config.trustProxy,false);
  assert.throws(()=>runtimeConfig({...env,UPLOAD_DIR:'relative'}),/UPLOAD_DIR/);
  assert.throws(()=>runtimeConfig({...env,TRUST_PROXY:'true'}),/TRUST_PROXY/);
  assert.throws(()=>runtimeConfig({...env,PRIVATE_DIR:env.UPLOAD_DIR+'/secrets'}),/secretos/);
  const pg=databaseConfig(undefined,env);assert.equal(pg.ssl.rejectUnauthorized,true);assert.equal(new URL(pg.connectionString).pathname,'/business');
  assert.equal(new URL(databaseConfig('isolated_test',env).connectionString).pathname,'/isolated_test');
  assert.throws(()=>databaseConfig(undefined,{...env,DATABASE_URL:env.DATABASE_URL+'?sslmode=no-verify'}),/TLS/);
});

test('producción: cookies Secure, HSTS, proxy explícito y monitor sin datos privados',async t=>{
  const database='reca_prod_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);const pool=makePool(database);let server,untrusted;
  try{
    await initialize(pool);const origin='https://barber.example';const app=createApp(pool,{production:true,origin,trustProxy:'loopback',setupToken:token(),rateLimit:100});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    await t.test('HTTP rechazado; salud y readiness no revelan configuración',async()=>{
      assert.equal((await fetch(base+'/api/auth/status')).status,426);
      assert.deepEqual(await (await fetch(base+'/health/live')).json(),{status:'ok'});
      assert.deepEqual(await (await fetch(base+'/health/ready')).json(),{status:'ok'});
    });
    await t.test('cookie segura y origen ajeno rechazado',async()=>{
      const body=JSON.stringify({name:'Cliente aislado',email:'secure@example.test',password:'Private production fixture password!'});
      const result=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:origin,'X-Forwarded-Proto':'https','Content-Type':'application/json'},body});
      assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Secure/);assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.match(result.headers.get('set-cookie'),/SameSite=Strict/);assert.equal(result.headers.get('strict-transport-security'),'max-age=31536000');
      const denied=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:'https://evil.example','X-Forwarded-Proto':'https','Content-Type':'application/json'},body});assert.equal(denied.status,403);
      assert.ok((await pool.query('SELECT count(*)::int AS n FROM request_limits')).rows[0].n>0);
    });
    await t.test('X-Forwarded-Proto no se acepta sin proxy de confianza',async()=>{
      const strict=createApp(pool,{production:true,origin});untrusted=strict.listen(0,'127.0.0.1');await new Promise(resolve=>untrusted.once('listening',resolve));
      assert.equal((await fetch(`http://127.0.0.1:${untrusted.address().port}/api/auth/status`,{headers:{'X-Forwarded-Proto':'https'}})).status,426);
    });
    await t.test('readiness detecta fallo de DB sin exponer error',async()=>{
      const failed=createApp({query:async()=>{throw new Error('PRIVATE DATABASE DETAIL');}},{origin});
      const temporary=failed.listen(0,'127.0.0.1');await new Promise(resolve=>temporary.once('listening',resolve));
      try{const response=await fetch(`http://127.0.0.1:${temporary.address().port}/health/ready`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable'});}finally{await new Promise(resolve=>temporary.close(resolve));}
    });
  }finally{if(untrusted)await new Promise(resolve=>untrusted.close(resolve));if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();}
});
