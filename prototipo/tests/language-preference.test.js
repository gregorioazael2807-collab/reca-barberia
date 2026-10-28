import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanguagePreference,languageKey} from '../language.js';

test('preferencia global: recuerda idioma y comunica cambios una sola vez',()=>{
 const storage=new Map([[languageKey,'en']]);
 const preference=createLanguagePreference({storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
 assert.equal(preference.get(),'en');const changes=[];
 const unsubscribe=preference.subscribe(value=>changes.push(value));
 preference.set('es');preference.set('es');
 assert.deepEqual(changes,['es']);assert.equal(storage.get(languageKey),'es');
 unsubscribe();preference.set('en');assert.deepEqual(changes,['es']);
});

test('preferencia global: sincroniza otras pestañas y tolera almacenamiento bloqueado',()=>{
 let storageListener;
 const preference=createLanguagePreference({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},events:{addEventListener(type,listener){assert.equal(type,'storage');storageListener=listener;}}});
 assert.equal(preference.get(),'es');preference.set('en');assert.equal(preference.get(),'en');
 storageListener({key:languageKey,newValue:'es'});assert.equal(preference.get(),'es');
 storageListener({key:'unrelated',newValue:'en'});assert.equal(preference.get(),'es');
 storageListener({key:languageKey,newValue:'en'});assert.equal(preference.get(),'en');
 storageListener({key:null,newValue:null});assert.equal(preference.get(),'es');
});
