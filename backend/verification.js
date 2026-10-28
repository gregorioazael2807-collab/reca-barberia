import {digest,token,error} from './security.js';
import {resolveVerifiedReferrals} from './referrals.js';
export function installVerification(app,pool,{auth,wrap,transaction,clock,limiter,sendEmail=null,emailStatus=null,referralOptions={}}){
  const customer=(req,res,next)=>req.user?.role==='customer'?next():next(error(403,'Solo las cuentas de cliente verifican su correo desde esta ruta.'));
  const status=async()=>({enabled:!!sendEmail&&(emailStatus?((await emailStatus()).enabled===true):true)});
  app.get('/api/account/verification',auth,customer,wrap(async(req,res)=>res.json({...await status(),verified:!!req.user.email_verified_at})));
  app.post('/api/account/verification',auth,customer,limiter,wrap(async(req,res)=>{
    if(req.user.email_verified_at)return res.json({ok:true,verified:true});
    if(!(await status()).enabled)throw error(503,'El envío de verificaciones todavía no está habilitado. No se ha enviado ningún correo.');
    const draft=await transaction(async db=>{
      const now=new Date(clock());
      await db.query('DELETE FROM email_verifications WHERE expires_at<=$1 OR used_at IS NOT NULL',[now]);
      const user=(await db.query("SELECT * FROM users WHERE id=$1 AND role='customer' FOR UPDATE",[req.user.id])).rows[0];
      if(!user||user.email_verified_at)return null;
      if((await db.query('SELECT 1 FROM email_verifications WHERE user_id=$1 AND expires_at>$2 AND used_at IS NULL',[user.id,now])).rowCount)return null;
      const raw=token(),hash=digest(raw);
      await db.query('INSERT INTO email_verifications(token_hash,user_id,email,expires_at) VALUES($1,$2,$3,$4)',[hash,user.id,user.email,new Date(clock()+30*60000)]);
      return {hash,email:user.email,url:`${app.locals.origin}/#verify/${raw}`};
    });
    if(draft)try{await sendEmail(draft);}catch{
      await transaction(db=>db.query('DELETE FROM email_verifications WHERE token_hash=$1',[draft.hash]));
      throw error(502,'No pudimos enviar el correo de verificación. Vuelve a intentarlo más tarde.');
    }
    res.json({ok:true,message:'Revisa tu correo y Spam. Si ya solicitaste un enlace, utiliza el anterior mientras siga vigente. Vence en 30 minutos.'});
  }));
  app.post('/api/auth/verify-email',wrap(async(req,res)=>{
    if(typeof req.body.token!=='string'||!/^[a-f0-9]{64}$/.test(req.body.token))throw error(400,'Enlace de verificación inválido o caducado.');
    await transaction(async db=>{
      const now=new Date(clock());
      const row=(await db.query("SELECT t.*,u.email AS current_email FROM email_verifications t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>$2 AND u.role='customer' FOR UPDATE OF t,u",[digest(req.body.token),now])).rows[0];
      if(!row||row.email!==row.current_email)throw error(400,'Enlace de verificación inválido o caducado.');
      const key=referralOptions.identityHash(row.email);
      const claim=await db.query('INSERT INTO verified_email_keys(key_hash,user_id) VALUES($1,$2) ON CONFLICT(key_hash) DO UPDATE SET user_id=verified_email_keys.user_id WHERE verified_email_keys.user_id=EXCLUDED.user_id RETURNING user_id',[key,row.user_id]);
      if(!claim.rowCount)throw error(409,'Este buzón ya está verificado en otra cuenta. Usa esa cuenta o consulta al dueño.');
      await db.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,$2) WHERE id=$1',[row.user_id,now]);
      await db.query('UPDATE email_verifications SET used_at=$2 WHERE user_id=$1',[row.user_id,now]);
      await resolveVerifiedReferrals(db,row.user_id,clock(),referralOptions);
    });
    res.json({ok:true,verified:true});
  }));
}
