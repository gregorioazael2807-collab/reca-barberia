import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCreditsHTML} from '../media-credits.js';
import {customerError} from '../client-request.js';

test('idioma: créditos traducen las etiquetas sin modificar autores ni licencias',()=>{
 const credit={external:true,sourceTitle:'Original title',author:'Original author',license:'CC BY',sourceUrl:'https://example.com'};
 const english=mediaCreditsHTML(credit,'en'),spanish=mediaCreditsHTML(credit,'es');
 assert.match(english,/External content; not produced by RECA/);assert.match(english,/>Source</);assert.doesNotMatch(english,/Fuente|Contenido externo/);
 assert.match(spanish,/Contenido externo/);assert.match(spanish,/>Fuente</);
 for(const html of [english,spanish])assert.match(html,/Original author/);
});

test('idioma: errores de reservas y cuenta se vuelven a traducir al cambiar idioma',()=>{
 const err={status:409,originalMessage:'Ese horario ya no está disponible. Elige otro.',message:'That time is no longer available. Choose another.'};
 assert.equal(customerError(err,'es'),err.originalMessage);
 assert.equal(customerError(err,'en'),'That time is no longer available. Choose another.');
 assert.equal(customerError({status:409,message:'Debes resolver tus próximas citas antes de eliminar la cuenta.'},'en'),'Resolve your upcoming appointments before deleting your account.');
 assert.doesNotMatch(customerError({status:400,message:'Validación desconocida.'},'en'),/Validación/);
});
