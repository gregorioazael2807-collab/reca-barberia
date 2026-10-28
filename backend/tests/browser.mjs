import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { makePool, initialize, root } from '../db.js';
import { createApp } from '../app.js';
import { token } from '../security.js';
import { renderMessage } from '../message-texts.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const database='reca_ui_'+randomUUID().replaceAll('-','');
const control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
const pool=makePool(database),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-browser-'));
let server,browser,clockShift=0;
const errors=[];
try {
  await initialize(pool);
  const setupToken=token(),automationToken=token(),app=createApp(pool,{setupToken,automationToken,uploads,rateLimit:100,clock:()=>Date.now()+clockShift});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const ownerContext=await browser.newContext({viewport:{width:390,height:844}}),customerContext=await browser.newContext({viewport:{width:360,height:800}});
  const owner=await ownerContext.newPage(),customer=await customerContext.newPage();
  for(const p of [owner,customer])p.on('pageerror',e=>errors.push(e.message));
  await owner.goto(base+'/#setup/'+setupToken);
  const setup=owner.locator('[data-form="setup"]');await setup.locator('[name=email]').fill('demo-54b54911@example.com');await setup.locator('[name=name]').fill('Dueño de prueba');await setup.locator('[name=password]').fill('Private owner test password!');await setup.getByRole('button',{name:'Crear cuenta del dueño',exact:true}).click();
  await owner.locator('header [data-comanda-menu=open]').waitFor();
  assert.equal(new URL(owner.url()).hash,'#admin');
  await owner.goto(base+'/comanda/#configuracion');
  const service=owner.locator('[data-form="service"][data-id="men"]');
  await service.locator('[name=nameEs]').fill('Corte prueba UI');await service.locator('[name=price]').fill('27.50');assert.equal(await service.locator('[name=duration], [name=cleaning]').count(),0);
  await service.getByRole('button',{name:'Guardar servicio'}).click();
  await owner.locator('[data-form="service"][data-id="men"]:not([aria-busy="true"])').waitFor();assert.equal(await owner.locator('#server-feedback').count(),0);
  await customer.goto(base);await customer.locator('[data-form=register]').waitFor();
  assert.equal(new URL(customer.url()).hash,'#register');assert.equal(await customer.locator('.bottom-nav, .service, .gallery-grid').count(),0);
  const signup=customer.locator('[data-form=register]');await signup.locator('[name=name]').fill('Cliente UI');await signup.locator('[name=email]').fill('ui-customer@example.test');await signup.locator('[name=password]').fill('Private customer test password!');await signup.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();
  await customer.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();assert.equal(new URL(customer.url()).hash,'#home');
  await customer.getByRole('heading',{name:'Corte prueba UI'}).waitFor();
  assert.match(await customer.locator('.service').first().innerText(),/27,50|27\.50/);
  assert.doesNotMatch(await customer.locator('.service').first().innerText(),/\bmin\b|Duración|Duration/);
  // A title containing HTML must render as text, not execute.
  const malicious='<img src=x onerror=alert(1)>';
  await owner.locator('[data-form="service"][data-id="men"] [name=nameEs]').fill(malicious);
  await owner.locator('[data-form="service"][data-id="men"]').getByRole('button',{name:'Guardar servicio'}).click();
  await owner.locator('[data-form="service"][data-id="men"]:not([aria-busy="true"])').waitFor();await customer.reload();
  assert.equal(await customer.locator('.service h3').first().textContent(),malicious);
  assert.equal(await customer.locator('.service img').count(),0);
  await owner.locator('[data-form="service"][data-id="men"] [name=nameEs]').fill('Corte prueba UI');
  await owner.locator('[data-form="service"][data-id="men"]').getByRole('button',{name:'Guardar servicio'}).click();await owner.locator('[data-form="service"][data-id="men"]:not([aria-busy="true"])').waitFor();
  const settings=owner.locator('[data-form=settings]');await settings.locator('[name=city]').fill('Ciudad de prueba');await settings.locator('[name=timezone]').fill('America/New_York');await settings.locator('[name=cancellationNoticeMinutes]').fill('300');await settings.locator('[name=bookingSpacingMinutes]').fill('60');await settings.getByRole('button',{name:'Guardar configuración'}).click();await owner.locator('[data-form=settings]:not([aria-busy="true"])').waitFor();
  assert.equal((await pool.query('SELECT data FROM settings')).rows[0].data.cancellationNoticeMinutes,300);
  await owner.goto(base+'/comanda/#barbero');
  const photoForm=owner.locator('[data-form="owner-photo"]');await photoForm.locator('input[type=file]').setInputFiles(path.join(root,'prototipo/assets/brand/reca-logo.jpg'));
  await owner.locator('#photo-preview:not([hidden])').waitFor();
  await photoForm.locator('[name=zoom]').fill('1.2');await photoForm.getByRole('button',{name:'Guardar foto del dueño'}).click();
  await owner.locator('header img.owner-avatar').waitFor();
  await customer.reload();await customer.locator('header img.owner-avatar').waitFor();assert.ok((await customer.locator('header img.owner-avatar').getAttribute('src')).startsWith('/media/'));
  // Hide a gallery reference and observe the public gallery immediately on reload.
  await owner.goto(base+'/comanda/#galeria');
  const item=owner.locator('[data-form="gallery-state"][data-id="fade"]');await item.locator('[name=active]').uncheck();await item.getByRole('button').click();await owner.locator('[data-form="gallery-state"][data-id="fade"]:not([aria-busy="true"])').waitFor();
  await customer.goto(base+'/#gallery');await customer.reload();await customer.locator('.gallery-grid').waitFor();assert.equal(await customer.locator('.cut').count(),21);assert.equal(await customer.getByRole('heading',{name:'Texturizado juvenil',exact:true}).count(),0);
  for(const img of await customer.locator('.cut-photo').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());assert.ok(await img.evaluate(el=>el.naturalWidth>0));}
  await customer.locator('#audience').selectOption('kids');assert.equal(await customer.locator('.cut').count(),7);
  await customer.locator('#style').selectOption('fade');assert.equal(await customer.locator('.cut').count(),1);
  await customer.locator('#audience').selectOption('all');await customer.locator('#style').selectOption('all');
  await customer.locator('[data-action=detail]').first().click();assert.equal(await customer.locator('dialog').evaluate(el=>el.open),true);await customer.keyboard.press('Escape');
  await customer.locator('[data-client-language="en"]').click();await customer.reload();await customer.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await customer.locator('html').getAttribute('lang'),'en');
  // One choice applies to every customer route, and survives a reload.
  for(const [hash,heading] of [['home','Your next exclusive haircut'],['services','Services'],['gallery','Choose your style'],['offers','Current offers'],['booking','Reserve appointment'],['appointments','My appointments'],['profile','My account']]){
    await customer.goto(base+'/#'+hash);
    if(hash==='gallery')await customer.locator('.gallery-grid').waitFor();
    else if(hash==='services')await customer.locator('.service').first().waitFor();
    else await customer.getByRole('heading',{name:heading,exact:true}).first().waitFor();
    assert.equal(await customer.locator('[data-client-language="en"]').getAttribute('aria-pressed'),'true');
    assert.equal(await customer.locator('html').getAttribute('lang'),'en');
    assert.equal(await customer.locator('.bottom-nav').innerText(),'Home\nReserve\nMy appointments\nMy account');
  }
  const accountDraft=customer.locator('[data-form=account] [name=name]');await accountDraft.fill('Nombre sin guardar');
  const otherTab=await customerContext.newPage();await otherTab.goto(base+'/#profile');
  await otherTab.getByRole('heading',{name:'My account',exact:true}).waitFor();
  await customer.locator('[data-client-language="es"]').click();
  await otherTab.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor();
  assert.equal(await otherTab.locator('[data-client-language="es"]').getAttribute('aria-pressed'),'true');
  await otherTab.close();
  assert.equal(await customer.locator('[data-form=account] [name=name]').inputValue(),'Nombre sin guardar');
  await customer.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor();
  await customer.goto(base+'/#gallery');
  // Operational routes must never display fictitious bookings or functional-looking demo actions.
  for(const route of ['review','offers']) {
    await customer.goto(base+'/#'+route);
    if(route==='offers')await customer.getByText('No hay ofertas activas en este momento.',{exact:true}).waitFor();
    else await customer.getByRole('heading',{name:'Reseñas de clientes',exact:true}).waitFor();
    assert.equal(await customer.locator('[data-action="confirm"], [data-action="publish"], .slot, .appointment').count(),0);

  }
  await customer.goto(base+'/#booking');await customer.locator('#real-date').waitFor();assert.equal(new URL(customer.url()).hash,'#booking');
  await customer.goto(base+'/#home');assert.equal(await customer.locator('[data-action="like"], .offer').count(),0);
  await customer.goto(base+'/#profile');await customer.getByRole('heading',{name:'Cliente UI',exact:true}).waitFor();
  assert.equal(await customer.locator('main a[href="#admin"], [data-form=register]').count(),0);
  assert.equal(await customer.locator('header .owner-access').count(),0);
  await customer.goto(base+'/#admin');await customer.locator('.warning').filter({hasText:'Solo el dueño'}).waitFor();assert.equal(await customer.locator('[data-form=service]').count(),0);
  await customer.goto(base+'/#profile');await customer.locator('[data-server-action=logout]').click();await customer.locator('[data-server-action=show-login]').click();await customer.locator('[data-form=login]').waitFor();assert.equal(await customer.locator('[data-form=register]').count(),0);
  const login=customer.locator('[data-form=login]');await login.locator('[name=email]').fill('ui-customer@example.test');await login.locator('[name=password]').fill('Private customer test password!');await login.getByRole('button',{name:'Entrar',exact:true}).click();await customer.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();assert.equal(new URL(customer.url()).hash,'#home');
  // Configure real booking logic using only the isolated database.
  await owner.goto(base+'/comanda/#configuracion');
  const bookingSettings=owner.locator('[data-form=settings]');
  await bookingSettings.locator('[name=bookingNoticeMinutes]').fill('0');
  for(let day=0;day<7;day++) {
    await bookingSettings.locator(`[name=closed${day}]`).uncheck();
    await bookingSettings.locator(`[name=hours${day}]`).fill('10:00-14:00, 16:00-20:00');
  }
  await bookingSettings.getByRole('button',{name:'Guardar configuración'}).click();await owner.locator('[data-form=settings]:not([aria-busy="true"])').waitFor();
  const futureDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  await customer.goto(base+'/#gallery');await customer.reload();await customer.locator('.gallery-grid').waitFor();
  const reference=(await pool.query("SELECT id FROM gallery WHERE active=true AND data->>'audience'='men' ORDER BY position LIMIT 1")).rows[0].id;
  await customer.locator(`[data-action=select][data-id="${reference}"]`).click();
  await customer.goto(base+'/#booking');await customer.locator('#real-date').fill(futureDate);
  await customer.locator('[data-booking-action=pick]').first().waitFor();await customer.locator('[data-booking-action=pick]').first().click();
  await customer.locator('#hold-summary').waitFor();assert.doesNotMatch(await customer.locator('#hold-summary').innerText(),/40 \+ 10|50 min/);await customer.locator('#hold-countdown').filter({hasText:/\d+:\d+/}).waitFor();
  const held=(await pool.query("SELECT * FROM calendar_entries WHERE status='held'")).rows[0];assert.equal(held.snapshot.reference.id,reference);assert.equal(held.snapshot.service.priceCents,2750);
  // Reload must recover the real server hold, not invent a new one.
  await customer.reload();await customer.locator('#hold-summary').waitFor();
  await customer.locator('[data-booking-action=confirm]').click();
  await customer.locator(`[data-booking-id="${held.id}"]`).waitFor();
  assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[held.id])).rows[0].status,'confirmed');
  await customer.locator('[data-booking-action=change]').click();
  await customer.locator('#real-date').fill(futureDate);
  await customer.locator('[data-time-wheel]').waitFor();
  const wheel=customer.locator('[data-time-wheel]');await wheel.focus();await wheel.press('Home');for(let i=0;i<4;i++)await wheel.press('ArrowDown');
  const changedStart=await customer.locator('[data-wheel-start]').nth(4).getAttribute('data-wheel-start');await customer.waitForFunction(start=>document.querySelector('[data-booking-action=pick]')?.dataset.start===start,changedStart);
  assert.equal((await pool.query('SELECT starts_at FROM calendar_entries WHERE id=$1',[held.id])).rows[0].starts_at.toISOString(),held.starts_at.toISOString());
  await customer.locator('[data-booking-action=pick]').click();await customer.locator('[data-booking-action=save-change]').click();
  await customer.locator(`[data-booking-id="${held.id}"]`).waitFor();assert.equal((await pool.query('SELECT starts_at FROM calendar_entries WHERE id=$1',[held.id])).rows[0].starts_at.toISOString(),changedStart);
  customer.on('dialog',dialog=>dialog.accept());
  await customer.locator('[data-booking-action=cancel]').click();
  await customer.getByRole('status').filter({hasText:'Cita cancelada. Horario liberado.'}).waitFor();
  await customer.locator(`[data-booking-id="${held.id}"]`).waitFor({state:'detached'});
  assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[held.id])).rows[0].status,'cancelled');
  await customer.reload();await customer.getByRole('button',{name:'Actualizar citas',exact:true}).waitFor();await customer.getByText('No tienes citas para mostrar.',{exact:true}).waitFor();assert.equal(await customer.locator(`[data-booking-id="${held.id}"]`).count(),0);assert.equal(await customer.locator('.appointment .cut-photo').count(),0);
  const preserved=(await pool.query('SELECT snapshot FROM calendar_entries WHERE id=$1',[held.id])).rows[0];assert.equal(preserved.snapshot.reference.id,reference);
  await owner.goto(base+'/comanda/#agenda');await owner.getByRole('button',{name:'Actualizar agenda',exact:true}).waitFor();await owner.getByText('Agenda vacía.',{exact:true}).waitFor();assert.equal(await owner.locator(`[data-calendar-id="${held.id}"]`).count(),0);assert.equal(await owner.locator('[data-calendar-id] .cut-photo').count(),0);
  await customer.getByRole('link',{name:'Reservar nueva cita · Ver horas',exact:true}).click();await customer.getByRole('heading',{name:'Reservar cita',exact:true}).waitFor();await customer.locator('#real-date').fill(futureDate);await customer.locator('[data-time-wheel]').waitFor();assert.equal(await customer.locator('[data-booking-action=pick]').count(),1);
  // Draft review is owner-only, plain text, and never a sending control.
  const workerHeaders={Authorization:`Bearer ${automationToken}`,'Content-Type':'application/json'};
  const claimed=await (await fetch(base+'/api/automation/claim',{method:'POST',headers:workerHeaders})).json();
  assert.equal(claimed.jobs.length,1);const task=claimed.jobs[0],draft=renderMessage(task.payload);
  draft.emailText+='\n<img src=x onerror=alert(1)>'; 
  const prepared=await fetch(base+`/api/automation/jobs/${task.id}/draft`,{method:'POST',headers:workerHeaders,body:JSON.stringify({leaseToken:task.leaseToken,message:draft})});assert.equal(prepared.status,200);
  assert.equal(await customer.locator('.automation-panel').count(),0);
  await owner.goto(base+'/comanda/#mensajes');await owner.locator('.automation-panel').waitFor();
  await owner.locator('[data-server-action=refresh-automation]').click();await owner.locator('#server-feedback').waitFor();
  await owner.locator('.automation-panel summary').filter({hasText:'Borrador listo'}).click();
  assert.match(await owner.locator('.message-draft').innerText(),/está cancelada/);assert.equal(await owner.locator('.message-draft img').count(),0);
  assert.match(await owner.locator('.automation-panel .warning').innerText(),/WhatsApp desactivado/);
  assert.equal(await owner.locator('[data-server-action=send-message]').count(),0);
  // Owner blocks use the shop timezone, independent of the browser's timezone.
  await owner.goto(base+'/comanda/#agenda');
  const block=owner.locator('[data-booking-form=block]');
  await block.locator('[name=startLocal]').fill(futureDate+'T10:00');await block.locator('[name=endLocal]').fill(futureDate+'T11:00');await block.locator('[name=reason]').fill('Descanso UI aislado');await block.getByRole('button').click();
  await owner.locator('[data-calendar-id] .badge').filter({hasText:'Bloqueado'}).waitFor();
  await customer.goto(base+'/#booking');await customer.locator('#real-date').fill(futureDate);await customer.locator('[data-booking-action=pick]').first().waitFor();
  const firstAfterBlock=await customer.locator('[data-booking-action=pick]').first().getAttribute('data-start');
  const blocked=(await pool.query("SELECT * FROM calendar_entries WHERE status='blocked'")).rows[0];assert.equal(firstAfterBlock,blocked.ends_at.toISOString());
  await owner.locator('[data-booking-action=unblock]').click();await owner.getByText('Bloqueo guardado.',{exact:true}).count();
  await customer.reload();await customer.locator('#real-date').fill(futureDate);await customer.locator('[data-booking-action=pick]').first().waitFor();
  await customer.locator('[data-booking-action=pick]').first().click();await customer.locator('#hold-summary').waitFor();await customer.locator('[data-booking-action=confirm]').click();
  await customer.locator('.appointment .badge').filter({hasText:'Confirmada'}).waitFor();
  const confirmed=(await pool.query("SELECT * FROM calendar_entries WHERE status='confirmed'")).rows[0];
  clockShift=confirmed.service_ends_at.getTime()-Date.now()+1000;
  await owner.goto(base+'/comanda/#agenda');await owner.locator('[data-booking-action=refresh-list]').click();await owner.locator(`[data-calendar-id="${confirmed.id}"]`).waitFor();
  await owner.locator(`[data-calendar-id="${confirmed.id}"] [data-booking-action=complete]`).click();
  await owner.locator(`[data-calendar-id="${confirmed.id}"] .badge`).filter({hasText:'Atendida'}).waitFor();
  assert.equal((await pool.query('SELECT status FROM calendar_entries WHERE id=$1',[confirmed.id])).rows[0].status,'completed');
  clockShift=0;
  for(const width of [360,390,768,1440]) {
    await owner.setViewportSize({width,height:900});await owner.goto(base+'/#admin');await owner.locator('header [data-comanda-menu=open]').waitFor();
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Admin overflow ${width}`);
    await customer.setViewportSize({width,height:900});
    for(const route of ['home','services','gallery','offers','booking','appointments','profile','review','admin']) {
      await customer.goto(base+'/#'+route);await customer.locator('main').waitFor();
      assert.equal(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Customer overflow ${width}/${route}`);
    }
  }
  await mkdir(path.join(root,'prototipo/evidencias'),{recursive:true});
  await owner.setViewportSize({width:390,height:844});await owner.screenshot({path:path.join(root,'prototipo/evidencias/tramo3-admin.png'),fullPage:true});
  await customer.setViewportSize({width:390,height:844});await customer.goto(base+'/#appointments');await customer.locator('.appointment').first().waitFor();
  await customer.screenshot({path:path.join(root,'prototipo/evidencias/tramo3-citas.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('OK UI: owner/customer accounts, protected admin, services/settings/photos, real hold and recovery after reload, reference snapshot, booking confirmation, reschedule, cancellation, timezone-aware blocks, completion, private message draft review without sending/XSS, gallery images/filters/dialog, language persistence and 40 responsive checks. No JavaScript errors.');
}finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});
}
