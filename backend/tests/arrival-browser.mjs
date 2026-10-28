import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit,devices} from '@playwright/test';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {localInstants} from '../bookings.js';
import {token} from '../security.js';
const database='reca_arrival_ui_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
const pool=makePool(database),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-arrival-ui-'));let browser,server;
try{
 await initialize(pool);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
 const now=localInstants(today,'20:00','America/New_York')[0],setupToken=token();
 await pool.query("UPDATE settings SET data=data || '{\"timezone\":\"America/New_York\",\"city\":\"Test\"}'::jsonb");
 const app=createApp(pool,{setupToken,uploads,rateLimit:200,clock:()=>now});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
 async function auth(route,body,headers={}){const response=await fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0].split('=')[1];}
 const ownerSession=await auth('/api/auth/setup',{name:'Arrival UI owner',password:'Private arrival owner password!'},{'X-Setup-Token':setupToken});
 const customerSession=await auth('/api/auth/register',{name:'Arrival UI customer',email:'arrival-ui@example.test',password:'Private arrival customer password!'});
 const customerId=(await pool.query("SELECT id FROM users WHERE email='arrival-ui@example.test'")).rows[0].id;
 let index=0;
 for(const [engine,device,label] of [[chromium,null,'tablet-chromium'],[webkit,'iPad Mini','ipad-webkit'],[webkit,'iPhone 13','iphone-webkit']]){
  const id=randomUUID(),start=localInstants(today,`${String(8+index*2).padStart(2,'0')}:00`,'America/New_York')[0];index++;
  const snapshot={timezone:'America/New_York',city:'Test',cancellationNoticeMinutes:0,bookingSpacingMinutes:60,service:{id:'men',name:{es:'Corte llegada',en:'Arrival haircut'},priceCents:2625},discount:{type:'referral',percent:25,originalPriceCents:3500}};
  await pool.query("INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,$2,'booking','confirmed',$3,$4,$4,$5)",[id,customerId,new Date(start),new Date(start+3600000),JSON.stringify(snapshot)]);
  browser=await engine.launch();const context=await browser.newContext(device?devices[device]:{viewport:{width:1024,height:768},hasTouch:true,isMobile:true});await context.addCookies([{name:'reca_session',value:ownerSession,url:base}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Visit finances first so arrival must invalidate the cached summary.
  await page.goto(base+'/comanda/#finanzas');await page.locator('.metrics strong').first().waitFor();const before=await page.locator('.metrics strong').first().innerText();
  await page.locator('[data-pending-count]').getByText('1',{exact:true}).waitFor();assert.match(await page.locator('[data-pending-amount]').innerText(),/26[,.]25/);assert.equal(await page.locator('[data-pending-customers]').innerText(),'1');
  await page.evaluate(()=>location.hash='agenda');await page.locator('[data-pending-count]').getByText('1',{exact:true}).waitFor();const card=page.locator(`[data-calendar-id="${id}"]`),arrive=card.locator('[data-booking-action=arrive]');await arrive.waitFor();assert.match(await arrive.innerText(),/26[,.]25/);
  page.once('dialog',dialog=>dialog.dismiss());await arrive.tap();assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[id])).rows[0].n,0);
  page.once('dialog',dialog=>{assert.match(dialog.message(),/26[,.]25/);return dialog.accept();});await arrive.tap();await card.getByText('Llegada y cobro confirmados',{exact:true}).waitFor();assert.equal(await card.locator('[data-booking-action=arrive], [data-booking-action=cancel]').count(),0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[id])).rows[0].n,1);
  await page.locator('[data-pending-count]').getByText('0',{exact:true}).waitFor();
  await page.evaluate(()=>location.hash='finanzas');await page.locator('.metrics strong').first().waitFor();assert.notEqual(await page.locator('.metrics strong').first().innerText(),before);
  await page.evaluate(()=>location.hash='agenda');await card.getByText('Llegada y cobro confirmados',{exact:true}).waitFor();
  await page.locator('[data-comanda-language=en]').tap();await card.getByText('Arrival and payment confirmed',{exact:true}).waitFor();
  await page.reload();await card.getByText('Arrival and payment confirmed',{exact:true}).waitFor();
  await card.getByRole('button',{name:'Mark completed',exact:true}).tap();await card.getByText('Completed',{exact:true}).waitFor();assert.equal((await pool.query('SELECT count(*)::int n FROM finance_entries WHERE booking_id=$1',[id])).rows[0].n,1);
  // Change only the hash: do not reset the financial module's in-memory cache.
  await page.evaluate(()=>location.hash='finanzas');await page.locator('.metrics strong').first().waitFor();assert.notEqual(await page.locator('.metrics strong').first().innerText(),before);
  await page.locator('[data-pending-count]').getByText('0',{exact:true}).waitFor();assert.match(await page.locator('[data-pending-amount]').innerText(),/0[,.]00/);
  const total=await page.locator('.metrics strong').first().innerText();assert.match(total,new RegExp(String(2625*index/100).replace('.','[,.]')));
  await page.setViewportSize({width:768,height:1024});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,`prototipo/evidencias/llegada-${label}.png`),fullPage:true});
  const customerContext=await browser.newContext();await customerContext.addCookies([{name:'reca_session',value:customerSession,url:base}]);const customer=await customerContext.newPage();await customer.goto(base+'/#appointments');const customerCard=customer.locator(`[data-booking-id="${id}"]`);await customerCard.getByText('Llegada y cobro confirmados',{exact:true}).waitFor();assert.equal(await customerCard.locator('[data-booking-action=arrive], [data-booking-action=cancel], [data-booking-action=change]').count(),0);
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 console.log('OK llegada/cobro: tablet Chromium, iPad/iPhone WebKit, confirmación cancelable, importe con descuento, ingreso único, estado persistente ES/EN, atender sin cobrar otra vez, finanzas actualizadas y controles exclusivos del dueño. Base aislada y sin proveedores.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
