import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createGmailRecovery,authorizedSender} from '../gmail.js';

test('Gmail: TLS, configuración privada, prueba fija y sin llamadas reales',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'reca-gmail-')),file=path.join(directory,'gmail.env');
  const messages=[],options=[];let fail=false,closed=0;
  const mailer=createGmailRecovery({configPath:file,createTransport:value=>{
    options.push(value);return {sendMail:async message=>{messages.push(message);if(fail)throw new Error('SENSITIVE SMTP DETAIL');return {accepted:[message.to],rejected:[]};},close:()=>closed++};
  }});
  const config=enabled=>`GMAIL_USER=${authorizedSender}\nGMAIL_APP_PASSWORD=aaaa bbbb cccc dddd\nRECOVERY_EMAIL_ENABLED=${enabled}\n`;
  try{
    await t.test('sin credenciales no se abre conexión; no acepta otro remitente',async()=>{
      assert.equal((await mailer.status()).configured,false);await assert.rejects(mailer.sendTest());assert.equal(options.length,0);
      await writeFile(file,'GMAIL_USER=other@example.test\nGMAIL_APP_PASSWORD=aaaabbbbccccdddd\nRECOVERY_EMAIL_ENABLED=true\n');
      assert.equal((await mailer.status()).enabled,false);await assert.rejects(mailer.sendTest());assert.equal(options.length,0);
    });
    await writeFile(file,config(false));
    await t.test('prueba autorizada solo al remitente, no habilita recuperaciones',async()=>{
      await mailer.sendTest();assert.equal(messages[0].to,authorizedSender);assert.equal(messages[0].from.address,authorizedSender);
      assert.equal(options[0].host,'smtp.gmail.com');assert.equal(options[0].port,465);assert.equal(options[0].secure,true);assert.equal(options[0].tls.rejectUnauthorized,true);
      assert.equal(options[0].logger,false);assert.equal(options[0].debug,false);assert.equal((await mailer.status()).enabled,false);
      await assert.rejects(mailer.sendReset({email:'customer@example.test',url:'http://localhost:8081/#reset/'+'a'.repeat(64)}));assert.equal(messages.length,1);
    });
    await writeFile(file,config(true));
    await t.test('verificación separada: recuperar contraseñas no autoriza nuevos tipos de correo',async()=>{
      assert.equal((await mailer.verificationStatus()).enabled,false);const count=messages.length;
      await assert.rejects(mailer.sendVerification({email:'customer@example.test',url:'http://localhost:8081/#verify/'+'a'.repeat(64)}));assert.equal(messages.length,count);
    });
    await t.test('correo de recuperación: enlace, expiración y aviso de red local',async()=>{
      await mailer.sendReset({email:'customer@example.test',url:'http://localhost:8081/#reset/'+'a'.repeat(64)});
      assert.equal(messages[1].to,'customer@example.test');assert.match(messages[1].text,/30 minutos/);assert.match(messages[1].text,/misma red Wi-Fi/);
      assert.equal(messages[1].disableFileAccess,true);assert.equal(messages[1].disableUrlAccess,true);
      await assert.rejects(mailer.sendReset({email:'customer@example.test',url:'file:///private/#reset/'+'a'.repeat(64)}));
    });
    await t.test('fallos SMTP no exponen información privada',async()=>{
      fail=true;await assert.rejects(mailer.sendTest(),err=>!err.message.includes('SENSITIVE'));assert.equal(closed,3);
    });
    await t.test('verificación habilitada explícitamente, independiente de recuperación',async()=>{
      fail=false;await writeFile(file,config(false)+'VERIFICATION_EMAIL_ENABLED=true\n');
      assert.equal((await mailer.status()).enabled,false);assert.equal((await mailer.verificationStatus()).enabled,true);
      await mailer.sendVerification({email:'customer@example.test',url:'http://localhost:8081/#verify/'+'b'.repeat(64)});
      assert.match(messages.at(-1).subject,/Verifica/);assert.match(messages.at(-1).text,/no suscribe/);assert.equal(closed,4);
    });
  }finally{await rm(directory,{recursive:true,force:true});}
});
