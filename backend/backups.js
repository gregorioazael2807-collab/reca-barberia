import {mkdir,readdir,copyFile,writeFile,readFile,chmod,lstat,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {rootCertificates} from 'node:tls';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {databaseConfig,root} from './db.js';
const exec=promisify(execFile),photoName=/^[a-f0-9-]{36}\.(webp|mp4|mp3|m4a)$/;
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function pgEnvironment(database,directory){
  const config=databaseConfig(database);let env={...process.env};
  if(config.connectionString){
    const url=new URL(config.connectionString);env={...env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:config.ssl?'verify-full':'disable'};
    if(config.ssl){const ca=path.join(directory,'temporary-ca.pem');await writeFile(ca,process.env.DB_SSL_CA||rootCertificates.join('\n'),{mode:0o600});env.PGSSLROOTCERT=ca;}
  }else env={...env,PGHOST:config.host,PGPORT:String(config.port),PGUSER:config.user||os.userInfo().username,PGDATABASE:config.database,PGSSLMODE:'disable'};
  return env;
}
export async function createBackup({database,uploads=process.env.UPLOAD_DIR||path.join(root,'.local/uploads'),destination=process.env.BACKUP_DIR||path.join(root,'.local/backups')}={}){
  if(process.env.NODE_ENV==='production'&&(!process.env.BACKUP_DIR||!path.isAbsolute(destination)))throw new Error('Configura BACKUP_DIR privado y absoluto en producción.');
  const publicDirectory=path.join(root,'prototipo'),targetDirectory=path.resolve(destination),photosDirectory=path.resolve(uploads);
  if(targetDirectory===publicDirectory||targetDirectory.startsWith(publicDirectory+path.sep)||targetDirectory===photosDirectory||targetDirectory.startsWith(photosDirectory+path.sep))throw new Error('Un respaldo no puede guardarse en un directorio público.');
  const directory=path.join(destination,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
  await mkdir(path.join(directory,'uploads'),{recursive:true,mode:0o700});await chmod(directory,0o700);
  const env=await pgEnvironment(database,directory);
  try{await exec('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',path.join(directory,'database.dump')],{env,timeout:120000});}
  catch{throw new Error('No se pudo crear el volcado de PostgreSQL. El respaldo no está completo.');}
  finally{await unlink(path.join(directory,'temporary-ca.pem')).catch(()=>{});}
  await chmod(path.join(directory,'database.dump'),0o600);
  let files;try{files=await readdir(uploads);}catch(err){if(err.code!=='ENOENT')throw err;files=[];}
  const photos=[];
  for(const name of files){
    const source=path.join(uploads,name);if(!photoName.test(name)||(await lstat(source)).isSymbolicLink())throw new Error('Archivo inesperado en uploads; revisar antes de respaldar.');
    const target=path.join(directory,'uploads',name);await copyFile(source,target);await chmod(target,0o600);photos.push({name,sha256:await hashFile(target)});
  }
  const manifest={version:1,createdAt:new Date().toISOString(),databaseSha256:await hashFile(path.join(directory,'database.dump')),photos};
  await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  return directory;
}
export async function verifyBackup(directory){
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1||await hashFile(path.join(directory,'database.dump'))!==manifest.databaseSha256)throw new Error('El volcado no coincide con el respaldo.');
  for(const photo of manifest.photos){if(!photoName.test(photo.name)||await hashFile(path.join(directory,'uploads',photo.name))!==photo.sha256)throw new Error('Una foto, video o música no coincide con el respaldo.');}
  return manifest;
}
export async function restoreIsolated(directory,database,photosDirectory){
  // No restore path accepts the business DB name. The caller creates this empty test DB.
  if(!/^reca_restore_[a-f0-9]{32}$/.test(database))throw new Error('Solo se permite restaurar en una base temporal reca_restore_.');
  const manifest=await verifyBackup(directory),env=await pgEnvironment(database,directory);
  try{await exec('pg_restore',['--no-owner','--no-privileges','--exit-on-error','--dbname',database,path.join(directory,'database.dump')],{env,timeout:120000});}
  catch{throw new Error('La restauración aislada falló. No utilizar este respaldo sin revisar.');}
  finally{await unlink(path.join(directory,'temporary-ca.pem')).catch(()=>{});}
  await mkdir(photosDirectory,{recursive:true,mode:0o700});
  for(const photo of manifest.photos){const target=path.join(photosDirectory,photo.name);await copyFile(path.join(directory,'uploads',photo.name),target);await chmod(target,0o600);}
  return manifest;
}
