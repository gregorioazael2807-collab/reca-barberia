import {digest,token,email,password,passwordHash,error} from './security.js';

export function installRecovery(app,pool,{wrap,transaction,clock,saveDraft=null,removeDrafts=null,sendEmail=null,emailStatus=null}) {
  async function status(){
    const value=emailStatus?await emailStatus():{configured:!!sendEmail,enabled:!!sendEmail};
    const enabled=!!sendEmail&&value.enabled===true;
    return {configured:value.configured===true,enabled,mode:enabled?'email':'draft-only',localOnly:app.locals.origin.startsWith('http://')};
  }
  app.get('/api/auth/recovery-status',wrap(async(req,res)=>res.json(await status())));
  app.post('/api/auth/forgot-password',wrap(async(req,res)=>{
    const accountEmail=email(req.body.email),settings=await status();
    const draft=(saveDraft||settings.enabled)?await transaction(async db=>{
      const now=clock();
      await db.query('DELETE FROM password_resets WHERE expires_at<=$1 OR used_at IS NOT NULL',[new Date(now)]);
      const user=(await db.query("SELECT id,email FROM users WHERE email=$1 AND role='customer' FOR UPDATE",[accountEmail])).rows[0];
      if(!user)return null;
      const existing=(await db.query('SELECT * FROM password_resets WHERE user_id=$1 AND expires_at>$2 AND used_at IS NULL',[user.id,new Date(now)])).rows[0];
      if(existing){
        // Never invalidate an emailed or in-flight link on anonymous repeated requests.
        if(!settings.enabled||existing.delivery_state!=='draft')return null;
        await db.query('UPDATE password_resets SET used_at=$2 WHERE token_hash=$1',[existing.token_hash,new Date(now)]);
      }
      const raw=token(),expiresAt=new Date(now+30*60000);
      await db.query('INSERT INTO password_resets(token_hash,user_id,expires_at,delivery_state) VALUES($1,$2,$3,$4)',[digest(raw),user.id,expiresAt,settings.enabled?'pending':'draft']);
      const value={userId:user.id,email:user.email,url:`${app.locals.origin}/#reset/${raw}`,expiresAt:expiresAt.toISOString(),sent:false};
      if(saveDraft)await saveDraft(value);
      return {value,hash:digest(raw)};
    }):null;
    if(draft&&settings.enabled){
      // The token is committed before contacting SMTP. Public responses never reveal accounts.
      try{
        await sendEmail(draft.value);
        await transaction(db=>db.query("UPDATE password_resets SET delivery_state='sent' WHERE token_hash=$1",[draft.hash]));
      }catch{
        await transaction(db=>db.query("UPDATE password_resets SET delivery_state='failed',used_at=$2 WHERE token_hash=$1",[draft.hash,new Date(clock())]));
        console.error('No se pudo entregar un correo de recuperación. Revisa la conexión privada de Gmail.');
      }
      if(removeDrafts)await removeDrafts(draft.value.userId);
    }
    res.json(settings.enabled
      ?{ok:true,mode:'email',message:'Si existe una cuenta de cliente con ese correo, recibirás un enlace de recuperación. Revisa también Spam. El enlace vence en 30 minutos.'}
      :{ok:true,sent:false,mode:'draft-only',message:'La recuperación por correo aún no está conectada. Esta solicitud no envía mensajes.'});
  }));
  app.post('/api/auth/reset-password',wrap(async(req,res)=>{
    if(typeof req.body.token!=='string'||!/^[a-f0-9]{64}$/.test(req.body.token))throw error(400,'Enlace de recuperación inválido o caducado.');
    const hash=await passwordHash(password(req.body.password));
    const userId=await transaction(async db=>{
      const now=new Date(clock());
      const row=(await db.query("SELECT r.* FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>$2 AND u.role='customer' FOR UPDATE OF r,u",[digest(req.body.token),now])).rows[0];
      if(!row)throw error(400,'Enlace de recuperación inválido o caducado.');
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[row.user_id,hash]);
      await db.query('UPDATE password_resets SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL',[row.user_id,now]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[row.user_id]);
      return row.user_id;
    });
    if(removeDrafts)await removeDrafts(userId);
    res.clearCookie('reca_session',{path:'/'});res.json({ok:true});
  }));
}
