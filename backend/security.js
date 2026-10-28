import { scrypt as scryptCallback, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function passwordHash(password) {
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password,hash) {
  const [salt,stored]=hash.split(':');
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const expected=Buffer.from(stored,'hex');
  return key.length===expected.length && timingSafeEqual(key,expected);
}
export function error(status,message) { return Object.assign(new Error(message),{status}); }
export function text(value,max=150,empty=false) {
  if(typeof value!=='string' || value.length>max || (!empty && !value.trim())) throw error(400,'Texto inválido.');
  return value.trim();
}
export function email(value) {
  const result=text(value,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw error(400,'Correo inválido.');
  return result;
}
export function password(value) { if(typeof value!=='string'||value.length<12||value.length>128) throw error(400,'La contraseña debe tener entre 12 y 128 caracteres.');return value; }
export function number(value,min,max) { if(!Number.isInteger(value)||value<min||value>max) throw error(400,'Número fuera de rango.');return value; }
export function bilingual(value,max=200) { if(!value||typeof value!=='object') throw error(400,'Faltan traducciones.');return {es:text(value.es,max),en:text(value.en,max)}; }
export function validateWeekly(value) {
  if(!Array.isArray(value)||value.length!==7) throw error(400,'Se necesitan siete días.');
  return value.map((entry,day)=>{
    if(entry.day!==day || typeof entry.closed!=='boolean' || !Array.isArray(entry.intervals) || entry.intervals.length>4) throw error(400,'Horario inválido.');
    let previous=0;
    const intervals=entry.intervals.map(range=>{
      if(!Array.isArray(range)||range.length!==2||!range.every(x=>typeof x==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x))) throw error(400,'Formato de hora inválido.');
      const mins=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
      const start=mins(range[0]),end=mins(range[1]);
      if(start>=end||start<previous) throw error(400,'Los turnos deben estar ordenados y no cruzarse.');
      previous=end;return range;
    });
    if(entry.closed&&intervals.length) throw error(400,'Un día cerrado no puede tener turnos.');
    return {day,closed:entry.closed,intervals};
  });
}
