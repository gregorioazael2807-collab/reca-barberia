import {error,text,number} from './security.js';
import {scheduleTransaction} from './bookings.js';

export function installReviews(app,pool,{auth,wrap}){
 const customer=(req,res,next)=>req.user.role==='customer'?next():next(error(403,'Solo los clientes pueden escribir reseñas.'));
 app.get('/api/reviews',auth,wrap(async(req,res)=>{
  const result=await pool.query(`SELECT
   (SELECT count(*)::integer FROM customer_reviews) AS total,
   (SELECT round(avg(rating)::numeric,1)::float FROM customer_reviews) AS average,
   EXISTS(SELECT 1 FROM calendar_entries WHERE user_id=$1 AND kind='booking' AND status='completed') AS eligible,
   (SELECT row_to_json(r) FROM (SELECT rating,body,created_at AS "createdAt" FROM customer_reviews WHERE user_id=$1) r) AS mine,
   COALESCE((SELECT json_agg(r) FROM (SELECT split_part(trim(u.name),' ',1) AS name,r.rating,r.body,r.created_at AS "createdAt"
    FROM customer_reviews r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC,r.user_id LIMIT 50) r),'[]'::json) AS reviews`,[req.user.id]);
  const data=result.rows[0];res.json({...data,eligible:req.user.role==='customer'&&data.eligible});
 }));
 app.put('/api/reviews/me',auth,customer,wrap(async(req,res)=>{
  if(Object.keys(req.body).some(key=>!['rating','body'].includes(key)))throw error(400,'Campos de reseña inválidos.');
  const rating=number(req.body.rating,1,5),body=text(req.body.body,1000);
  await scheduleTransaction(pool,async db=>{
   // Same lock as account deletion and appointment completion.
   if(!(await db.query("SELECT 1 FROM calendar_entries WHERE user_id=$1 AND kind='booking' AND status='completed'",[req.user.id])).rowCount)throw error(403,'Solo puedes valorar después de una cita atendida.');
   await db.query(`INSERT INTO customer_reviews(user_id,rating,body) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,updated_at=now()`,[req.user.id,rating,body]);
  });res.json({ok:true});
 }));
 app.delete('/api/reviews/me',auth,customer,wrap(async(req,res)=>{
  await scheduleTransaction(pool,db=>db.query('DELETE FROM customer_reviews WHERE user_id=$1',[req.user.id]));res.json({ok:true});
 }));
}
