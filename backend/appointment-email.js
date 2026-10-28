import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
import nodemailer from 'nodemailer';
import {root} from './db.js';
import {authorizedSender,gmailConfigPath} from './gmail.js';
import {email,text} from './security.js';
export const appointmentEmailConfigPath=path.join(process.env.PRIVATE_DIR||path.join(root,'.local'),'appointment-email.json');
export function createAppointmentEmail({configPath=appointmentEmailConfigPath,credentialsPath=gmailConfigPath,createTransport=options=>nodemailer.createTransport(options)}={}){
 async function config(){
  let credentials={};try{credentials=parseEnv(await readFile(credentialsPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('No se pudo leer la configuración privada de correo.');}
  const user=(credentials.GMAIL_USER||'').trim().toLowerCase(),pass=(credentials.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
  const configured=user===authorizedSender&&/^[a-zA-Z0-9]{16}$/.test(pass);
  let settings={};try{settings=JSON.parse(await readFile(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Configuración privada de correos de citas inválida.');}
  const timestamp=Date.parse(settings.activatedAt);
  const enabled=configured&&settings.enabled===true&&Number.isFinite(timestamp)&&settings.sender===authorizedSender;
  return {user,pass,configured,enabled,activatedAt:enabled?new Date(timestamp).toISOString():null};
 }
 async function send({to,subject,body,messageId},{preview=false}={}){
  const value=await config();if(!value.configured||(!preview&&!value.enabled))throw new Error('Correos de citas desactivados.');
  const recipient=email(preview?authorizedSender:to);
  const transport=createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:value.user,pass:value.pass},tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,logger:false,debug:false});
  try{
   const result=await transport.sendMail({from:{name:'RECA Barbería',address:value.user},replyTo:value.user,to:recipient,subject:text(subject,200),text:text(body,4000),...(messageId?{messageId}:{}),disableFileAccess:true,disableUrlAccess:true});
   if(!result.accepted?.some(address=>String(address).toLowerCase()===recipient)||result.rejected?.length)throw new Error();
   return {accepted:true};
  }catch{throw new Error('No se pudo confirmar la aceptación por Gmail. Revisar antes de reintentar para evitar duplicados.');}
  finally{transport.close?.();}
 }
 return {
  status:async()=>{const value=await config();return {configured:value.configured,enabled:value.enabled,activatedAt:value.activatedAt,sender:authorizedSender};},
  send:message=>send(message),
  sendPreview:()=>send({subject:'RECA Barbería · Prueba autorizada de correos de citas',body:'Hola:\n\nEsta es una prueba autorizada de los correos automáticos de RECA Barbería, enviados desde Artes Global Market. No corresponde a ninguna cita ni contiene datos de clientes.\n\nCuando reserves o gestiones una cita, el correo incluirá el servicio, fecha, hora local de la barbería, importe acordado y enlace para consultar tu reserva. Los recordatorios se preparan una hora antes.\n\nEsta prueba no activa WhatsApp. El envío automático de citas se controla desde la configuración privada y n8n.\n\nGracias,\nRECA Barbería\nArtes Global Market'},{preview:true})
 };
}
export const appointmentEmail=createAppointmentEmail();
