import {createHmac} from 'node:crypto';
import {email} from './security.js';
export function canonicalEmail(value){
  const normalized=email(value),at=normalized.lastIndexOf('@');let local=normalized.slice(0,at),domain=normalized.slice(at+1);
  if(['gmail.com','googlemail.com'].includes(domain)){domain='gmail.com';local=local.split('+')[0].replaceAll('.','');}
  return `${local}@${domain}`;
}
export function identityHasher(key){
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Falta la clave privada de identidad.');
  return value=>createHmac('sha256',key).update(canonicalEmail(value)).digest('hex');
}
