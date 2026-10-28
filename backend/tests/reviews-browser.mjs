import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit,devices} from '@playwright/test';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
const name='reca_reviews_ui_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${name}"`);
const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-reviews-ui-'));let server,browser;
try{
 await initialize(pool);const app=createApp(pool,{setupToken:token(),uploads,rateLimit:100});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
 for(const [index,engine,device] of [[0,chromium,'Pixel 5'],[1,webkit,'iPhone 13']]){
  browser=await engine.launch();const page=await browser.newPage({...devices[device]});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);const form=page.locator('[data-form=register]');await form.waitFor();await form.locator('[name=name]').fill('Cliente reseñas');await form.locator('[name=email]').fill(`review-${index}@example.test`);await form.locator('[name=password]').fill('Private review password!');await form.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();
  await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();await page.locator('a[href="#review"]').click();await page.getByText('Todavía no hay reseñas',{exact:true}).waitFor();
  await page.locator('.warning').filter({hasText:'cita'}).waitFor();assert.equal(await page.locator('[data-review-form]').count(),0);
  const user=(await pool.query('SELECT id FROM users WHERE email=$1',[`review-${index}@example.test`])).rows[0];
  await pool.query(`INSERT INTO calendar_entries(id,user_id,kind,status,starts_at,service_ends_at,ends_at,snapshot) VALUES($1,$2,'booking','completed',$3,$4,$4,'{}')`,[randomUUID(),user.id,`2025-02-0${index+1}T10:00:00Z`,`2025-02-0${index+1}T11:00:00Z`]);
  await page.reload();await page.locator('[data-review-form]').waitFor();assert.equal(await page.locator('[name=rating]:checked').count(),0);
  await page.locator('[name=rating][value="1"]').check();const malicious='<img src=x onerror=alert(1)> Opinión honesta';await page.locator('[data-review-form] textarea').fill(malicious);
  await page.locator('[data-client-language="en"]').click();assert.equal(await page.locator('[data-review-form] textarea').inputValue(),malicious);assert.equal(await page.locator('[name=rating]:checked').inputValue(),'1');assert.equal(await page.locator('.bottom-nav').isVisible(),true);
  await page.getByRole('button',{name:'Publish review',exact:true}).click();await page.getByText('Your review has been published. Thank you for sharing your experience.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Update review',exact:true}).waitFor();assert.equal(await page.locator('.review-list img').count(),0);assert.ok((await page.locator('.review-list').innerText()).includes(malicious));
  await page.reload();await page.getByRole('button',{name:'Update review',exact:true}).waitFor();assert.equal(await page.locator('[name=rating]:checked').inputValue(),'1');
  await page.locator('[name=rating][value="4"]').check();await page.locator('[data-review-form] textarea').fill('Opinión actualizada');await page.getByRole('button',{name:'Update review',exact:true}).click();await page.getByText('Your review has been published. Thank you for sharing your experience.',{exact:true}).waitFor();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_reviews WHERE user_id=$1',[user.id])).rows[0].n,1);
  await page.locator('[data-client-language="es"]').click();await page.getByRole('button',{name:'Actualizar reseña',exact:true}).waitFor();assert.ok((await page.locator('.review-list').innerText()).includes('Opinión actualizada'));
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Eliminar mi reseña',exact:true}).click();await page.getByText('Tu reseña se ha eliminado.',{exact:true}).waitFor();assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_reviews WHERE user_id=$1',[user.id])).rows[0].n,0);
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 console.log('OK reseñas Chromium/WebKit: solo citas atendidas, estrellas sin preselección, opinión de 1 estrella aceptada, publicar/editar/eliminar, recarga, idioma y borrador conservados, XSS escapado y ajuste 320/390/768. Base aislada, sin proveedores.');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
