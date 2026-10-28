import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {mkdtemp,writeFile,readFile,rm,readdir,stat} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {encryptBackupFile,decryptBackupFile} from '../backup-encryption.js';
test('copias AES-256-GCM: restauración exacta, integridad, claves y no sobrescribir',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'reca-encryption-')),source=path.join(dir,'source'),cipher=path.join(dir,'copy.enc'),key=randomBytes(32);const content=randomBytes(1024*1024+13);
 try{
  await writeFile(source,content);await encryptBackupFile(source,cipher,key);
  await t.test('copia autenticada recupera bytes exactos y permisos privados',async()=>{const target=path.join(dir,'restored');await decryptBackupFile(cipher,target,key);assert.deepEqual(await readFile(target),content);assert.equal((await stat(cipher)).mode&0o077,0);assert.equal((await stat(target)).mode&0o077,0);});
  await t.test('clave incorrecta no deja datos descifrados',async()=>{await assert.rejects(decryptBackupFile(cipher,path.join(dir,'wrong'),randomBytes(32)),/verificar/);assert.equal((await readdir(dir)).includes('wrong'),false);});
  await t.test('alteración detectada y temporales eliminados',async()=>{const data=await readFile(cipher);data[100]^=1;const corrupt=path.join(dir,'corrupt.enc');await writeFile(corrupt,data);await assert.rejects(decryptBackupFile(corrupt,path.join(dir,'corrupt-out'),key),/verificar/);assert.equal((await readdir(dir)).some(n=>n.endsWith('.partial')||n==='corrupt-out'),false);});
  await t.test('no sobrescribe copias existentes y soporta fichero vacío',async()=>{await assert.rejects(encryptBackupFile(source,cipher,key));await writeFile(path.join(dir,'empty'),Buffer.alloc(0));await encryptBackupFile(path.join(dir,'empty'),path.join(dir,'empty.enc'),key);await decryptBackupFile(path.join(dir,'empty.enc'),path.join(dir,'empty-out'),key);assert.equal((await readFile(path.join(dir,'empty-out'))).length,0);});
 }finally{await rm(dir,{recursive:true,force:true});}
});
