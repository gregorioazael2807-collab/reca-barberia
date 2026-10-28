import {error} from './security.js';

// Forecast only: never inserts money or changes appointment/payment state.
export async function pendingBookingIncome(db){
 const {rows}=await db.query(`WITH pending AS (
  SELECT c.user_id,CASE WHEN jsonb_typeof(c.snapshot #> '{service,priceCents}')='number'
   AND (c.snapshot #>> '{service,priceCents}') ~ '^[0-9]+$'
   THEN (c.snapshot #>> '{service,priceCents}')::numeric END AS amount
  FROM calendar_entries c
  WHERE c.kind='booking' AND c.status='confirmed' AND c.arrived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM finance_entries f WHERE f.booking_id=c.id AND f.kind='income' AND f.voided_at IS NULL)
 ) SELECT count(*)::int AS bookings,count(DISTINCT user_id)::int AS customers,
  COALESCE(sum(amount),0)::text AS amount,count(*) FILTER (WHERE amount IS NULL)::int AS unpriced FROM pending`);
 const row=rows[0],amountCents=Number(row.amount);
 if(!Number.isSafeInteger(amountCents)||amountCents<0)throw error(500,'Total pendiente fuera de rango.');
 return {bookingCount:row.bookings,customerCount:row.customers,amountCents,unpricedCount:row.unpriced};
}
