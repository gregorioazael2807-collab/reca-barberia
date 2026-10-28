import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {passwordHash} from '../security.js';

const database='reca_rewards_ui_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
await control.query(`CREATE DATABASE "${database}"`);const pool=makePool(database);let server,browser;
const drafts=new Map(),verificationEmails=[],errors=[];let now=Date.parse('2027-01-10T12:00:00Z');
try{
  await initialize(pool);const ownerId=randomUUID();
  await pool.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,'demo-8b9489f0@example.com','Owner isolated','owner',$2)",[ownerId,await passwordHash('Private owner browser password!')]);
  await pool.query('UPDATE settings SET data=data || $1::jsonb',[JSON.stringify({city:'Tampa, Florida',timezone:'America/New_York',bookingNoticeMinutes:0,cancellationNoticeMinutes:300,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))})]);
  await pool.query("UPDATE services SET data=data || '{\"priceCents\":3500}'::jsonb");
  const app=createApp(pool,{rateLimit:100,clock:()=>now,requireVerifiedReferrals:true,verificationEmailStatus:async()=>({enabled:true}),sendVerificationEmail:async email=>verificationEmails.push(email),saveRecoveryDraft:async draft=>drafts.set(draft.userId,draft),removeRecoveryDrafts:async id=>drafts.delete(id)});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  browser=await chromium.launch();
  const a=await browser.newPage({viewport:{width:360,height:800}}),b=await browser.newPage({viewport:{width:390,height:844}}),owner=await browser.newPage();
  for(const page of [a,b,owner])page.on('pageerror',err=>errors.push(err.message));
  async function register(page,email){
    const form=page.locator('[data-form=register]');await form.locator('[name=name]').fill(email.split('@')[0]);await form.locator('[name=email]').fill(email);await form.locator('[name=password]').fill('Private customer browser password!');await form.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();
    await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
    await page.goto(base+'/#profile');await page.locator('[data-server-action=request-verification]').click();
    await page.locator('#server-feedback').filter({hasText:'Revisa tu correo'}).waitFor();
    const verification=verificationEmails.find(message=>message.email===email);assert.ok(verification);
    await page.goto(verification.url);await page.locator('[data-form=verify-email]').waitFor();assert.equal(new URL(page.url()).hash,'#profile');
    await page.getByRole('button',{name:'Confirmar mi correo',exact:true}).click();await page.locator('#server-feedback').filter({hasText:'Correo verificado'}).waitFor();
    await page.goto(base+'/#home');await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  }
  await a.goto(base);await a.locator('[data-form=register]').waitFor();assert.equal(await a.locator('[name=referralCode]').isVisible(),false);await register(a,'referrer-ui@example.test');await a.goto(base+'/#profile');
  await a.getByRole('heading',{name:'Recomienda y gana'}).waitFor();
  const link=await a.locator('[name=referralLink]').inputValue();assert.match(link,/#ref\/[a-f0-9]{32}$/);
  const share=a.getByRole('link',{name:'Compartir por WhatsApp',exact:true});await share.waitFor();
  const shareUrl=new URL(await share.getAttribute('href'));assert.equal(shareUrl.origin,'https://wa.me');assert.ok(shareUrl.searchParams.get('text').includes(link));assert.match(shareUrl.searchParams.get('text'),/misma Wi-Fi/);assert.equal(await share.getAttribute('rel'),'noopener noreferrer');
  assert.equal(await a.getByRole('img',{name:'Tu QR de recomendación'}).evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await b.goto(link);await b.locator('[data-form=register]').waitFor();assert.equal(await b.locator('[name=referralCode]').inputValue(),link.split('/#ref/')[1]);assert.equal(await b.locator('[name=referralCode]').isVisible(),false);
  assert.equal(await b.locator('[data-form=login]').count(),0);await register(b,'referred-ui@example.test');
  await b.goto(base+'/#booking');await b.locator('#real-date').fill('2027-01-11');await b.locator('[data-booking-action=pick]').first().waitFor();await b.locator('[data-booking-action=pick]').first().click();
  await b.locator('[data-booking-action=confirm]').click();await b.getByRole('heading',{name:'Mis citas',exact:true}).waitFor();
  const bookingId=await b.locator('[data-booking-id]').first().getAttribute('data-booking-id');
  await owner.goto(base+'/#admin');const ownerLogin=owner.locator('[data-form=owner-login]');await ownerLogin.locator('[name=email]').fill('demo-8b9489f0@example.com');await ownerLogin.locator('[name=password]').fill('Private owner browser password!');await ownerLogin.getByRole('button',{name:'Entrar al panel privado',exact:true}).click();await owner.locator('header [data-comanda-menu=open]').waitFor();
  now=Date.parse('2027-01-11T16:01:00Z');await owner.goto(base+'/comanda/#agenda');await owner.locator(`[data-calendar-id="${bookingId}"] [data-booking-action=complete]`).click();await owner.getByText('Cita marcada atendida.',{exact:true}).waitFor();
  await a.locator('[data-server-action=refresh-referrals]').click();await a.locator('section').filter({has:a.getByRole('heading',{name:'Recomienda y gana'})}).getByText('1',{exact:true}).first().waitFor();
  await a.goto(base+'/#booking');await a.locator('#real-date').fill('2027-01-12');await a.locator('[data-booking-action=pick]').first().waitFor();await a.locator('[data-booking-action=pick]').first().click();
  await a.locator('#use-referral-reward').check();assert.match(await a.locator('#hold-summary').innerText(),/26[,.]25/);
  await a.locator('[data-booking-action=confirm]').click();await a.getByRole('heading',{name:'Mis citas',exact:true}).waitFor();assert.match(await a.locator('.appointment').first().innerText(),/Descuento por recomendación: 25 %/);
  await a.goto(base+'/#profile');await a.locator('[data-server-action=logout]').click();await a.locator('[data-server-action=show-login]').click();await a.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
  assert.equal(await a.locator('[data-form=login], [data-form=register]').count(),0);
  const forgot=a.locator('[data-form=forgot-password]');await forgot.locator('[name=email]').fill('referrer-ui@example.test');await forgot.getByRole('button',{name:'Solicitar recuperación'}).click();await a.locator('#server-feedback').filter({hasText:'no envía mensajes'}).waitFor();
  const draft=[...drafts.values()][0];assert.ok(draft);assert.equal(draft.sent,false);
  // Also exercise recovery with a currently authenticated browser/session.
  await a.locator('[data-server-action=show-login]').click();const login=a.locator('[data-form=login]');await login.locator('[name=email]').fill('referrer-ui@example.test');await login.locator('[name=password]').fill('Private customer browser password!');await login.getByRole('button',{name:'Entrar',exact:true}).click();await a.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  await a.goto(draft.url);const reset=a.locator('[data-form=reset-password]');await reset.waitFor();assert.equal(new URL(a.url()).hash,'#profile');
  await reset.locator('[name=password]').fill('New private browser password!');await reset.locator('[name=confirmPassword]').fill('New private browser password!');await reset.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click();
  await a.locator('#server-feedback').filter({hasText:'Contraseña actualizada'}).waitFor();assert.equal(drafts.size,0);
  await a.locator('[data-form=login] [name=email]').fill('referrer-ui@example.test');await a.locator('[data-form=login] [name=password]').fill('New private browser password!');await a.locator('[data-form=login]').getByRole('button',{name:'Entrar',exact:true}).click();await a.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  await a.goto(base+'/#profile');await a.getByRole('heading',{name:'Recomienda y gana'}).waitFor();
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('OK navegador: verificación privada de ambas cuentas, QR personal, enlace de referido, registro con código, corte atendido, punto único, descuento 25% en reserva y recuperación con enlace privado. Base aislada; cero envíos.');
}finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();
}
