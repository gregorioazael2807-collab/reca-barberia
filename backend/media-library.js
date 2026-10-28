import {randomUUID} from 'node:crypto';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {error,text} from './security.js';
import {uuid,scheduleTransaction} from './bookings.js';
export const mediaCredit=data=>({title:data.sourceTitle||data.title,author:data.author,license:data.license,licenseUrl:data.licenseUrl||null,sourceUrl:data.sourceUrl||null,modification:data.modification||null,external:!!data.sourceUrl});
export async function hideVideo(db,slot){
 await db.query("UPDATE settings SET data=jsonb_set(jsonb_set(jsonb_set(data,'{welcomeVideos}',COALESCE(data->'welcomeVideos','{}'::jsonb)-$1::text),'{welcomeVideoCredits}',COALESCE(data->'welcomeVideoCredits','{}'::jsonb)-$1::text),'{hiddenWelcomeVideos}',COALESCE(data->'hiddenWelcomeVideos','{}'::jsonb)||jsonb_build_object($1::text,true))",[slot]);
}
export async function showVideo(db,slot){await db.query("UPDATE settings SET data=jsonb_set(data,'{hiddenWelcomeVideos}',COALESCE(data->'hiddenWelcomeVideos','{}'::jsonb)-$1::text)",[slot]);}
export function uploadedTitle(req){try{return text(decodeURIComponent(req.get('x-media-title')||''),100,true);}catch{throw error(400,'Nombre de archivo inválido.');}}
export async function rememberUpload(db,kind,url,metadata,title=''){
 const id=randomUUID(),data={url,title:title||(kind==='music'?'Pista guardada':'Video guardado'),...metadata,author:'Archivo aportado por el dueño',license:'Permiso declarado por el dueño',permissionConfirmed:true};
 await db.query('INSERT INTO media_library(id,kind,data) VALUES($1,$2,$3)',[id,kind,JSON.stringify(data)]);return id;
}
export function installMediaLibrary(app,pool,{owner,wrap,uploads}){
 app.get('/api/admin/library',owner,wrap(async(req,res)=>res.json({items:(await pool.query('SELECT * FROM media_library WHERE archived=false ORDER BY created_at DESC,id')).rows.map(row=>({id:row.id,kind:row.kind,...row.data}))})));
 app.post('/api/admin/library/:id/use',owner,wrap(async(req,res)=>{
  uuid(req.params.id);
  await scheduleTransaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM media_library WHERE id=$1 AND archived=false',[req.params.id])).rows[0];if(!row)throw error(404,'Archivo no encontrado.');const data=row.data;
   if(!data.permissionConfirmed)throw error(400,'Falta confirmar el permiso de uso.');
   try{await access(path.join(uploads,path.basename(data.url)));}catch{throw error(409,'Archivo no disponible.');}
   if(row.kind==='music')await db.query("UPDATE settings SET data=data || jsonb_build_object('backgroundMusic',$1::jsonb)",[JSON.stringify({url:data.url,title:data.title,durationSeconds:data.durationSeconds,credit:mediaCredit(data)})]);
   else{
    const slot=req.body.slot;if(!['home','register'].includes(slot))throw error(400,'Selecciona Inicio o Crear cuenta.');
    await db.query("UPDATE settings SET data=jsonb_set(jsonb_set(data,'{welcomeVideos}',COALESCE(data->'welcomeVideos','{}'::jsonb)||jsonb_build_object($1::text,$2::text)),'{welcomeVideoCredits}',COALESCE(data->'welcomeVideoCredits','{}'::jsonb)||jsonb_build_object($1::text,$3::jsonb))",[slot,data.url,JSON.stringify(mediaCredit(data))]);
    await showVideo(db,slot);
   }
  });res.json({ok:true});
 }));
 app.delete('/api/admin/library/:id/use',owner,wrap(async(req,res)=>{
  uuid(req.params.id);await scheduleTransaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM media_library WHERE id=$1',[req.params.id])).rows[0];if(!row)throw error(404,'Archivo no encontrado.');
   const settings=(await db.query('SELECT data FROM settings')).rows[0].data;let changed=false;
   if(settings.backgroundMusic?.url===row.data.url){await db.query("UPDATE settings SET data=data - 'backgroundMusic'");changed=true;}
   for(const slot of ['home','register'])if(settings.welcomeVideos?.[slot]===row.data.url){await hideVideo(db,slot);changed=true;}
   if(!changed)throw error(409,'Este archivo ya no está seleccionado en la app.');
  });res.json({ok:true});
 }));
 app.delete('/api/admin/library/:id',owner,wrap(async(req,res)=>{
  uuid(req.params.id);await scheduleTransaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM media_library WHERE id=$1 AND archived=false',[req.params.id])).rows[0];if(!row)throw error(404,'Archivo no encontrado.');
   const settings=(await db.query('SELECT data FROM settings')).rows[0].data;
   if(settings.backgroundMusic?.url===row.data.url||Object.values(settings.welcomeVideos||{}).includes(row.data.url))throw error(409,'Primero cambia o quita este archivo de la aplicación.');
   await db.query('UPDATE media_library SET archived=true WHERE id=$1',[row.id]);
  });res.json({ok:true});
 }));
}
