import express from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {error,text} from './security.js';
import {scheduleTransaction} from './bookings.js';
import {inspectMusic} from './music-files.js';
import {rememberUpload,mediaCredit,uploadedTitle} from './media-library.js';
export function installMusic(app,pool,{owner,wrap,limiter,uploads}){
 app.post('/api/admin/music/upload',owner,limiter,express.raw({type:['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a'],limit:'20mb'}),wrap(async(req,res)=>{
  if(req.get('x-media-permission')!=='confirmed')throw error(400,'Confirma que tienes permiso para usar y compartir esta música.');
  const type=['audio/mpeg','audio/mp3'].includes((req.get('content-type')||'').split(';')[0])?'mp3':'m4a';
  const title=uploadedTitle(req),metadata=inspectMusic(req.body,type),file=randomUUID()+'.'+type;
  await mkdir(uploads,{recursive:true,mode:0o700});await writeFile(path.join(uploads,file),req.body,{mode:0o600,flag:'wx'});
  const mediaId=await rememberUpload(pool,'music','/media/'+file,metadata,title);
  res.status(201).json({audio:'/media/'+file,mediaId,...metadata});
 }));
 app.put('/api/admin/music/playback',owner,wrap(async(req,res)=>{
  if(typeof req.body.autoplay!=='boolean')throw error(400,'Configuración de reproducción inválida.');
  const scope=req.body.scope;
  if(scope!==undefined&&!['app','gallery'].includes(scope))throw error(400,'Selecciona aplicación o galería de fotos.');
  await scheduleTransaction(pool,db=>db.query("UPDATE settings SET data=data || jsonb_build_object('musicAutoplay',$1::boolean) || CASE WHEN $2::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('musicScope',$2::text) END",[req.body.autoplay,scope??null]));
  res.json({ok:true,autoplay:req.body.autoplay});
 }));
 app.put('/api/admin/music',owner,wrap(async(req,res)=>{
  const audio=req.body.audio;let track=null;
  if(audio!==null){
   if(typeof audio!=='string'||!/^\/media\/[a-f0-9-]{36}\.(mp3|m4a)$/.test(audio))throw error(400,'Sube primero un MP3 o M4A válido.');
   let file;try{file=await readFile(path.join(uploads,path.basename(audio)));}catch{throw error(400,'Audio no encontrado.');}
   const metadata=inspectMusic(file,path.extname(audio).slice(1));
   track={url:audio,title:text(req.body.title,100,true)||'Música de RECA',durationSeconds:metadata.durationSeconds};
  }
  await scheduleTransaction(pool,async db=>{
   if(track){
    const row=(await db.query("SELECT * FROM media_library WHERE data->>'url'=$1",[track.url])).rows[0];
    if(row){if(row.archived||!row.data.permissionConfirmed)throw error(400,'La pista no está autorizada o está archivada.');row.data.title=track.title;await db.query('UPDATE media_library SET data=$2 WHERE id=$1',[row.id,JSON.stringify(row.data)]);track.credit=mediaCredit(row.data);}
    await db.query("UPDATE settings SET data=data || jsonb_build_object('backgroundMusic',$1::jsonb)",[JSON.stringify(track)]);
   }else await db.query("UPDATE settings SET data=data - 'backgroundMusic'");
  });
  res.json({ok:true,track});
 }));
}
