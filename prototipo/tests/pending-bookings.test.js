import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingBookingsHTML} from '../pending-bookings.js';
test('previsión: separa clientes, citas e importe no cobrado en español e inglés',()=>{
 const pending={bookingCount:3,customerCount:2,amountCents:9125,unpricedCount:0};
 const es=pendingBookingsHTML(pending),en=pendingBookingsHTML(pending,'en');
 assert.match(es,/Ingresos en espera de citas/);assert.match(es,/91\.25/);assert.match(es,/Todas las fechas/);assert.match(es,/no dinero recibido/);assert.match(es,/data-pending-customers>2</);assert.match(es,/data-pending-count>3</);
 assert.match(en,/Expected appointment income/);assert.match(en,/not collected/);
 assert.equal(pendingBookingsHTML(null),'');
});
test('previsión: cero real sin inventar reservas y aviso de precios desconocidos',()=>{
 const html=pendingBookingsHTML({bookingCount:1,customerCount:1,amountCents:0,unpricedCount:1});
 assert.match(html,/\$0\.00/);assert.match(html,/no tienen precio guardado válido/);
 assert.doesNotMatch(html,/data-finance-form|data-booking-action/);
});
