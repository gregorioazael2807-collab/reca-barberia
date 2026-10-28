import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaCreditsHTML} from '../media-credits.js';
test('créditos: autor, título original, licencia, fuente y modificaciones visibles',()=>{
 const html=mediaCreditsHTML({title:'Etiqueta',sourceTitle:'Título original',author:'Autor',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://example.test/source',modification:'Convertida a M4A'});
 assert.match(html,/Título original/);assert.match(html,/Autor/);assert.match(html,/CC BY 4.0/);assert.match(html,/Contenido externo/);assert.match(html,/Convertida a M4A/);assert.match(html,/noopener noreferrer/);
});
test('créditos: textos no ejecutan HTML ni aceptan enlaces javascript',()=>{
 const html=mediaCreditsHTML({title:'<img src=x onerror=alert(1)>',author:'<script>bad</script>',license:'Permiso',licenseUrl:'javascript:alert(1)',sourceUrl:'data:text/html,bad'});
 assert.doesNotMatch(html,/<img|<script|href=/);assert.match(html,/&lt;img/);
});
test('créditos ausentes no inventan autores o licencias',()=>assert.equal(mediaCreditsHTML(null),''));
