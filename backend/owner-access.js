import {passwordHash,token,email,error} from './security.js';
import {scheduleTransaction} from './bookings.js';
// Local administrative reset only. Preserve the owner id and business audit references.
export async function resetOwnerAccess(pool,{expectedEmail}={}){
 const previous=email(expectedEmail),hash=await passwordHash(token());
 return scheduleTransaction(pool,async db=>{
  const owner=(await db.query("SELECT id,email,owner_setup_pending FROM users WHERE role='owner' FOR UPDATE")).rows[0];
  if(!owner||owner.email!==previous||owner.owner_setup_pending)throw error(409,'La cuenta del dueño cambió; no se reinició el acceso.');
  await db.query('DELETE FROM sessions WHERE user_id=$1',[owner.id]);
  await db.query('DELETE FROM password_resets WHERE user_id=$1',[owner.id]);
  await db.query('DELETE FROM email_verifications WHERE user_id=$1',[owner.id]);
  await db.query('DELETE FROM verified_email_keys WHERE user_id=$1',[owner.id]);
  await db.query("UPDATE users SET email=$2,name='Pendiente de configuración',password_hash=$3,email_verified_at=NULL,owner_setup_pending=true WHERE id=$1",[owner.id,`owner-reset-${owner.id}@invalid.local`,hash]);
  return {ownerId:owner.id,pending:true};
 });
}
