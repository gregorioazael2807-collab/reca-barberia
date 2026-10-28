import pg from 'pg';
import { readFile } from 'node:fs/promises';
import {root} from './db-root.js';
export {root};
import path from 'node:path';
import os from 'node:os';
import { photoCatalog } from '../prototipo/photos.js';
export function databaseConfig(database,env=process.env){
  if(!env.DATABASE_URL)return {host:path.join(root,'.local/postgres-socket'),port:55432,database:database||'reca_barberia',user:os.userInfo().username,max:8,connectionTimeoutMillis:5000};
  let url;try{url=new URL(env.DATABASE_URL);}catch{throw new Error('DATABASE_URL inválida.');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL debe usar PostgreSQL.');
  if(database)url.pathname='/'+encodeURIComponent(database);
  if(['no-verify','disable','allow','prefer'].includes(url.searchParams.get('sslmode'))&&env.NODE_ENV==='production')throw new Error('No se permite TLS de base de datos sin verificación en producción.');
  const ssl=env.DB_SSL==='true'||env.NODE_ENV==='production';
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  return {connectionString:url.toString(),max:8,connectionTimeoutMillis:5000,statement_timeout:15000,...(ssl?{ssl:{rejectUnauthorized:true,...(env.DB_SSL_CA?{ca:env.DB_SSL_CA}:{})}}:{})};
}
export function makePool(database){return new pg.Pool(databaseConfig(database));}
export async function initialize(pool) {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url),'utf8'));
  await pool.query('INSERT INTO settings(id,data) VALUES(true,$1) ON CONFLICT DO NOTHING', [JSON.stringify({
    name:'RECA Barbería',email:'demo-54b54911@example.com',city:'',timezone:'',ownerPhoto:null,
    weekly:Array.from({length:7},(_,day)=>({day,closed:true,intervals:[]}))
  })]);
  for (const type of ['men','kids']) await pool.query('INSERT INTO services(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[type,JSON.stringify({
    id:type, name:{es:type==='men'?'Corte para caballeros':'Corte para niños',en:type==='men'?'Gentlemen’s haircut':'Kids’ haircut'},
    description:{es:type==='men'?'Un estilo a tu medida, con acabado limpio y preciso.':'Una experiencia paciente y cómoda para los más pequeños.',en:type==='men'?'A style tailored to you, with a clean, precise finish.':'A patient and comfortable experience for little ones.'},
    priceCents:null,active:true
  })]);
  // Retire service estimates; occupancy is a separate calendar configuration.
  await pool.query("UPDATE services SET data=data - 'durationMinutes' - 'cleaningMinutes' WHERE data ? 'durationMinutes' OR data ? 'cleaningMinutes'");
  // Add new configuration keys without replacing existing business settings.
  await pool.query("UPDATE settings SET data=jsonb_build_object('cancellationNoticeMinutes',null) || data WHERE NOT (data ? 'cancellationNoticeMinutes')");
  await pool.query("UPDATE settings SET data=jsonb_build_object('bookingNoticeMinutes',null) || data WHERE NOT (data ? 'bookingNoticeMinutes')");
  await pool.query("UPDATE settings SET data=jsonb_build_object('bookingSpacingMinutes',null) || data WHERE NOT (data ? 'bookingSpacingMinutes')");
  const sources = JSON.parse(await readFile(path.join(root,'prototipo/assets/photo-sources.json'),'utf8'));
  for (const [position,cut] of photoCatalog.entries()) {
    const source=sources.find(x=>x.image===cut.image);
    await pool.query('INSERT INTO gallery(id,data,position) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[cut.id,JSON.stringify({...cut,source:source?.source || '',license:'Unsplash',permissionConfirmed:false}),position]);
  }
  // Retire this stock reference without removing historical booking snapshots.
  await pool.query("UPDATE gallery SET active=false WHERE id='cut-24' AND data->>'image'='assets/photos/cut-24.jpg'");
}
