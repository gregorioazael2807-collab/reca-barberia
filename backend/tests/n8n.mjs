// Real n8n -> HTTP -> PostgreSQL draft preparation, exclusively in a disposable DB.
// Requires the RECA container from compose.n8n.yaml; does not use the clinic instance.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {makePool,initialize,root} from '../db.js';
import {createApp} from '../app.js';
import {passwordHash} from '../security.js';
import {enqueueNotification} from '../automation.js';
const exec=promisify(execFile),compose=path.join(root,'compose.n8n.yaml');
const automationToken=(await readFile(path.join(root,'.local/automation-token'),'utf8')).trim();
const database='reca_n8n_'+randomUUID().replaceAll('-',''),control=makePool('postgres');await control.query(`CREATE DATABASE "${database}"`);
const pool=makePool(database),now=Date.parse('2027-01-10T12:00:00Z');let server;
const logFile=path.join(root,'.local/n8n-test.log');
async function command(args){try{const result=await exec('docker',['compose','-f',compose,...args],{timeout:90000,maxBuffer:4*1024*1024});await writeFile(logFile,result.stdout+'\n'+result.stderr,{mode:0o600});await chmod(logFile,0o600);}catch(err){await writeFile(logFile,(err.stdout||'')+'\n'+(err.stderr||'')+'\n'+err.message,{mode:0o600});await chmod(logFile,0o600);throw new Error('Falló el comando de n8n. Registro privado: .local/n8n-test.log');}}
try {
  await initialize(pool);const userId=randomUUID(),bookingId=randomUUID();
  await pool.query("INSERT INTO users(id,role,name,email,password_hash) VALUES($1,'customer','Cliente prueba n8n','n8n@example.test',$2)",[userId,await passwordHash('Private isolated fixture password!')]);
  const snapshot={service:{id:'men',name:{es:'Corte caballeros',en:'Men haircut'},priceCents:3500},timezone:'America/New_York',city:'Tampa, Florida',cancellationNoticeMinutes:300,bookingSpacingMinutes:60};
  const row=(await pool.query("INSERT INTO calendar_entries(id,kind,status,user_id,starts_at,service_ends_at,ends_at,snapshot,notification_revision) VALUES($1,'booking','confirmed',$2,'2027-01-11T15:00:00Z','2027-01-11T16:00:00Z','2027-01-11T16:00:00Z',$3,1) RETURNING *",[bookingId,userId,JSON.stringify(snapshot)])).rows[0];
  
  await enqueueNotification(pool,row,'confirmed','http://localhost:8082',now);
  const app=createApp(pool,{automationToken,clock:()=>now,origin:'http://localhost:8082'});
  server=app.listen(8082,'0.0.0.0');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  await command(['exec','-T','n8n','n8n','import:workflow','--input=/files/reca-test-workflow.json']);
  await command(['exec','-T','-e','N8N_RUNNERS_BROKER_PORT=5689','n8n','n8n','execute','--id=recaDraftTest']);
  const job=(await pool.query('SELECT * FROM notification_jobs WHERE booking_id=$1',[bookingId])).rows[0];
  assert.equal(job.status,'prepared');assert.equal(job.attempts,1);assert.match(job.draft.emailText,/Cliente prueba n8n/);assert.match(job.draft.emailText,/35\.00/);assert.match(job.draft.emailText,/10:00/);assert.match(job.draft.emailText,/5 horas/);assert.equal(job.draft.whatsappText,undefined);
  // Execute again: the prepared task must not be claimed or drafted twice.
  await command(['exec','-T','-e','N8N_RUNNERS_BROKER_PORT=5689','n8n','n8n','execute','--id=recaDraftTest']);
  assert.equal((await pool.query('SELECT attempts FROM notification_jobs WHERE id=$1',[job.id])).rows[0].attempts,1);
  console.log('OK n8n real: tarea recogida por HTTP, mensaje redactado y guardado en PostgreSQL, reintento sin duplicado. Base aislada. Cero envíos a proveedores.');
} finally {
  if(server?.listening)await new Promise(resolve=>server.close(resolve));await pool.end();await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);await control.end();
}
