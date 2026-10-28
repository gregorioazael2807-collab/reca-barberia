import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {root} from '../backend/db.js';
import {buildWorkflow} from './build-workflow.js';
const local=path.join(root,'.local');await mkdir(local,{recursive:true,mode:0o700});await chmod(local,0o700);
async function privateKey(name){const file=path.join(local,name);let value;try{value=(await readFile(file,'utf8')).trim();}catch{value=randomBytes(32).toString('hex');await writeFile(file,value,{mode:0o600});}if(!/^[a-f0-9]{64}$/.test(value))throw new Error(`Archivo de clave inválido: ${name}`);await chmod(file,0o600);return value;}
const key=await privateKey('automation-token'),encryption=await privateKey('n8n-encryption-key');
await writeFile(path.join(local,'n8n.env'),`RECA_AUTOMATION_TOKEN=${key}\nN8N_ENCRYPTION_KEY=${encryption}\n`,{mode:0o600});await chmod(path.join(local,'n8n.env'),0o600);
await writeFile(path.join(root,'automation/reca-workflow.json'),JSON.stringify(buildWorkflow(),null,2)+'\n');
await writeFile(path.join(root,'automation/reca-test-workflow.json'),JSON.stringify(buildWorkflow({id:'recaDraftTest',test:true}),null,2)+'\n');
console.log('Flujos de n8n generados. Claves privadas guardadas fuera del código. Flujo de correo preparado; el envío depende de la activación privada independiente. WhatsApp desactivado.');
