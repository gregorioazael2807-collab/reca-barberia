import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from '@playwright/test';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import sharp from 'sharp';

const name='reca_comanda_'+randomUUID().replaceAll('-',''),control=makePool('postgres');
await control.query(`CREATE DATABASE "${name}"`);const pool=makePool(name),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-comanda-'));let server,browser;
const errors=[];
try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100,appointmentMailer:{status:async()=>({enabled:true,configured:true,activatedAt:'2027-01-01T00:00:00Z'}),send:async()=>{throw new Error('No enviar desde pruebas de interfaz.');}}});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  browser=await chromium.launch();const owner=await browser.newPage({viewport:{width:1024,height:768}}),customer=await browser.newPage({viewport:{width:390,height:844}});
  for(const page of [owner,customer])page.on('pageerror',error=>errors.push(error.message));
  await owner.goto(base+'/comanda/');await owner.locator('[data-form=owner-login]').waitFor();assert.equal(await owner.locator('[data-form=setup], [data-form=register]').count(),0);
  await owner.goto(base+'/comanda/#setup/'+setupToken);const setup=owner.locator('[data-form=setup]');await setup.waitFor();assert.equal(new URL(owner.url()).hash,'#admin');assert.ok(!(await owner.locator('main').innerText()).includes(setupToken));
  await setup.locator('[name=email]').fill('demo-54b54911@example.com');await setup.locator('[name=name]').fill('Dueño comanda aislado');await setup.locator('[name=password]').fill('Private comanda owner password!');
  await setup.locator('button.button.full').click();await owner.locator('header [data-comanda-menu=open]').waitFor();assert.equal(await owner.locator('main h1,main .comanda-welcome,main form').count(),0);
  const menu=owner.locator('#comanda-menu');assert.equal(await menu.isVisible(),false);assert.equal(await owner.locator('main form').count(),0);await owner.screenshot({path:path.join(root,'prototipo/evidencias/asistente-reca-inicio.png'),fullPage:true});
  await owner.locator('header [data-comanda-menu=open]').click();assert.equal(await menu.isVisible(),true);await owner.keyboard.press('Tab');assert.equal(await owner.evaluate(()=>document.querySelector('#comanda-menu').contains(document.activeElement)),true);await owner.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);await owner.waitForFunction(()=>document.querySelector('header [data-comanda-menu=open]')?.getAttribute('aria-expanded')==='false');
  await owner.locator('header [data-comanda-menu=open]').click();await owner.getByRole('button',{name:'Cerrar menú',exact:true}).click();assert.equal(await menu.isVisible(),false);
  await owner.locator('header [data-comanda-menu=open]').click();await owner.mouse.click(900,400);assert.equal(await menu.isVisible(),false);
  await owner.reload();await owner.locator('header [data-comanda-menu=open]').waitFor();assert.equal(await menu.isVisible(),false);
  await owner.locator('header [data-comanda-menu=open]').click();await owner.locator('.comanda-nav').getByRole('link',{name:'Horarios y servicios',exact:true}).click();assert.equal(await menu.isVisible(),false);
  await owner.getByRole('heading',{name:'Horarios y servicios',exact:true}).waitFor();
  const settings=owner.locator('[data-form=settings]');await settings.waitFor();assert.equal(await owner.locator('[data-form=gallery]').count(),0);
  await settings.locator('[name=city]').fill('Tampa, Florida');await owner.locator('header [data-comanda-menu=open]').click();await owner.getByRole('button',{name:'Cerrar menú',exact:true}).click();assert.equal(await settings.locator('[name=city]').inputValue(),'Tampa, Florida');await settings.locator('[name=timezone]').fill('America/New_York');await settings.locator('[name=cancellationNoticeMinutes]').fill('300');await settings.locator('[name=bookingNoticeMinutes]').fill('60');await settings.locator('[name=bookingSpacingMinutes]').fill('60');
  await settings.locator('[name=closed1]').uncheck();await settings.locator('[name=hours1]').fill('10:00-18:00');await settings.getByRole('button',{name:'Guardar configuración',exact:true}).click();await owner.locator('[data-form=settings]:not([aria-busy="true"])').waitFor();assert.equal(await owner.locator('#server-feedback').count(),0);
  const saved=(await pool.query('SELECT data FROM settings')).rows[0].data;assert.equal(saved.bookingNoticeMinutes,60);assert.equal(saved.weekly[1].closed,false);
  await customer.goto(base+'/#register');const register=customer.locator('[data-form=register]');await register.waitFor();assert.equal(await customer.locator('.owner-access').count(),0);
  await register.locator('[name=name]').fill('Cliente comanda aislado');await register.locator('[name=email]').fill('comanda-client@example.test');await register.locator('[name=password]').fill('Private comanda client password!');await register.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();await customer.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  await customer.goto(base+'/#profile');await customer.getByRole('heading',{name:'Ubicación y horarios',exact:true}).waitFor();assert.match(await customer.locator('main').innerText(),/10:00–18:00/);
  const customerName=customer.locator('[data-form=account] [name=name]');await customerName.fill('Nombre sin guardar');await customer.getByRole('heading',{name:'Mi cuenta',exact:true}).click();
  await settings.locator('[name=city]').fill('Tampa · Cambio sincronizado');const saving=owner.waitForResponse(response=>response.url().endsWith('/api/admin/settings')&&response.request().method()==='PATCH');await settings.getByRole('button',{name:'Guardar configuración',exact:true}).click();assert.equal((await saving).status(),200);
  await customer.waitForTimeout(6000);assert.equal(await customerName.inputValue(),'Nombre sin guardar');
  await customerName.fill('Cliente comanda aislado');await customer.getByRole('heading',{name:'Mi cuenta',exact:true}).click();await customer.getByText('Tampa · Cambio sincronizado',{exact:true}).waitFor({timeout:15000});
  await customer.goto(base+'/#home');await customer.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();const video=customer.locator('video');await video.evaluate(v=>v.play());await customer.waitForFunction(()=>document.querySelector('video')?.currentTime>0);await video.evaluate(v=>v.dataset.syncTest='same-player');
  const service=owner.locator('[data-form=service][data-id=men]');await service.locator('[name=price]').fill('37');const priceSaved=owner.waitForResponse(response=>response.url().endsWith('/api/admin/services/men')&&response.request().method()==='PUT');await service.getByRole('button',{name:'Guardar servicio',exact:true}).click();assert.equal((await priceSaved).status(),200);
  await customer.locator('.service-meta strong').filter({hasText:'37.00'}).waitFor({timeout:15000});assert.equal(await customer.locator('video').getAttribute('data-sync-test'),'same-player');assert.equal(await customer.locator('video').evaluate(v=>v.paused),false);
  await owner.goto(base+'/comanda/#galeria');const reference=owner.locator('[data-form=gallery-state][data-id=fade]');await reference.waitFor();await customer.goto(base+'/#gallery');await customer.locator('.cut').first().waitFor();const count=await customer.locator('.cut').count();await reference.locator('[name=active]').uncheck();await reference.getByRole('button',{name:'Guardar',exact:true}).click();await customer.waitForFunction(expected=>document.querySelectorAll('.cut').length===expected,count-1,{timeout:15000});
  await customer.goto(base+'/#home');await customer.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();
  await owner.goto(base+'/comanda/#barbero');await owner.getByRole('heading',{name:'Perfil del barbero',exact:true}).waitFor();
  const image=await sharp({create:{width:500,height:500,channels:3,background:'#d4af37'}}).png().toBuffer();
  await owner.locator('#owner-file').setInputFiles({name:'barbero-prueba-aislada.png',mimeType:'image/png',buffer:image});await owner.locator('#photo-preview').waitFor();
  const photoSaved=owner.waitForResponse(response=>response.url().endsWith('/api/admin/settings')&&response.request().method()==='PATCH');await owner.getByRole('button',{name:'Guardar foto del dueño',exact:true}).click();assert.equal((await photoSaved).status(),200);
  await owner.locator('.barber-profile-photo').waitFor();const photo=await owner.locator('.barber-profile-photo').getAttribute('src');assert.match(photo,/^\/media\/[a-f0-9-]+\.webp$/);
  await customer.waitForFunction(source=>document.querySelector('header img.owner-avatar')?.getAttribute('src')===source,photo,{timeout:15000});assert.equal(await customer.locator('header img.owner-avatar').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  assert.match(await owner.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage),/comanda-renka-fondo\.webp/);
  assert.match(await owner.title(),/Sistema de Control de Barbería/);assert.equal(await owner.locator('.brand strong').innerText(),'Sistema de Control de Barbería');
  await owner.goto(base+'/comanda/#galeria');const simpleGallery=owner.locator('[data-form=gallery]');await simpleGallery.waitFor();assert.deepEqual(await simpleGallery.locator('input,select').evaluateAll(elements=>elements.map(el=>el.name)),['file','name','audience','style','permission']);
  await simpleGallery.locator('[name=file]').setInputFiles({name:'corte-propio-prueba.png',mimeType:'image/png',buffer:image});await simpleGallery.locator('[name=name]').fill('Corte propio aislado');await simpleGallery.locator('[name=permission]').check();await simpleGallery.getByRole('button',{name:'Añadir foto',exact:true}).click();await owner.locator('.gallery-admin-item strong').filter({hasText:'Corte propio aislado'}).waitFor();
  const ownCut=(await pool.query("SELECT data,position FROM gallery WHERE data->'name'->>'es'='Corte propio aislado'")).rows[0];assert.equal(ownCut.data.name.en,'Corte propio aislado');assert.equal(ownCut.data.permissionConfirmed,true);assert.match(ownCut.data.source,/propia declarada/);assert.equal(ownCut.position,23);
  await customer.goto(base+'/#gallery');await customer.getByRole('heading',{name:'Corte propio aislado',exact:true}).waitFor({timeout:15000});
  await customer.goto(base+'/comanda/');await customer.locator('.warning').filter({hasText:'Solo el dueño'}).waitFor();assert.equal(await customer.locator('.comanda-nav,[data-form=settings],[data-form=setup]').count(),0);
  for(const [hash,selector] of [['agenda','[data-booking-form=block]'],['galeria','[data-form=gallery]'],['barbero','[data-form=owner-photo]'],['mensajes','.automation-panel'],['cuenta','[data-form=account]'],['pendientes','main .warning']]){
    await owner.goto(base+'/comanda/#'+hash);await owner.locator(selector).first().waitFor();
    for(const width of [320,768,1024,1440]){await owner.setViewportSize({width,height:900});assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Desbordamiento ${hash}/${width}`);}
    if(hash==='galeria')for(const image of await owner.locator('.gallery-admin-item img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.decode());assert.ok(await image.evaluate(img=>img.naturalWidth>0));}
  }
  await owner.goto(base+'/comanda/#mensajes');
  await owner.getByRole('heading',{name:'Correos automáticos · revisar conexión',exact:true}).waitFor();
  await owner.getByRole('alert').filter({hasText:'n8n no se ha conectado'}).waitFor();
  await pool.query('UPDATE automation_state SET last_poll=now()');
  await owner.getByRole('button',{name:'Actualizar estado de mensajes',exact:true}).click();
  await owner.getByRole('heading',{name:'Correos automáticos · conectados',exact:true}).waitFor();
  assert.equal(await owner.getByRole('alert').count(),0);
  await owner.goto(base+'/comanda/#agenda');await owner.locator('[data-booking-form=block]').waitFor();await owner.setViewportSize({width:1024,height:768});await owner.screenshot({path:path.join(root,'prototipo/evidencias/comanda-renka-tablet.png'),fullPage:true});
  await browser.close();browser=await webkit.launch();const tablet=await browser.newPage({viewport:{width:1024,height:768}});tablet.on('pageerror',error=>errors.push(error.message));await tablet.goto(base+'/comanda/');const login=tablet.locator('[data-form=owner-login]');await login.locator('[name=email]').fill('demo-54b54911@example.com');await login.locator('[name=password]').fill('Private comanda owner password!');await login.getByRole('button',{name:'Entrar al panel privado',exact:true}).click();await tablet.locator('header [data-comanda-menu=open]').waitFor();assert.ok(await tablet.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('OK Comanda RENKA: entrada separada, invitación privada, permisos dueño/cliente, horarios persistentes visibles en app, navegación agenda/fotos/mensajes/cuenta y ajuste teléfono/tablet/computadora en Chromium/WebKit. Funciones nuevas pendientes claramente indicadas; sin proveedores.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});}
