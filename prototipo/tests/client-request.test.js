import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchJSON,customerError} from '../client-request.js';

test('request: JSON válido y envío único con opciones originales',async()=>{
  let calls=0;
  const result=await fetchJSON('/api/example',{method:'POST',body:'{}',credentials:'same-origin',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'/api/example');assert.equal(options.body,'{}');assert.equal(options.credentials,'same-origin');assert.ok(options.signal);return {ok:true,json:async()=>({ok:true})};
  }});
  assert.deepEqual(result,{ok:true});assert.equal(calls,1);
});
test('request: plazo limitado, sin reintentos automáticos de cambios',async()=>{
  let calls=0;
  await assert.rejects(fetchJSON('/api/holds',{method:'POST',timeoutMs:5,fetchImpl:async(url,{signal})=>{
    calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort'))));
  }}),err=>err.kind==='timeout'&&err.method==='POST');
  assert.equal(calls,1);
});
test('request: errores HTTP conservan el estado para tratar sesión y formularios',async()=>{
  await assert.rejects(fetchJSON('/api/auth/login',{fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'Correo incorrecto'})})}),err=>err.status===401&&err.message==='Correo incorrecto');
});
test('request: error de red y respuesta inválida no filtran detalles técnicos',async()=>{
  await assert.rejects(fetchJSON('/api/site',{fetchImpl:async()=>{throw new Error('sensitive network detail');}}),err=>err.kind==='network'&&!err.message.includes('sensitive'));
  await assert.rejects(fetchJSON('/api/site',{fetchImpl:async()=>({ok:true,json:async()=>{throw new Error('HTML provider detail');}})}),err=>err.kind==='response'&&!err.message.includes('provider'));
  await assert.rejects(fetchJSON('/api/site',{fetchImpl:async()=>({ok:false,status:500,json:async()=>null})}),err=>err.kind==='response');
});
test('mensajes: distinguir lectura fallida de cambios con resultado desconocido',()=>{
  assert.match(customerError({kind:'timeout',method:'GET'}),/Wi-Fi/);
  assert.match(customerError({kind:'timeout',method:'POST'}),/si el cambio se guardó/);
  assert.match(customerError({kind:'network',method:'POST'},'en'),/whether the change was saved/);
});
test('mensajes: acceso, cuenta existente y límite de intentos en ambos idiomas',()=>{
  assert.match(customerError({status:401},'es','login'),/Revisa tu correo y contraseña/);
  assert.match(customerError({status:409},'es','register'),/otro perfil/);
  assert.match(customerError({status:429},'en'),/five minutes/);
});
