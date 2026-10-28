import test from 'node:test';
import assert from 'node:assert/strict';
import { copy, cuts, filterCuts, validLanguage, toggleLike } from '../data.js';

test('ambos idiomas tienen exactamente las mismas claves', () => {
  assert.deepEqual(Object.keys(copy.es).sort(), Object.keys(copy.en).sort());
  for (const dictionary of Object.values(copy)) for (const value of Object.values(dictionary)) assert.ok(value.length > 0);
});
test('filtra referencias por público y estilo', () => {
  assert.equal(filterCuts().length, cuts.length);
  assert.ok(filterCuts('kids').every(c => c.audience === 'kids'));
  assert.equal(filterCuts('men', 'fade')[0].id, 'fade');
  assert.equal(filterCuts('kids', 'fade').length, 1);
});
test('likes se alternan sin duplicados ni alterar el estado anterior', () => {
  const original = new Set();
  const liked = toggleLike(original, 'fade');
  assert.equal(original.size, 0);
  assert.equal(liked.size, 1);
  assert.equal(toggleLike(liked, 'fade').size, 0);
});
test('preferencias inválidas vuelven al español', () => {
  assert.equal(validLanguage('en'), 'en');
  for (const value of ['es', null, '', 'fr']) assert.equal(validLanguage(value), 'es');
});
test('al menos 20 fotografías distintas, con identificadores únicos y nombres bilingües', () => {
  assert.ok(cuts.length >= 20);
  assert.equal(new Set(cuts.map(c => c.image)).size, cuts.length);
  assert.equal(new Set(cuts.map(c => c.id)).size, cuts.length);
  for (const cut of cuts) {
    assert.ok(cut.name.es && cut.name.en && cut.description.es && cut.description.en);
  }
});
