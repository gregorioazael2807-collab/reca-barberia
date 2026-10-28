import {writeFile,chmod} from 'node:fs/promises';
import {appointmentEmail,appointmentEmailConfigPath} from './appointment-email.js';
import {authorizedSender} from './gmail.js';
const args=new Set(process.argv.slice(2));
if(!args.has('--send-test')||!args.has('--authorize-new-events'))throw new Error('Requiere autorización expresa: --send-test --authorize-new-events. La prueba solo se envía al remitente.');
const status=await appointmentEmail.status();if(!status.configured)throw new Error('Configura privadamente Gmail antes de activar los correos.');
await appointmentEmail.sendPreview();
console.log('Gmail aceptó el correo de prueba para el remitente autorizado. Esto no confirma recepción en la bandeja de entrada.');
// Preserve the initial cutoff on repeated activation; never widen it to old events.
const settings={enabled:true,sender:authorizedSender,activatedAt:status.enabled?status.activatedAt:new Date().toISOString(),events:['confirmed','rescheduled','cancelled','reminder'],whatsappEnabled:false};
await writeFile(appointmentEmailConfigPath,JSON.stringify(settings,null,2)+'\n',{mode:0o600});await chmod(appointmentEmailConfigPath,0o600);
console.log('Envío de correos habilitado para eventos nuevos. Cola histórica excluida; WhatsApp desactivado. Revisa Bandeja de entrada y Spam.');
