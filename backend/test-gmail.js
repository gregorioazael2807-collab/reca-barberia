// Authorized single test recipient. Never accept arbitrary addresses or auto-enable.
import {gmailRecovery,authorizedSender} from './gmail.js';
try{
  const status=await gmailRecovery.status();
  if(!status.configured){console.error('Falta la contraseña de aplicación en .local/gmail.env. No se hizo ninguna conexión a Gmail.');process.exitCode=1;}
  else{
    await gmailRecovery.sendTest();
    console.log(`Gmail aceptó la prueba dirigida únicamente a ${authorizedSender}. Comprueba Bandeja de entrada y Spam. Esto no garantiza recepción; las recuperaciones siguen según la configuración privada.`);
  }
}catch(err){console.error(err.message);process.exitCode=1;}
