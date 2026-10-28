import {readFile,writeFile,chmod} from 'node:fs/promises';
import {gmailRecovery,gmailConfigPath} from './gmail.js';
try{
  if(!process.argv.includes('--confirm-received'))throw new Error('Primero confirma que recibiste la prueba autorizada. No se habilitaron los envíos.');
  if(!(await gmailRecovery.status()).configured)throw new Error('Falta completar la configuración privada de Gmail.');
  const value=await readFile(gmailConfigPath,'utf8');
  const next=/^RECOVERY_EMAIL_ENABLED=.*$/m.test(value)?value.replace(/^RECOVERY_EMAIL_ENABLED=.*$/m,'RECOVERY_EMAIL_ENABLED=true'):value+'\nRECOVERY_EMAIL_ENABLED=true\n';
  await writeFile(gmailConfigPath,next,{mode:0o600});await chmod(gmailConfigPath,0o600);
  console.log('Correos de recuperación habilitados. Recarga la aplicación. WhatsApp y los mensajes de citas no se habilitaron.');
}catch(err){console.error(err.message);process.exitCode=1;}
