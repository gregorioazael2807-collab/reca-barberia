import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingTimesHTML} from '../booking-times.js';
const slots=['2027-01-11T14:00:00Z','2027-01-11T18:00:00Z','2027-01-11T23:00:00Z'].map(start=>({start}));
test('horarios: rueda deslizable con horas locales y botón único, selección accesible',()=>{
 const html=bookingTimesHTML(slots,{timezone:'America/New_York',selected:slots[1].start});
 for(const label of ['9:00','1:00','6:00','Seleccionar hora','role="listbox"'])assert.ok(html.includes(label));
 assert.equal((html.match(/data-booking-action="pick"/g)||[]).length,1);
 assert.equal((html.match(/role="option"/g)||[]).length,3);
 assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
 assert.ok(html.includes(`data-start="${slots[1].start}"`));assert.ok(html.includes('aria-activedescendant="booking-wheel-1"'));
});
test('horarios: inglés, bloqueo durante envío y fecha sin disponibilidad',()=>{
 const html=bookingTimesHTML(slots,{timezone:'America/New_York',language:'en',disabled:true});
 assert.ok(html.includes('Select time'));assert.equal((html.match(/ disabled/g)||[]).length,1);assert.ok(html.includes('aria-disabled="true"'));assert.ok(html.includes('tabindex="-1"'));
 assert.ok(bookingTimesHTML([],{language:'en'}).includes('No times available'));assert.ok(!bookingTimesHTML([]).includes('data-booking-action'));
});
test('horarios: zona horaria visible y selección retirada vuelve a la primera hora disponible',()=>{
 const html=bookingTimesHTML(slots,{timezone:'UTC',selected:'no-longer-available'});assert.ok(html.includes('UTC'));assert.ok(html.includes(`data-start="${slots[0].start}"`));assert.ok(html.includes('aria-activedescendant="booking-wheel-0"'));
});
