import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
import nodemailer from 'nodemailer';
import {root} from './db.js';

export const authorizedSender='demo-54b54911@example.com';
export const gmailConfigPath=path.join(process.env.PRIVATE_DIR||path.join(root,'.local'),'gmail.env');
export function createGmailRecovery({configPath=gmailConfigPath,createTransport=options=>nodemailer.createTransport(options)}={}) {
  async function config(){
    let value;try{value=parseEnv(await readFile(configPath,'utf8'));}catch(err){if(err.code==='ENOENT')return {configured:false,enabled:false};throw new Error('No se pudo leer la configuración privada de Gmail.');}
    const user=(value.GMAIL_USER||'').trim().toLowerCase();
    const pass=(value.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
    const configured=user===authorizedSender&&/^[a-zA-Z0-9]{16}$/.test(pass);
    return {user,pass,configured,enabled:configured&&value.RECOVERY_EMAIL_ENABLED==='true',verificationEnabled:configured&&value.VERIFICATION_EMAIL_ENABLED==='true'};
  }
  async function send(to,subject,text,{test=false,verification=false}={}){
    const value=await config();
    if(!value.configured||(!test&&!(verification?value.verificationEnabled:value.enabled)))throw new Error('Gmail no está habilitado. Completa la configuración privada y la prueba de recepción.');
    const transport=createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:value.user,pass:value.pass},tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,logger:false,debug:false});
    try{
      const result=await transport.sendMail({from:{name:'RECA Barbería',address:value.user},to,subject,text,disableFileAccess:true,disableUrlAccess:true});
      if(!result.accepted?.some(address=>String(address).toLowerCase()===to.toLowerCase())||result.rejected?.length)throw new Error();
      return {accepted:true};
    }catch{
      // Never expose SMTP errors: they can contain addresses or authentication data.
      throw new Error('Gmail no aceptó el correo. Revisa privadamente la contraseña de aplicación y la cuenta de Google.');
    }finally{transport.close?.();}
  }
  return {
    status:async()=>{const value=await config();return {configured:value.configured,enabled:value.enabled,mode:value.enabled?'email':'draft-only'};},
    verificationStatus:async()=>{const value=await config();return {enabled:value.verificationEnabled===true};},
    sendVerification:async draft=>{
      const url=new URL(draft.url);
      if(!['http:','https:'].includes(url.protocol)||!/^#verify\/[a-f0-9]{64}$/.test(url.hash))throw new Error('Enlace de verificación inválido.');
      await send(draft.email,'RECA Barbería · Verifica tu correo',`Confirma el correo de tu cuenta de cliente de RECA Barbería:\n\n${draft.url}\n\nEl enlace vence en 30 minutos y solo sirve una vez. Verificar el correo no suscribe tu cuenta a publicidad. Si no solicitaste este correo, ignóralo.${url.protocol==='http:'?'\nPrueba local: abre el enlace en la misma red Wi-Fi que la computadora.':''}`,{verification:true});
    },
    sendTest:()=>send(authorizedSender,'RECA Barbería · Prueba de recuperación','Prueba autorizada de la conexión de correo de RECA Barbería. No contiene datos de clientes ni modifica cuentas. Confirma que recibiste este mensaje antes de habilitar las recuperaciones.',{test:true}),
    sendReset:async draft=>{
      const url=new URL(draft.url);
      if(!['http:','https:'].includes(url.protocol)||!/^#reset\/[a-f0-9]{64}$/.test(url.hash))throw new Error('Enlace de recuperación inválido.');
      const localNotice=url.protocol==='http:'?'\nEste enlace de prueba local requiere que el teléfono y la computadora estén conectados a la misma red Wi-Fi.\n':'';
      await send(draft.email,'RECA Barbería · Recupera tu contraseña',`Solicitaste recuperar tu contraseña de cliente en RECA Barbería.\n\nAbre este enlace para elegir una nueva contraseña:\n${draft.url}\n\nEl enlace vence en 30 minutos y solo puede utilizarse una vez. Si no solicitaste este cambio, ignora este correo. Tu contraseña no cambia hasta completar la recuperación.\n${localNotice}`);
    }
  };
}
export const gmailRecovery=createGmailRecovery();
