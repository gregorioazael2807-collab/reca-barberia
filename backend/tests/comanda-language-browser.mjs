// Isolated database: no business offers or outgoing messages.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from '@playwright/test';
import {makePool,initialize} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
const name='reca_language_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
await control.query(`CREATE DATABASE "${name}"`);
const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-language-'));
let server,browser;
try{
 await initialize(pool);
 await pool.query('UPDATE settings SET data=data || $1::jsonb',[JSON.stringify({timezone:'America/New_York'})]);
 const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:200});
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
 const response=await fetch(base+'/api/auth/setup',{method:'POST',headers:{Origin:base,'X-Setup-Token':setupToken,'Content-Type':'application/json'},body:JSON.stringify({name:'Owner language isolated',password:'Private language password!'})});assert.equal(response.status,200);
 const session=response.headers.get('set-cookie').split(';')[0].split('=')[1];
 for(const engine of [chromium,webkit]){
  browser=await engine.launch();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addCookies([{name:'reca_session',value:session,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/comanda/#ofertas');const form=page.locator('[data-content-form=offer]');await form.waitFor();
  assert.equal(await form.locator('[name=titleEn], [name=descriptionEn], [name=conditionsEn]').count(),0);
  await form.locator('[name=title]').fill('Oferta sin guardar');await form.locator('[name=description]').fill('Detalle sin guardar');await form.locator('[name=conditions]').fill('Condiciones sin guardar');
  await page.locator('[data-comanda-language=en]').tap();await page.getByRole('heading',{name:'Create offer',exact:true}).waitFor();assert.equal(await form.locator('[name=title]').inputValue(),'Oferta sin guardar');
  assert.equal(await form.getByLabel('Description',{exact:true}).count(),1);assert.equal(await form.getByLabel('Conditions',{exact:true}).count(),1);
  await form.locator('[name=title]').fill('English draft');await page.locator('[data-comanda-language=es]').tap();assert.equal(await form.locator('[name=title]').inputValue(),'Oferta sin guardar');
  await page.locator('[data-comanda-language=en]').tap();assert.equal(await form.locator('[name=title]').inputValue(),'English draft');
  await page.reload();await page.getByRole('heading',{name:'Create offer',exact:true}).waitFor();assert.equal(await page.locator('[data-comanda-language=en]').getAttribute('aria-pressed'),'true');
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   for(const code of ['es','en']){
    await page.locator(`[data-comanda-language=${code}]`).tap();assert.equal(await page.locator('html').getAttribute('lang'),code);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,targets:[...document.querySelectorAll('[data-comanda-language]')].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}))}));
    assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));for(const box of layout.targets)assert.ok(box.width>=44&&box.height>=44);
   }
  }
  for(const [route,heading] of [['agenda','Calendar'],['configuracion','Hours and services'],['galeria','Haircut photos'],['barbero','Barber profile'],['mensajes','Messages and waiting list'],['cuenta','My owner account']]){
   await page.goto(base+'/comanda/#'+route);await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();
  }
  await page.goto(base+'/comanda/#configuracion');await page.locator('[name=city]').fill('Unsaved city');await page.locator('[data-comanda-language=es]').tap();assert.equal(await page.locator('[name=city]').inputValue(),'Unsaved city');
  const other=await context.newPage();await other.goto(base+'/');await other.locator('[data-client-language=en]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await page.locator('[name=city]').inputValue(),'Unsaved city');
  await page.goto(base+'/comanda/#ofertas');await form.waitFor();await form.evaluate(form=>form.setAttribute('aria-busy','true'));await page.locator('[data-comanda-language=es]').tap();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 console.log('OK Comanda ES/EN: Chromium/WebKit touch, single offer fields, language drafts, translated labels/navigation/shared screens, persistence and cross-tab sync, unsaved settings preserved, busy form protected, 320/390/768/1440 without overflow. No business data or email.');
}finally{
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});
}
