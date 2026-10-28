import path from 'node:path';
import {root} from './db-root.js';
export function runtimeConfig(env=process.env){
  const production=env.NODE_ENV==='production';
  const port=Number(env.PORT||8081);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT inválido.');
  const origin=env.RECA_ORIGIN||`http://127.0.0.1:${port}`;
  let url;try{url=new URL(origin);}catch{throw new Error('RECA_ORIGIN inválido.');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password)throw new Error('RECA_ORIGIN debe ser un origen sin ruta ni credenciales.');
  if(production&&url.protocol!=='https:')throw new Error('Producción exige RECA_ORIGIN con HTTPS.');
  if(production&&!env.DATABASE_URL)throw new Error('Producción exige DATABASE_URL privada.');
  if(production&&(!env.UPLOAD_DIR||!path.isAbsolute(env.UPLOAD_DIR)))throw new Error('Producción exige UPLOAD_DIR absoluto en disco persistente.');
  if(production&&(!env.PRIVATE_DIR||!path.isAbsolute(env.PRIVATE_DIR)))throw new Error('Producción exige PRIVATE_DIR absoluto en disco privado persistente.');
  const uploads=path.resolve(env.UPLOAD_DIR||path.join(root,'.local/uploads')),privateDir=path.resolve(env.PRIVATE_DIR||path.join(root,'.local')),publicDir=path.join(root,'prototipo');
  if(privateDir===uploads||privateDir.startsWith(uploads+path.sep)||privateDir===publicDir||privateDir.startsWith(publicDir+path.sep))throw new Error('Los secretos privados no pueden estar dentro del directorio público o de fotos.');
  const trustProxy=env.TRUST_PROXY||false;
  if(['true','*','0.0.0.0/0','::/0'].includes(trustProxy))throw new Error('TRUST_PROXY debe limitarse al proxy conocido, nunca a toda la red.');
  return {production,port,origin,host:env.RECA_HOST||(production?'0.0.0.0':'127.0.0.1'),trustProxy,secureCookies:url.protocol==='https:',uploads,privateDir};
}
