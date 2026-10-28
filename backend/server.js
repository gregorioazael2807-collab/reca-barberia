import { readFile, writeFile, mkdir, chmod, unlink } from 'node:fs/promises';
import path from 'node:path';
import { makePool, initialize, root } from './db.js';
import { createApp } from './app.js';
import { token } from './security.js';
import {cleanRecoveryDrafts,saveRecoveryDraft,removeRecoveryDrafts} from './recovery-drafts.js';
import {gmailRecovery} from './gmail.js';
import {appointmentEmail} from './appointment-email.js';
import {runtimeConfig} from './runtime-config.js';
import {identityHasher} from './identity.js';
import {gochoProvider} from './gocho-provider.js';
const runtime=runtimeConfig(),{port,host,origin,privateDir}=runtime;
await mkdir(privateDir,{recursive:true,mode:0o700});await chmod(privateDir,0o700);
const identityKeyPath=path.join(privateDir,'referral-identity-key');
let identityKey;try{identityKey=(await readFile(identityKeyPath,'utf8')).trim();}catch(err){
  if(err.code!=='ENOENT')throw err;identityKey=token();
  try{await writeFile(identityKeyPath,identityKey,{mode:0o600,flag:'wx'});}catch(writeError){if(writeError.code!=='EEXIST')throw writeError;identityKey=(await readFile(identityKeyPath,'utf8')).trim();}
}
await chmod(identityKeyPath,0o600);const identityHash=identityHasher(identityKey);
const pool=makePool();await initialize(pool);
const configured=!!(await pool.query("SELECT 1 FROM users WHERE role='owner' AND NOT owner_setup_pending")).rowCount;
let setupToken;
const secretPath=path.join(privateDir,'owner-setup-token');
if(!configured) {
  try {setupToken=(await readFile(secretPath,'utf8')).trim();} catch {setupToken=token();await writeFile(secretPath,setupToken,{mode:0o600});}
  await writeFile(path.join(privateDir,'owner-setup-url.txt'),`${origin}/comanda/#setup/${setupToken}\n`,{mode:0o600});
  console.log('Configura el dueño usando el enlace privado en .local/owner-setup-url.txt. No compartas ese enlace.');
} else {
  await unlink(secretPath).catch(()=>{});await unlink(path.join(privateDir,'owner-setup-url.txt')).catch(()=>{});
}
const automationTokenPath=path.join(privateDir,'automation-token');
let automationToken;
try {automationToken=(await readFile(automationTokenPath,'utf8')).trim();}catch{automationToken=token();await writeFile(automationTokenPath,automationToken,{mode:0o600});}
if(!/^[a-f0-9]{64}$/.test(automationToken))throw new Error('Clave privada de automatización inválida.');
await chmod(automationTokenPath,0o600);
await cleanRecoveryDrafts();
const recoveryCleanup=setInterval(()=>{
  cleanRecoveryDrafts().catch(()=>console.error('No se pudieron limpiar los borradores privados caducados.'));
  if(runtime.production)pool.query("DELETE FROM request_limits WHERE window_start<=now()-interval '5 minutes'").catch(()=>console.error('No se pudo limpiar el registro temporal de límites.'));
},60000);
recoveryCleanup.unref();
const gocho=await gochoProvider({privateDir});
const app=createApp(pool,{appointmentMailer:appointmentEmail,gocho,setupToken,origin,automationToken,uploads:runtime.uploads,production:runtime.production,trustProxy:runtime.trustProxy,secureCookies:runtime.secureCookies,requireVerifiedReferrals:true,identityHash,saveRecoveryDraft,removeRecoveryDrafts,sendRecoveryEmail:gmailRecovery.sendReset,recoveryEmailStatus:gmailRecovery.status,sendVerificationEmail:gmailRecovery.sendVerification,verificationEmailStatus:gmailRecovery.verificationStatus,allowedOrigins:runtime.production?[]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]});
const server=app.listen(port,host,()=>console.log(`RECA Barbería: ${origin} · ${host==='127.0.0.1'?'Acceso local':'Prueba en red local; no exponer a Internet'}`));
async function close(){server.close(async()=>{await pool.end();process.exit(0);});}
process.on('SIGTERM',close);process.on('SIGINT',close);
