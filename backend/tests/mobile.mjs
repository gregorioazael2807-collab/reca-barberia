import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium,webkit,devices} from '@playwright/test';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {token} from '../security.js';
const database='reca_mobile_'+randomUUID().replaceAll('-','');
const control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
const pool=makePool(database),uploads=await mkdtemp(path.join(os.tmpdir(),'reca-mobile-'));
let server,browser;let checks=0;const errors=[];
try{
  await initialize(pool);const setupToken=token(),app=createApp(pool,{setupToken,uploads,rateLimit:100});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;app.locals.origin=base;
  const ownerPassword='Private mobile owner password!';
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Setup-Token':setupToken},body:JSON.stringify({name:'Dueño móvil aislado',password:ownerPassword})});assert.equal(setup.status,200);
  await mkdir(path.join(root,'prototipo/evidencias'),{recursive:true});
  for(const [index,engine,device,label] of [[0,webkit,'iPhone SE','iphone-se'],[1,webkit,'iPhone 13','iphone-13'],[2,chromium,'Pixel 5','android']]){
    browser=await engine.launch();const context=await browser.newContext({...devices[device]});const page=await context.newPage();page.on('pageerror',err=>errors.push(label+': '+err.message));
    async function fits(route){
      const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,shell:document.querySelector('.app-shell').getBoundingClientRect().width,lock:document.querySelector('header .owner-access')?.getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('input:not([type=checkbox]):not([type=range]),select,textarea')].map(el=>({font:parseFloat(getComputedStyle(el).fontSize),width:el.getBoundingClientRect().width,limit:innerWidth}))}));
      assert.ok(dimensions.scroll<=dimensions.viewport,`${label}/${route} overflow ${JSON.stringify(dimensions)}`);
      assert.ok(Math.abs(dimensions.shell-dimensions.viewport)<=1,`${label}/${route} does not fill phone width`);
      for(const field of dimensions.controls){assert.ok(field.font>=16,`${label}/${route} control could trigger iOS focus zoom`);assert.ok(field.width<=field.limit,`${label}/${route} input too wide`);}
      if(route!=='admin'&&route!=='private-dashboard'&&route!=='authenticated-admin'){
        const targets=await page.evaluate(()=>[...document.querySelectorAll('[data-client-language]')].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height})));
        assert.equal(targets.length,2);
        for(const box of targets)assert.ok(box.width>=44&&box.height>=44,`${label}/${route}: small language target ${JSON.stringify(box)}`);
      }
      assert.equal(dimensions.lock,undefined,`${label}/${route} owner controls are separate in Comanda RENKA`);
      checks++;
    }
    for(const viewport of [{width:320,height:568},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      for(const route of ['home','gallery','booking','appointments','profile','admin']){
        await page.goto(route==='admin'?base+'/comanda/#admin':base+'/#'+route);await page.locator('main h1').first().waitFor();await fits(route);
        assert.equal(await page.locator('.bottom-nav, .service, .gallery-grid, #real-date').count(),0);
        if(!['profile','admin'].includes(route))assert.equal(new URL(page.url()).hash,'#register');
      }
    }
    await page.setViewportSize(devices[device].viewport);
    await page.goto(base+'/#profile');await page.locator('[data-form=register]').waitFor();
    assert.equal(await page.locator('details').count(),0);
    assert.equal(await page.locator('main [href="#admin"]').count(),0);
    assert.equal(await page.locator('[data-form=owner-login], [data-form=setup]').count(),0);
    assert.equal(await page.locator('[data-form=login]').count(),0);
    assert.equal(await page.getByRole('button',{name:'Crear mi perfil de cliente'}).count(),0);
    await page.locator('[data-server-action=show-login]').click();
    assert.equal(await page.locator('[data-form=register]').count(),0);
    assert.equal(new URL(page.url()).hash,'#login');assert.equal(await page.locator('[role=group][aria-label="Acceso a tu cuenta"]').count(),0);
    await page.locator('[data-form=login] [name=password]').focus();
    await fits('focused-password');assert.equal(await page.locator('.bottom-nav').count(),0);
    await page.getByRole('heading',{name:'Iniciar sesión',exact:true}).click();
    await page.locator('[data-server-action=show-register]').click();
    assert.equal(await page.locator('[data-form=login]').count(),0);
    await page.goto(base+'/#booking');
    await page.getByRole('heading',{name:'Crear cuenta',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'#register');
    assert.equal(await page.locator('[data-form=login], [data-form=owner-login], [data-form=setup]').count(),0);
    const register=page.locator('[data-form=register]');
    await register.locator('[name=name]').fill('Cliente móvil '+label);await register.locator('[name=email]').fill(`mobile-${index}@example.test`);await register.locator('[name=password]').fill('Private mobile customer password!');await register.getByRole('button',{name:'Crear cuenta de cliente',exact:true}).click();
    await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();assert.equal(new URL(page.url()).hash,'#home');
    await page.reload();await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();assert.equal(await page.locator('[data-form=register]').count(),0);
    // A language picker must not be mistaken for the text keyboard on touch devices.
    for(const route of ['home','gallery','booking','appointments','profile']){
      await page.goto(base+'/#'+route);await page.locator('.bottom-nav').waitFor();
      for(const language of ['en','es']){
        await page.locator(`[data-client-language="${language}"]`).tap();
        assert.equal(await page.locator('html').getAttribute('lang'),language);
        assert.equal(await page.locator(`[data-client-language="${language}"]`).getAttribute('aria-pressed'),'true');
        const headings={home:['Tu próximo corte exclusivo','Your next exclusive haircut'],gallery:['Elige tu referencia','Choose your inspiration'],booking:['Reservar cita','Reserve appointment'],appointments:['Mis citas','My appointments'],profile:['Mi cuenta','My account']};
        await page.getByRole('heading',{name:headings[route][language==='en'?1:0],exact:true}).first().waitFor();
        assert.equal(await page.locator('.bottom-nav').isVisible(),true,`${label}/${route}/${language}: language change hid navigation`);
        assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('editing-field')),false);
        checks++;
      }
    }
    for(const viewport of [{width:320,height:568},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      for(const route of ['home','gallery','booking','appointments','profile','admin']){
        await page.goto(route==='admin'?base+'/comanda/#admin':base+'/#'+route);await page.locator('main h1').first().waitFor();await fits('authenticated-'+route);
      }
    }
    await page.setViewportSize(devices[device].viewport);
    await page.goto(base+'/#home');await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();await page.screenshot({path:path.join(root,`prototipo/evidencias/${label}-inicio.png`),fullPage:true});
    await page.goto(base+'/#profile');await page.getByRole('heading',{name:'Cliente móvil '+label,exact:true}).waitFor();
    assert.equal((await pool.query('SELECT role FROM users WHERE email=$1',[`mobile-${index}@example.test`])).rows[0].role,'customer');
    await page.goto(base+'/comanda/');await page.locator('.warning').filter({hasText:'Solo el dueño'}).waitFor();assert.equal(await page.locator('[data-form=service], [data-form=setup], [data-form=register]').count(),0);
    await page.goto(base+'/#profile');await page.locator('[data-server-action=logout]').click();await page.locator('#server-feedback').filter({hasText:'Operación completada'}).waitFor();await page.locator('[data-form=register]').waitFor();
    // Existing customers sign in and enter Home, without registering again.
    await page.goto(base+'/#booking');await page.getByRole('heading',{name:'Crear cuenta',exact:true}).waitFor();
    await page.locator('[data-server-action=show-login]').click();
    assert.equal(new URL(page.url()).hash,'#login');assert.equal(await page.locator('[data-form=register]').count(),0);
    const customerLogin=page.locator('[data-form=login]');await customerLogin.locator('[name=email]').fill(`mobile-${index}@example.test`);await customerLogin.locator('[name=password]').fill('Private mobile customer password!');await customerLogin.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('heading',{name:'Tu próximo corte exclusivo'}).waitFor();assert.equal(new URL(page.url()).hash,'#home');
    await page.goto(base+'/#profile');await page.locator('[data-server-action=logout]').click();await page.locator('#server-feedback').filter({hasText:'Operación completada'}).waitFor();
    await page.goto(base+'/comanda/');await page.getByRole('heading',{name:'Acceso del dueño'}).waitFor();
    assert.equal(await page.locator('[data-form=register]').count(),0);assert.equal(await page.locator('[data-form=setup]').count(),0);
    const login=page.locator('[data-form=owner-login]');assert.equal(await login.locator('[name=email]').inputValue(),'');await login.locator('[name=email]').fill('demo-54b54911@example.com');
    await login.locator('[name=password]').fill(ownerPassword);
    assert.equal(await login.evaluate(f=>f.checkValidity()),true,`${label} owner login form must be valid`);
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/auth/owner-login'));
    await login.getByRole('button',{name:'Entrar al panel privado',exact:true}).click();
    const loginResponse=await responsePromise;assert.equal(loginResponse.status(),200,await loginResponse.text());
    try{await page.locator('header [data-comanda-menu=open]').waitFor({timeout:10000});}catch(err){throw new Error(`${label} owner screen: ${await page.locator('main').innerText()} / JS: ${errors.join('; ')}`);}
    assert.equal(await page.locator('#comanda-menu').isVisible(),false);assert.equal(await page.locator('[data-form=settings]').count(),0);await fits('private-dashboard');
    await page.goto(base+'/#profile');await page.getByRole('heading',{name:'Sesión del dueño activa'}).waitFor();assert.equal(await page.locator('[data-form=account], [data-form=register]').count(),0);
    await page.locator('[data-server-action=logout]').click();await page.locator('#server-feedback').filter({hasText:'Operación completada'}).waitFor();await page.locator('[data-form=register]').waitFor();
    await page.screenshot({path:path.join(root,`prototipo/evidencias/${label}-cuenta.png`),fullPage:true});
    await page.goto(base+'/#home');await page.getByRole('heading',{name:'Crear cuenta',exact:true}).waitFor();assert.equal(await page.locator('.bottom-nav').count(),0);await page.screenshot({path:path.join(root,`prototipo/evidencias/${label}-registro.png`),fullPage:true});
    await browser.close();browser=null;
  }
  assert.deepEqual(errors,[]);console.log(`OK móvil: ${checks} comprobaciones de ajuste, iPhone/WebKit y Android/Chromium, orientación horizontal, controles sin zoom automático, teclado sin navegación superpuesta, aplicación bloqueada sin sesión, entrada a Inicio tras registro o login, sesión recuperada al volver y acceso exclusivo del dueño. Sin errores JavaScript.`);
}finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();await rm(uploads,{recursive:true,force:true});
}
