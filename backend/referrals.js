import {randomBytes,randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {error,digest} from './security.js';
import {canonicalEmail} from './identity.js';

export async function attachReferral(db,user,code) {
  if(code==null||code==='')return;
  if(typeof code!=='string'||!/^[a-f0-9]{32}$/.test(code))throw error(400,'Código de recomendación inválido.');
  const referrer=(await db.query("SELECT u.id,u.email FROM referral_codes c JOIN users u ON u.id=c.user_id WHERE c.code=$1 AND u.role='customer'",[code])).rows[0];
  if(!referrer||referrer.id===user.id||canonicalEmail(referrer.email)===canonicalEmail(user.email))throw error(400,'La recomendación no está disponible.');
  await db.query('INSERT INTO referrals(id,referrer_id,referred_id) VALUES($1,$2,$3)',[randomUUID(),referrer.id,user.id]);
}
export async function awardReferral(db,booking,now,{requireVerified=false,identityHash=value=>digest(canonicalEmail(value))}={}) {
  if(!booking.user_id)return;
  const referral=(await db.query("SELECT r.*,u.email_verified_at AS referrer_verified,v.email_verified_at AS referred_verified,v.email AS referred_email FROM referrals r JOIN users u ON u.id=r.referrer_id JOIN users v ON v.id=r.referred_id WHERE r.referred_id=$1 AND u.role='customer'",[booking.user_id])).rows[0];
  if(!referral)return;
  if(requireVerified){
    if(!referral.referrer_verified||!referral.referred_verified)return;
    const key=identityHash(referral.referred_email);
    // Ledger remains after deletion of the referred account, preventing repeat awards.
    const claimed=await db.query('UPDATE referrals SET identity_key=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM referrals WHERE identity_key=$2 AND id<>$1) RETURNING id',[referral.id,key]);
    if(!claimed.rowCount)return;
  }
  await db.query('INSERT INTO referral_rewards(id,referral_id,user_id,earned_booking_id,earned_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(referral_id) DO NOTHING',[randomUUID(),referral.id,referral.referrer_id,booking.id,new Date(now)]);
}
export async function applyReferralReward(db,booking,now,{requireVerified=false}={}) {
  if(requireVerified&&!(await db.query('SELECT 1 FROM users WHERE id=$1 AND email_verified_at IS NOT NULL',[booking.user_id])).rowCount)throw error(409,'Verifica tu correo antes de utilizar un descuento.');
  if(booking.snapshot.discount)throw error(409,'No se pueden acumular descuentos.');
  const reward=(await db.query('SELECT * FROM referral_rewards WHERE user_id=$1 AND redeemed_at IS NULL ORDER BY earned_at,id LIMIT 1 FOR UPDATE',[booking.user_id])).rows[0];
  if(!reward)throw error(409,'No tienes descuentos disponibles. Confirma sin descuento o actualiza tu cuenta.');
  const originalPriceCents=booking.snapshot.service.priceCents;
  const priceCents=Math.round(originalPriceCents*75/100);
  const snapshot={...booking.snapshot,service:{...booking.snapshot.service,priceCents},discount:{type:'referral',percent:25,originalPriceCents,rewardId:reward.id}};
  await db.query('UPDATE referral_rewards SET redeemed_at=$2,redeemed_booking_id=$3 WHERE id=$1',[reward.id,new Date(now),booking.id]);
  return snapshot;
}
export async function releaseReferralReward(db,bookingId) {
  await db.query('UPDATE referral_rewards SET redeemed_at=NULL,redeemed_booking_id=NULL WHERE redeemed_booking_id=$1',[bookingId]);
}
export async function resolveVerifiedReferrals(db,userId,now,options){
  const rows=(await db.query("SELECT DISTINCT ON(c.user_id) c.* FROM calendar_entries c JOIN referrals r ON r.referred_id=c.user_id WHERE c.status='completed' AND (r.referrer_id=$1 OR r.referred_id=$1) ORDER BY c.user_id,c.starts_at",[userId])).rows;
  for(const booking of rows)await awardReferral(db,booking,now,options);
}
export function installReferrals(app,pool,{auth,wrap,transaction,requireVerified=false}) {
  const customer=(req,res,next)=>req.user?.role==='customer'?next():next(error(req.user?403:401,'Acceso exclusivo para clientes.'));
  app.get('/api/referrals',auth,customer,wrap(async(req,res)=>{
    const result=await transaction(async db=>{
      await db.query('INSERT INTO referral_codes(user_id,code) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',[req.user.id,randomBytes(16).toString('hex')]);
      const code=(await db.query('SELECT code FROM referral_codes WHERE user_id=$1',[req.user.id])).rows[0].code;
      const counts=(await db.query('SELECT count(*)::int AS points,count(*) FILTER (WHERE redeemed_at IS NULL)::int AS available FROM referral_rewards WHERE user_id=$1',[req.user.id])).rows[0];
      return {code,points:counts.points,availableRewards:counts.available,discountPercent:25,verificationRequired:requireVerified,emailVerified:!!req.user.email_verified_at,url:`${app.locals.origin}/#ref/${code}`,publicSharingReady:app.locals.origin.startsWith('https://')};
    });
    res.json({...result,qrDataUrl:await QRCode.toDataURL(result.url,{width:360,margin:4,errorCorrectionLevel:'M'})});
  }));
}
