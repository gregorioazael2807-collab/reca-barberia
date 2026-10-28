import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,link,unlink,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import path from 'node:path';
const magic=Buffer.from('RECAENC1'),headerLength=20,tagLength=16;
function validKey(key){if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('La clave de cifrado debe tener 32 bytes.');}
async function output(target,fn){
 const temp=path.join(path.dirname(target),'.'+path.basename(target)+'.'+randomUUID()+'.partial');
 try{await fn(temp);await link(temp,target);}finally{await unlink(temp).catch(()=>{});}
}
export async function encryptBackupFile(source,target,key){
 validKey(key);const nonce=randomBytes(12),header=Buffer.concat([magic,nonce]),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
 await output(target,temp=>pipeline(createReadStream(source),cipher,async function*(stream){yield header;for await(const chunk of stream)yield chunk;yield cipher.getAuthTag();},createWriteStream(temp,{flags:'wx',mode:0o600})));
}
export async function decryptBackupFile(source,target,key){
 validKey(key);const size=(await stat(source)).size;if(size<headerLength+tagLength)throw new Error('Copia cifrada incompleta.');
 const file=await open(source,'r'),header=Buffer.alloc(headerLength),tag=Buffer.alloc(tagLength);
 try{await file.read(header,0,headerLength,0);await file.read(tag,0,tagLength,size-tagLength);}finally{await file.close();}
 if(!header.subarray(0,magic.length).equals(magic))throw new Error('Formato de copia cifrada inválido.');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(magic.length));decipher.setAAD(header);decipher.setAuthTag(tag);
 const input=size===headerLength+tagLength?Readable.from([]):createReadStream(source,{start:headerLength,end:size-tagLength-1});
 try{await output(target,temp=>pipeline(input,decipher,createWriteStream(temp,{flags:'wx',mode:0o600})));}
 catch(err){if(err.code==='EEXIST')throw new Error('El destino ya existe; no se sobrescribió.');throw new Error('No se pudo verificar/descifrar la copia. Revisa la clave y la integridad.');}
}
