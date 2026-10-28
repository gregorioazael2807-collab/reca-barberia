import test from 'node:test';
import assert from 'node:assert/strict';
import {offerText,offerFromForm} from '../comanda/offer-form.js';
const form=(title='Oferta')=>new Map(Object.entries({title,description:'Detalle',conditions:'Condiciones',percent:'10',startsLocal:'2027-01-10T00:00',endsLocal:'2027-01-15T23:00',men:'on',active:'on'}));
test('ofertas: un campo por texto inicializa ambos idiomas sin inventar traducciones',()=>{
 const offer=offerFromForm(form());
 assert.deepEqual(offer.title,{es:'Oferta',en:'Oferta'});assert.equal(offer.percent,10);assert.deepEqual(offer.serviceIds,['men']);
});
test('ofertas: editar una versión conserva la otra y los datos de la oferta',()=>{
 const original={id:'existing',title:{es:'Antes',en:'Existing offer'},description:{es:'Anterior',en:'English description'},conditions:{es:'Anterior',en:'English conditions'}};
 const es=offerFromForm(form(),original,'es');assert.equal(es.id,'existing');assert.equal(es.title.en,'Existing offer');assert.equal(es.description.en,'English description');
 const en=offerFromForm(form('English edit'),es,'en');assert.equal(en.title.es,'Oferta');assert.equal(en.title.en,'English edit');assert.equal(original.title.es,'Antes');
 assert.equal(offerText(en,'title','en'),'English edit');assert.equal(offerText({title:{es:'Solo español'}},'title','en'),'Solo español');
});
