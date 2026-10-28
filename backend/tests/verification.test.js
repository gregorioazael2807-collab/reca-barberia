import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {identityHasher,canonicalEmail} from '../identity.js';
import {token,digest} from '../security.js';

test('identidad Gmail: alias de puntos, tags y googlemail no crean identidades nuevas',()=>{
  assert.equal(canonicalEmail('demo-35bfb5f6@example.com'),'demo-58875473@example.com');
  assert.equal(canonicalEmail('a.b+tag@example.test'),'a.b+tag@example.test');
  const hash=identityHasher('a'.repeat(64));assert.equal(hash('demo-58875473@example.com'),hash('demo-35bfb5f6@example.com'));assert.notEqual(hash('demo-18ae18f2@example.com'),hash('demo-58875473@example.com'));
});
test('verificación y antifraude: correos simulados, ambas cuentas verificadas y corte real',async t=>{
  const database='reca_verify_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);const pool=makePool(database);let server,enabled=false,now=Date.parse('2027-01-10T12:00:00Z');const sent=[];
  try{
    await initialize(pool);const setupToken=token(),identityHash=identityHasher('b'.repeat(64));
    const app=createApp(pool,{setupToken,rateLimit:200,clock:()=>now,requireVerifiedReferrals:true,identityHash,verificationEmailStatus:async()=>({enabled}),sendVerificationEmail:async value=>{assert.equal((await pool.query('SELECT 1 FROM email_verifications WHERE token_hash=$1',[value.hash])).rowCount,1);sent.push(value);}});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
    function client(){let cookie='',csrf='';return async(url,{method='GET',body,headers={},omitCsrf=false}={})=>{const res=await fetch(base+url,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(!omitCsrf&&csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const sc=res.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];const data=await res.json();if(data.csrf)csrf=data.csrf;return {status:res.status,data};};}
    const owner=client(),a=client(),b=client(),anonymous=client(),alias=client();const secret='Private verification fixture password!';
    await owner('/api/auth/setup',{method:'POST',headers:{'X-Setup-Token':setupToken},body:{name:'Dueño prueba',password:secret}});
    const register=(who,email,referralCode)=>who('/api/auth/register',{method:'POST',body:{name:'Cliente aislado',email,password:secret,referralCode}});
    const userA=(await register(a,'demo-d903bcfc@example.com')).data.user;const code=(await a('/api/referrals')).data.code;
    const userB=(await register(b,'demo-cbfb250a@example.com',code)).data.user;
    const verify=who=>who('/api/account/verification',{method:'POST',body:{}});
    const consume=value=>anonymous('/api/auth/verify-email',{method:'POST',body:{token:value.url.split('/#verify/')[1]}});
    async function completedCut(userId,start){
      const id=randomUUID(),date=new Date(start),end=new Date(date.getTime()+3600000);
      await pool.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,$2,'booking','confirmed',$3,$4,$4,$5)",[id,userId,date,end,JSON.stringify({service:{id:'men',name:{es:'Corte',en:'Haircut'},priceCents:3500},timezone:'America/New_York',city:'Tampa, Florida',cancellationNoticeMinutes:300,bookingSpacingMinutes:60})]);now=end.getTime()+1;
      assert.equal((await owner(`/api/admin/bookings/${id}/complete`,{method:'POST',body:{}})).status,200);return id;
    }
    await t.test('sin autorización no envía; request solo cuenta propia y con CSRF',async()=>{
      assert.equal((await verify(a)).status,503);assert.equal(sent.length,0);
      assert.equal((await verify(anonymous)).status,401);assert.equal((await a('/api/account/verification',{method:'POST',body:{},omitCsrf:true})).status,403);assert.equal((await verify(owner)).status,403);
    });
    await t.test('correo confirmado mediante enlace secreto, hashed y de un solo uso',async()=>{
      enabled=true;assert.equal((await verify(a)).status,200);const link=sent.at(-1);assert.equal(link.email,userA.email);
      await verify(a);assert.equal(sent.length,1);assert.equal((await consume(link)).status,200);assert.equal((await consume(link)).status,400);
      assert.equal((await a('/api/me')).data.user.emailVerified,true);const stored=(await pool.query('SELECT * FROM verified_email_keys WHERE user_id=$1',[userA.id])).rows[0];assert.equal(stored.key_hash,identityHash(userA.email));
      assert.equal((await register(alias,'demo-5665b75a@example.com',code)).status,400);
      assert.equal((await register(alias,'demo-5665b75a@example.com')).status,200);await verify(alias);assert.equal((await consume(sent.at(-1))).status,409);
    });
    await t.test('corte atendido sin correo verificado no da punto; confirmar correo desbloquea una sola recompensa',async()=>{
      await completedCut(userB.id,'2027-01-11T15:00:00Z');assert.equal((await a('/api/referrals')).data.points,0);
      await verify(b);assert.equal((await consume(sent.at(-1))).status,200);assert.equal((await a('/api/referrals')).data.points,1);assert.equal((await a('/api/referrals')).data.availableRewards,1);
      await verify(b);assert.equal((await a('/api/referrals')).data.points,1);
    });
    await t.test('borrar cuenta y recrear alias no vuelve a dar puntos por el mismo buzón',async()=>{
      assert.equal((await b('/api/me',{method:'DELETE'})).status,200);
      const another=client(),newUser=(await register(another,'demo-32596c38@example.com',code)).data.user;
      await verify(another);assert.equal((await consume(sent.at(-1))).status,200);
      await completedCut(newUser.id,'2027-01-12T15:00:00Z');assert.equal((await a('/api/referrals')).data.points,1);
      assert.equal((await pool.query('SELECT 1 FROM referrals WHERE identity_key=$1',[identityHash(userB.email)])).rowCount,1);
    });
    await t.test('enlace caducado no verifica',async()=>{
      const other=client();await register(other,'expiry@example.test');await verify(other);const link=sent.at(-1);now+=30*60000;assert.equal((await consume(link)).status,400);
      assert.equal((await other('/api/me')).data.user.emailVerified,false);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();}
});
