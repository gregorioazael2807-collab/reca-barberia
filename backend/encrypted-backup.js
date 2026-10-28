import {mkdir,readFile,writeFile,lstat,mkdtemp,rm} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';import {createReadStream} from 'node:fs';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';
import {createBackup,verifyBackup} from './backups.js';import {encryptBackupFile,decryptBackupFile} from './backup-encryption.js';
import {runtimeConfig} from './runtime-config.js';import {root} from './db.js';
const runtime=runtimeConfig(),privateDir=runtime.privateDir,keyFile=path.join(privateDir,'backup-encryption-key');
await mkdir(privateDir,{recursive:true,mode:0o700});
if((await lstat(privateDir)).mode&0o077)throw new Error('El directorio privado debe tener permisos 700.');
try{await writeFile(keyFile,randomBytes(32),{flag:'wx',mode:0o600});}catch(err){if(err.code!=='EEXIST')throw err;}
const info=await lstat(keyFile);if(info.isSymbolicLink()||!info.isFile()||(info.mode&0o077))throw new Error('La clave debe ser archivo privado regular de permisos 600.');
const key=await readFile(keyFile);if(key.length!==32)throw new Error('Clave de copia inválida; no se reemplazó.');
const backup=await createBackup({uploads:runtime.uploads});await verifyBackup(backup);
const temp=await mkdtemp(path.join(privateDir,'encrypt-check-'));
async function hash(file){const value=createHash('sha256');for await(const chunk of createReadStream(file))value.update(chunk);return value.digest('hex');}
try{
 const pack=path.join(temp,'backup.tar.gz'),verified=path.join(temp,'verified.tar.gz'),target=backup+'.reca.enc';
 await promisify(execFile)('tar',['-czf',pack,'-C',backup,'.'],{timeout:120000});
 await encryptBackupFile(pack,target,key);await decryptBackupFile(target,verified,key);
 if(await hash(pack)!==await hash(verified))throw new Error('Verificación de copia cifrada falló.');
 console.log('Copia local cifrada y descifrado verificados: '+path.relative(root,target));
 console.log('La clave permanece en el directorio privado, no se muestra. Pendiente copiar cifrado a destino externo autorizado y custodiar la clave por separado. La copia DB/medios original local sigue siendo privada pero no cifrada.');
}finally{await rm(temp,{recursive:true,force:true});}
