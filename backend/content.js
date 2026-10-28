import express from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {bilingual,error,number} from './security.js';
import {instant,localInstants,scheduleTransaction,uuid} from './bookings.js';
import {inspectVideo} from './video-files.js';
import {rememberUpload,mediaCredit,uploadedTitle,hideVideo,showVideo} from './media-library.js';

const serial=row=>({id:row.id,...row.data,startsAt:row.starts_at.toISOString(),endsAt:row.ends_at.toISOString(),active:row.active});
export async function publicOffers(db,now){
  return (await db.query('SELECT * FROM offers WHERE active=true AND starts_at<=$1 AND ends_at>$1 ORDER BY starts_at DESC',[new Date(now)])).rows.map(serial);
}
export async function applyOffer(db,booking,id,now){
  uuid(id);const row=(await db.query('SELECT * FROM offers WHERE id=$1 AND active=true AND starts_at<=$2 AND ends_at>$2',[id,new Date(now)])).rows[0];
  if(!row||!row.data.serviceIds.includes(booking.snapshot.service.id)||booking.starts_at<row.starts_at||booking.starts_at>=row.ends_at)throw error(409,'La oferta ya no aplica a este servicio o fecha.');
  const originalPriceCents=booking.snapshot.service.priceCents,priceCents=Math.round(originalPriceCents*(100-row.data.percent)/100);
  return {...booking.snapshot,service:{...booking.snapshot.service,priceCents},discount:{type:'offer',offerId:row.id,percent:row.data.percent,originalPriceCents,title:row.data.title,conditions:row.data.conditions,startsAt:row.starts_at.toISOString(),endsAt:row.ends_at.toISOString()}};
}
export function offerData(v){
  if(typeof v.active!=='boolean'||!Array.isArray(v.serviceIds)||!v.serviceIds.length||v.serviceIds.length>2||v.serviceIds.some(id=>!['men','kids'].includes(id)))throw error(400,'Servicios o estado inválidos.');
  return {title:bilingual(v.title,100),description:bilingual(v.description,600),conditions:bilingual(v.conditions,600),percent:number(v.percent,1,90),serviceIds:[...new Set(v.serviceIds)]};
}
export function installContent(app,pool,{owner,wrap,limiter,uploads,clock}){
  app.get('/api/admin/offers',owner,wrap(async(req,res)=>res.json({offers:(await pool.query('SELECT * FROM offers ORDER BY starts_at DESC')).rows.map(serial)})));
  const save=wrap(async(req,res)=>{
    const v=req.body,id=req.params.id?uuid(req.params.id):randomUUID(),data=offerData(v);
    const row=await scheduleTransaction(pool,async db=>{
      const local=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw error(400,'Fecha local inválida.');const timezone=(settings).timezone;if(!timezone)throw error(409,'Configura primero la zona horaria.');let values;try{values=localInstants(value.slice(0,10),value.slice(11),timezone);}catch{throw error(400,'Fecha local inválida.');}if(values.length!==1)throw error(400,'Hora inexistente o ambigua por cambio de horario.');return values[0];};
      const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
      const start=v.startsLocal!==undefined?local(v.startsLocal):instant(v.startsAt),end=v.endsLocal!==undefined?local(v.endsLocal):instant(v.endsAt);
      if(start>=end)throw error(400,'La oferta debe finalizar después de comenzar.');
      if(req.params.id){const result=await db.query('UPDATE offers SET data=$2,starts_at=$3,ends_at=$4,active=$5 WHERE id=$1 RETURNING *',[id,JSON.stringify(data),new Date(start),new Date(end),v.active]);if(!result.rowCount)throw error(404,'Oferta no encontrada.');return result.rows[0];}
      return (await db.query('INSERT INTO offers(id,data,starts_at,ends_at,active) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,JSON.stringify(data),new Date(start),new Date(end),v.active])).rows[0];
    });res.status(req.params.id?200:201).json({offer:serial(row)});
  });
  app.post('/api/admin/offers',owner,save);app.put('/api/admin/offers/:id',owner,save);
  app.delete('/api/admin/offers/:id',owner,wrap(async(req,res)=>{
    uuid(req.params.id);await scheduleTransaction(pool,db=>db.query('UPDATE offers SET active=false WHERE id=$1',[req.params.id]));res.json({ok:true});
  }));
  app.post('/api/admin/videos/upload',owner,limiter,express.raw({type:'video/mp4',limit:'30mb'}),wrap(async(req,res)=>{
    if(req.get('x-media-permission')!=='confirmed')throw error(400,'Confirma los permisos del video y su música.');
    const title=uploadedTitle(req),metadata=inspectVideo(req.body),file=randomUUID()+'.mp4';await mkdir(uploads,{recursive:true,mode:0o700});await writeFile(path.join(uploads,file),req.body,{mode:0o600,flag:'wx'});
    const mediaId=await rememberUpload(pool,'video','/media/'+file,metadata,title);
    res.status(201).json({video:'/media/'+file,mediaId,...metadata});
  }));
  app.delete('/api/admin/videos/:slot',owner,wrap(async(req,res)=>{
    const slot=req.params.slot;if(!['register','home'].includes(slot))throw error(400,'Pantalla inválida.');
    await scheduleTransaction(pool,db=>hideVideo(db,slot));res.json({ok:true});
  }));
  app.put('/api/admin/videos/:slot',owner,wrap(async(req,res)=>{
    const slot=req.params.slot;if(!['register','home'].includes(slot))throw error(400,'Pantalla inválida.');
    const video=req.body.video;if(video!==null){if(typeof video!=='string'||!/^\/media\/[a-f0-9-]{36}\.mp4$/.test(video))throw error(400,'Sube primero un MP4 válido.');try{await access(path.join(uploads,path.basename(video)));}catch{throw error(400,'Video no encontrado.');}}
    await scheduleTransaction(pool,async db=>{
      const row=video?(await db.query("SELECT * FROM media_library WHERE data->>'url'=$1",[video])).rows[0]:null;
      if(row&&(row.archived||!row.data.permissionConfirmed))throw error(400,'El archivo no está autorizado o está archivado.');
      await db.query("UPDATE settings SET data=jsonb_set(jsonb_set(data,'{welcomeVideos}',(COALESCE(data->'welcomeVideos','{}'::jsonb) - $1::text) || CASE WHEN $2::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object($1::text,$2::text) END),'{welcomeVideoCredits}',(COALESCE(data->'welcomeVideoCredits','{}'::jsonb)-$1::text)||CASE WHEN $3::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object($1::text,$3::jsonb) END)",[slot,video,row?JSON.stringify(mediaCredit(row.data)):null]);
      await showVideo(db,slot);
    });
    // Keep old uploaded files: do not break active players or assume other references.
    res.json({ok:true,video});
  }));
}
