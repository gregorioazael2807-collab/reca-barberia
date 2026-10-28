import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';

const name='reca_waitlist_ui_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name);let server,browser;
const errors=[];
try{
  await initialize(pool);const now=Date.parse('2027-01-10T12:00:00Z');
  await pool.query('UPDATE settings SET data=data || $1::jsonb',[JSON.stringify({city:'Tampa, Florida',timezone:'America/New_York',cancellationNoticeMinutes:300,bookingNoticeMinutes:0,bookingSpacingMinutes:60,weekly:Array.from({length:7},(_,day)=>({day,closed:false,intervals:[['10:00','20:00']]}))})]);
  await pool.query("UPDATE services SET data=data || '{\"priceCents\":3500}'::jsonb");
  const block=randomUUID();await pool.query("INSERT INTO calendar_entries(id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,'block','blocked','2027-01-11T15:00:00Z','2027-01-11T16:00:00Z','2027-01-11T16:00:00Z','{\"reason\":\"Isolated UI test\"}')",[block]);
  const app=createApp(pool,{rateLimit:100,clock:()=>now});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'/#register');const register=page.locator('[data-form=register]');await register.waitFor();
  await register.locator('[name=name]').fill('Cliente lista aislada');await register.locator('[name=email]').fill('waitlist-ui@example.test');await register.locator('[name=password]').fill('Private isolated browser password!');await register.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  await page.goto(base+'/#booking');await page.locator('#real-date').fill('2027-01-11');
  assert.equal(await page.locator('.waitlist-optional').getAttribute('open'),null);assert.equal(await page.locator('[data-waitlist-form] [name=from]').isVisible(),false);await page.locator('.waitlist-optional>summary').click();
  const form=page.locator('[data-waitlist-form]');await form.waitFor();assert.equal(await form.locator('[name=emailConsent]').isChecked(),false);assert.equal(await form.locator('[name=whatsappConsent]').isChecked(),false);
  await form.locator('[name=from]').fill('10:00');await form.locator('[name=to]').fill('10:00');await form.locator('[name=emailConsent]').check();
  await form.getByRole('button',{name:'Guardar preferencia de espera'}).click();await page.locator('.waitlist-entry').waitFor();
  assert.equal(await page.locator('.waitlist-entry').count(),1);assert.match(await page.locator('.waitlist-entry').innerText(),/2027-01-11/);assert.match(await page.locator('.waitlist-panel').innerText(),/No se enviaron mensajes/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_subscriptions')).rows[0].n,1);
  await page.reload();await page.locator('.waitlist-optional>summary').waitFor();assert.equal(await page.locator('.waitlist-optional').getAttribute('open'),null);await page.locator('.waitlist-optional>summary').click();await page.locator('.waitlist-entry').waitFor();
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Desbordamiento ${width}`);}
  await pool.query("UPDATE calendar_entries SET status='cancelled' WHERE id=$1",[block]);
  await page.getByRole('button',{name:'Actualizar lista de espera'}).click();await page.locator('.waitlist-panel .live-note').waitFor();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notices')).rows[0].n,1);
  await page.getByRole('button',{name:'Salir de esta lista de espera'}).click();await page.waitForFunction(()=>document.querySelectorAll('.waitlist-entry').length===0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM waitlist_notices')).rows[0].n,0);
  assert.deepEqual(errors,[]);console.log('OK lista de espera UI: consentimiento no preseleccionado, guardado persistente, vacante real, salida y limpieza; teléfono/tablet/computadora. Base aislada, cero envíos.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();}
