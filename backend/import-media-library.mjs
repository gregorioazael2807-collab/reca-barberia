// Explicit, local CLI import. Never fetches URLs or changes public selections.
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {makePool,initialize,root} from './db.js';
import {inspectMusic} from './music-files.js';
import {inspectVideo} from './video-files.js';
import {text} from './security.js';
import sharp from 'sharp';
const replaceVideos=process.argv.includes('--replace-videos');
const filename=process.argv[2];if(!filename)throw new Error('Indica el manifiesto local de fuentes/licencias.');
const entries=JSON.parse(await readFile(filename,'utf8'));
if(!Array.isArray(entries)||(replaceVideos?(entries.length!==10||entries.some(e=>e.kind!=='video')):(entries.length!==20||entries.filter(e=>e.kind==='music').length!==10||entries.filter(e=>e.kind==='video').length!==10)))throw new Error(replaceVideos?'Se requieren 10 videos profesionales.':'Se requieren 10 pistas y 10 videos distintos.');
const urls=new Set(),prepared=[];
for(const item of entries){
 if(item.permissionConfirmed!==true||!['CC BY 4.0','CC BY-SA 4.0','CC BY-SA 3.0 nl','Public domain','Mixkit Stock Video Free License'].includes(item.license))throw new Error('Licencia no admitida.');
 const source=new URL(item.sourceUrl),license=new URL(item.licenseUrl);if(source.protocol!=='https:'||license.protocol!=='https:'||!['commons.wikimedia.org','incompetech.com','mixkit.co'].includes(source.hostname)||!['creativecommons.org','mixkit.co'].includes(license.hostname))throw new Error('Fuente o licencia no admitida.');
 if(item.license==='Mixkit Stock Video Free License'&&(item.kind!=='video'||source.hostname!=='mixkit.co'||license.href!=='https://mixkit.co/license/#videoFree'))throw new Error('Licencia de video Mixkit no válida.');
 if(urls.has(item.sourceUrl))throw new Error('Fuente duplicada.');urls.add(item.sourceUrl);
 const bytes=await readFile(item.file);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Checksum inválido.');
 const extension=item.kind==='video'?'mp4':path.extname(item.file).slice(1),metadata=item.kind==='video'?inspectVideo(bytes):inspectMusic(bytes,extension);
 const data={title:text(item.title,100),sourceTitle:text(item.sourceTitle,250),author:text(item.author,500),license:item.license,licenseUrl:license.href,sourceUrl:source.href,modification:text(item.modification,300),permissionConfirmed:true,...metadata,sha256:item.sha256};
 let poster=null;if(item.kind==='video'&&item.posterFile){const image=await readFile(item.posterFile);if(createHash('sha256').update(image).digest('hex')!==item.posterSha256)throw new Error('Miniatura alterada.');poster=await sharp(image,{limitInputPixels:4000000}).webp({quality:82}).toBuffer();}
 prepared.push({kind:item.kind,bytes,extension,data,poster});
}
const pool=makePool(),uploads=process.env.UPLOAD_DIR||path.join(root,'.local/uploads'),created=[];let db,committed=false;
try{
 await initialize(pool);await mkdir(uploads,{recursive:true,mode:0o700});db=await pool.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(731204)');let added=0;
 if(replaceVideos){const settings=(await db.query('SELECT data FROM settings')).rows[0].data;const previous=(await db.query("SELECT data FROM media_library WHERE kind='video' AND data->>'sourceUrl' LIKE 'https://commons.wikimedia.org/%'")).rows; if(Object.values(settings.welcomeVideos||{}).some(url=>previous.some(row=>row.data.url===url)))throw new Error('Hay un video anterior publicado: cambia primero esa selección. No se rompe una referencia activa.');}
 for(const item of prepared){
  const existing=await db.query("SELECT id FROM media_library WHERE kind=$1 AND data->>'sourceUrl'=$2",[item.kind,item.data.sourceUrl]);if(existing.rowCount)continue;
  const id=randomUUID(),file=id+'.'+item.extension;await writeFile(path.join(uploads,file),item.bytes,{mode:0o600,flag:'wx'});created.push(file);
  let poster=null;if(item.poster){const name=randomUUID()+'.webp';await writeFile(path.join(uploads,name),item.poster,{mode:0o600,flag:'wx'});created.push(name);poster='/media/'+name;}
  await db.query('INSERT INTO media_library(id,kind,data) VALUES($1,$2,$3)',[id,item.kind,JSON.stringify({...item.data,url:'/media/'+file,...(poster?{poster}:{})})]);added++;
 }
 if(replaceVideos){await db.query("UPDATE media_library SET archived=true WHERE kind='video' AND data->>'sourceUrl' LIKE 'https://commons.wikimedia.org/%'");await db.query("UPDATE settings SET data=data || '{\"musicAutoplay\":true}'::jsonb");}
 await db.query('COMMIT');committed=true;console.log(`Biblioteca guardada: ${added} archivos nuevos. Selecciones de archivos públicas no modificadas.${replaceVideos?' Videos rechazados archivados y reproducción automática solicitada activada (sujeta al navegador).':''}`);
}finally{if(!committed){if(db)await db.query('ROLLBACK');for(const file of created)await unlink(path.join(uploads,file)).catch(()=>{});}db?.release();await pool.end();}
