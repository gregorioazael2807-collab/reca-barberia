import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { digest, token, passwordHash, verifyPassword, error, text, email, password, number, bilingual, validateWeekly } from './security.js';
import { root } from './db.js';
import { installBookings, scheduleTransaction } from './bookings.js';
import { installAutomation, automationSummary, scrubNotifications } from './automation.js';
import {installRecovery} from './recovery.js';
import {attachReferral,installReferrals} from './referrals.js';
import {installVerification} from './verification.js';
import {canonicalEmail} from './identity.js';
import {installWaitlist} from './waitlist.js';
import {installContent,publicOffers} from './content.js';
import {installFinance} from './finance.js';
import {installMusic} from './music.js';
import {installMediaLibrary} from './media-library.js';
import {installGocho} from './gocho.js';
import {installReviews} from './reviews.js';
const defaultOwnerEmail='demo-54b54911@example.com';
const wrap=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
export function createApp(pool,{setupToken,uploads=path.join(root,'.local/uploads'),origin='http://127.0.0.1:8081',allowedOrigins=[],rateLimit=15,clock=()=>Date.now(),automationToken=null,saveRecoveryDraft=null,removeRecoveryDrafts=null,sendRecoveryEmail=null,recoveryEmailStatus=null,production=false,trustProxy=false,secureCookies=origin.startsWith('https://'),requireVerifiedReferrals=production,identityHash=value=>digest(canonicalEmail(value)),sendVerificationEmail=null,verificationEmailStatus=null,gocho=null,appointmentMailer=null}={}) {
  if(production&&!origin.startsWith('https://'))throw new Error('Producción exige HTTPS.');
  if(production&&(trustProxy===true||['true','*','0.0.0.0/0','::/0'].includes(trustProxy)))throw new Error('No confiar en proxies desconocidos en producción.');
  if(production&&(!secureCookies||allowedOrigins.some(value=>!value.startsWith('https://'))))throw new Error('No se permite debilitar sesiones u orígenes de producción.');
  const app=express();app.disable('x-powered-by');app.locals.origin=origin;
  if(trustProxy)app.set('trust proxy',trustProxy);
  const referralOptions={requireVerified:requireVerifiedReferrals,identityHash};
  const attempts=new Map();
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    if(production){
      if(!req.secure&&!['/health/live','/health/ready'].includes(req.path))return res.status(426).json({error:'Accede mediante HTTPS.'});
      if(req.secure)res.set('Strict-Transport-Security','max-age=31536000');
    }
    if(req.path.startsWith('/api/')||req.path.startsWith('/health/')) res.set('Cache-Control','no-store');
    if(!req.path.startsWith('/api/automation/') && !['GET','HEAD','OPTIONS'].includes(req.method) && ![app.locals.origin,...allowedOrigins].includes(req.get('origin'))) return res.status(403).json({error:'Origen no permitido.'});
    next();
  });
  app.get('/health/live',(req,res)=>res.json({status:'ok'}));
  app.get('/health/ready',async(req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
  installAutomation(app,pool,{automationToken,clock,appointmentMailer});
  const limiter=wrap(async(req,res,next)=>{
    const now=Date.now(),key=digest(req.ip+':'+(req.path.startsWith('/api/auth/')?'auth':req.path.includes('verification')?'verification':'upload'));
    if(production){
      await pool.query("DELETE FROM request_limits WHERE window_start<=$1",[new Date(now-300000)]);
      const row=(await pool.query('INSERT INTO request_limits(key_hash,window_start,attempts) VALUES($1,$2,1) ON CONFLICT(key_hash) DO UPDATE SET attempts=request_limits.attempts+1 RETURNING attempts',[key,new Date(now)])).rows[0];
      if(row.attempts>rateLimit)return res.status(429).json({error:'Demasiados intentos. Espera cinco minutos.'});return next();
    }
    for(const [k,v] of attempts) if(now-v.start>300000) attempts.delete(k);
    const current=attempts.get(key)||{start:now,count:0};current.count++;attempts.set(key,current);
    if(current.count>rateLimit) return res.status(429).json({error:'Demasiados intentos. Espera cinco minutos.'});next();
  });
  app.use('/api/auth',limiter);
  app.use(express.json({limit:'64kb'}));
  app.use((req,res,next)=>{req.body??={};next();});
  app.use('/api',wrap(async(req,res,next)=>{
    const cookie=(req.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('reca_session='))?.slice(13);
    if(cookie && /^[a-f0-9]{64}$/.test(cookie)) {
      const result=await pool.query('SELECT u.id,u.email,u.name,u.role,u.email_verified_at,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.owner_setup_pending',[digest(cookie)]);
      req.user=result.rows[0]||null;req.sessionHash=digest(cookie);
    }
    if(!['GET','HEAD'].includes(req.method) && !req.path.startsWith('/auth/')) {
      if(!req.user) throw error(401,'Inicia sesión.');
      if(req.get('x-csrf-token')!==req.user.csrf) throw error(403,'Token de seguridad inválido.');
    }
    next();
  }));
  const auth=(req,res,next)=>req.user?next():next(error(401,'Inicia sesión.'));
  const owner=(req,res,next)=>req.user?.role==='owner'?next():next(error(req.user?403:401,'Solo el dueño puede realizar esta acción.'));
  const safeUser=user=>({id:user.id,email:user.email,name:user.name,role:user.role,emailVerified:!!user.email_verified_at});
  async function sessionCredentials(db,user) {
    const raw=token(),csrf=token();
    await db.query('DELETE FROM sessions WHERE expires_at<=now()');
    await db.query("INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[digest(raw),user.id,csrf]);
    return {raw,csrf,user:safeUser(user)};
  }
  function sendSession(res,{raw,csrf,user}) {
    res.cookie('reca_session',raw,{httpOnly:true,sameSite:'strict',secure:secureCookies,maxAge:8*3600000,path:'/'});
    res.json({user,csrf});
  }
  async function session(res,user){sendSession(res,await sessionCredentials(pool,user));}
  app.get('/api/auth/status',wrap(async(req,res)=>res.json({ownerConfigured:!!(await pool.query("SELECT 1 FROM users WHERE role='owner' AND NOT owner_setup_pending")).rowCount})));
  app.post('/api/auth/setup',wrap(async(req,res)=>{
    const provided=req.get('x-setup-token')||'';
    if(!setupToken || !/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(provided),Buffer.from(setupToken))) throw error(403,'Enlace de configuración inválido.');
    const hash=await passwordHash(password(req.body.password)),name=text(req.body.name,100),accountEmail=email(req.body.email??defaultOwnerEmail);
    const credentials=await scheduleTransaction(pool,async db=>{
      const existing=(await db.query("SELECT * FROM users WHERE role='owner' FOR UPDATE")).rows[0];
      if(existing&&!existing.owner_setup_pending)throw error(403,'El dueño ya está configurado.');
      let user;
      if(existing){
        await db.query('DELETE FROM sessions WHERE user_id=$1',[existing.id]);
        user=(await db.query('UPDATE users SET email=$2,name=$3,password_hash=$4,owner_setup_pending=false,email_verified_at=NULL WHERE id=$1 RETURNING *',[existing.id,accountEmail,name,hash])).rows[0];
      }else user=(await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,'owner',$4) RETURNING *",[randomUUID(),accountEmail,name,hash])).rows[0];
      return sessionCredentials(db,user);
    });
    setupToken=null;sendSession(res,credentials);
  }));
  app.post('/api/auth/register',wrap(async(req,res)=>{
    const accountEmail=email(req.body.email);
    if((await pool.query("SELECT 1 FROM users WHERE role='owner' AND email=$1",[accountEmail])).rowCount)throw error(400,'Esta dirección está reservada para el dueño.');
    const hash=await passwordHash(password(req.body.password));
    const credentials=await scheduleTransaction(pool,async db=>{
      const result=await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,'customer',$4) RETURNING *",[randomUUID(),accountEmail,text(req.body.name,100),hash]);
      await attachReferral(db,result.rows[0],req.body.referralCode);
      return sessionCredentials(db,result.rows[0]);
    });
    sendSession(res,credentials);
  }));
  const dummyHashPromise=passwordHash(token());
  const login=role=>wrap(async(req,res)=>{
    const accountEmail=email(req.body.email),candidate=text(req.body.password,128);
    const credentials=await scheduleTransaction(pool,async db=>{
      // Serialize verification/session creation with password resets: an old
      // password cannot create a session after reset revokes existing sessions.
      const user=(await db.query('SELECT * FROM users WHERE email=$1 AND role=$2 FOR UPDATE',[accountEmail,role])).rows[0];
      const valid=await verifyPassword(candidate,user?.password_hash||await dummyHashPromise);
      if(!user||user.owner_setup_pending||user.role!==role||!valid) throw error(401,'Correo o contraseña incorrectos para este acceso.');
      return sessionCredentials(db,user);
    });
    sendSession(res,credentials);
  });
  app.post('/api/auth/login',login('customer'));
  app.post('/api/auth/owner-login',login('owner'));
  installRecovery(app,pool,{wrap,transaction:fn=>scheduleTransaction(pool,fn),clock,saveDraft:saveRecoveryDraft,removeDrafts:removeRecoveryDrafts,sendEmail:sendRecoveryEmail,emailStatus:recoveryEmailStatus});
  installVerification(app,pool,{auth,wrap,transaction:fn=>scheduleTransaction(pool,fn),clock,limiter,sendEmail:sendVerificationEmail,emailStatus:verificationEmailStatus,referralOptions});
  installReferrals(app,pool,{auth,wrap,transaction:fn=>scheduleTransaction(pool,fn),requireVerified:requireVerifiedReferrals});
  app.get('/api/me',auth,(req,res)=>res.json({user:safeUser(req.user),csrf:req.user.csrf}));
  app.patch('/api/me',auth,wrap(async(req,res)=>{
    if(Object.keys(req.body).some(k=>k!=='name')) throw error(400,'Solo puedes actualizar tu nombre desde esta ruta.');
    const row=(await pool.query('UPDATE users SET name=$1 WHERE id=$2 RETURNING *',[text(req.body.name,100),req.user.id])).rows[0];res.json({user:safeUser(row)});
  }));
  app.post('/api/logout',auth,wrap(async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.clearCookie('reca_session',{path:'/'});res.json({ok:true});}));
  app.delete('/api/me',auth,wrap(async(req,res)=>{
    if(req.user.role==='owner') throw error(400,'La cuenta del dueño no se elimina desde esta ruta.');
    await scheduleTransaction(pool,async db=>{
      const active=await db.query("SELECT 1 FROM calendar_entries WHERE user_id=$1 AND status='confirmed' AND starts_at>$2",[req.user.id,new Date(clock())]);
      if(active.rowCount)throw error(409,'Debes resolver tus próximas citas antes de eliminar la cuenta.');
      await db.query("UPDATE calendar_entries SET status='cancelled' WHERE user_id=$1 AND status='held'",[req.user.id]);
      await scrubNotifications(db,req.user.id);
      await db.query('DELETE FROM users WHERE id=$1',[req.user.id]);
    });if(removeRecoveryDrafts)await removeRecoveryDrafts(req.user.id);res.clearCookie('reca_session',{path:'/'});res.json({ok:true});
  }));
  // Only minimal branding is visible before authentication.
  app.get('/api/site',wrap(async(req,res)=>{
    const settings=(await pool.query('SELECT data FROM settings')).rows[0].data;
    res.json({name:settings.name,ownerPhoto:settings.ownerPhoto,welcomeVideos:settings.welcomeVideos||{},welcomeVideoCredits:settings.welcomeVideoCredits||{},hiddenWelcomeVideos:settings.hiddenWelcomeVideos||{}});
  }));
  app.get('/api/public',auth,wrap(async(req,res)=>{
    const [settings,services,gallery,offers]=await Promise.all([pool.query('SELECT data FROM settings'),pool.query('SELECT data FROM services ORDER BY id DESC'),pool.query('SELECT data FROM gallery WHERE active=true ORDER BY position,id'),publicOffers(pool,clock())]);
    res.json({settings:settings.rows[0].data,services:services.rows.filter(r=>r.data.active).map(r=>r.data),gallery:gallery.rows.map(r=>r.data),offers});
  }));
  app.get('/api/admin',owner,wrap(async(req,res)=>{
    const [settings,services,gallery]=await Promise.all([pool.query('SELECT data FROM settings'),pool.query('SELECT data FROM services ORDER BY id DESC'),pool.query('SELECT data,position,active FROM gallery ORDER BY position,id')]);
    res.json({settings:settings.rows[0].data,services:services.rows.map(r=>r.data),gallery:gallery.rows.map(r=>({...r.data,position:r.position,active:r.active}))});
  }));
  app.get('/api/admin/automation',owner,wrap(async(req,res)=>res.json(await automationSummary(pool,{now:clock(),origin:app.locals.origin,appointmentMailer}))));
  app.patch('/api/admin/settings',owner,wrap(async(req,res)=>{
    const value=req.body;
    if(Object.keys(value).some(k=>!['city','timezone','weekly','ownerPhoto','cancellationNoticeMinutes','bookingNoticeMinutes','bookingSpacingMinutes'].includes(k))) throw error(400,'Configuración no permitida.');
    const patch={};
    if(value.city!==undefined) patch.city=text(value.city,120,true);
    if(value.timezone!==undefined) {patch.timezone=text(value.timezone,80,true);if(patch.timezone) try {new Intl.DateTimeFormat('en',{timeZone:patch.timezone});} catch {throw error(400,'Zona horaria inválida.');}}
    if(value.weekly!==undefined) patch.weekly=validateWeekly(value.weekly);
    if(value.cancellationNoticeMinutes!==undefined) patch.cancellationNoticeMinutes=value.cancellationNoticeMinutes===null?null:number(value.cancellationNoticeMinutes,0,10080);
    if(value.bookingNoticeMinutes!==undefined) patch.bookingNoticeMinutes=value.bookingNoticeMinutes===null?null:number(value.bookingNoticeMinutes,0,10080);
    if(value.bookingSpacingMinutes!==undefined) patch.bookingSpacingMinutes=value.bookingSpacingMinutes===null?null:number(value.bookingSpacingMinutes,60,600);
    if(value.ownerPhoto!==undefined) {
      if(value.ownerPhoto!==null && !/^\/media\/[a-f0-9-]{36}\.webp$/.test(value.ownerPhoto)) throw error(400,'Fotografía inválida.');
      if(value.ownerPhoto!==null) {const {access}=await import('node:fs/promises');try {await access(path.join(uploads,path.basename(value.ownerPhoto)));} catch {throw error(400,'La fotografía no existe.');}}
      patch.ownerPhoto=value.ownerPhoto;
    }
    const row=await scheduleTransaction(pool,async db=>(await db.query('UPDATE settings SET data=data || $1::jsonb RETURNING data',[JSON.stringify(patch)])).rows[0]);res.json(row.data);
  }));
  app.put('/api/admin/services/:id',owner,wrap(async(req,res)=>{
    const id=req.params.id;if(!['men','kids'].includes(id)) throw error(400,'Servicio inválido.');
    const v=req.body;
    const data={id,name:bilingual(v.name,100),description:bilingual(v.description,600),priceCents:v.priceCents===null?null:number(v.priceCents,0,100000),active:v.active};
    if(typeof v.active!=='boolean') throw error(400,'Estado inválido.');
    await scheduleTransaction(pool,db=>db.query('UPDATE services SET data=$1 WHERE id=$2',[JSON.stringify(data),id]));res.json(data);
  }));
  app.post('/api/admin/upload',owner,limiter,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'6mb'}),wrap(async(req,res)=>{
    if(!Buffer.isBuffer(req.body)||!req.body.length) throw error(400,'Selecciona una imagen JPEG, PNG o WebP de hasta 6 MB.');
    let normalized;
    try {
      const image=sharp(req.body,{limitInputPixels:20000000,animated:false,failOn:'error'}),metadata=await image.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1) throw new Error();
      normalized=await image.rotate().resize(1200,1200,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    } catch {throw error(400,'La imagen no es válida o es demasiado grande.');}
    const id=randomUUID()+'.webp';await mkdir(uploads,{recursive:true,mode:0o700});await writeFile(path.join(uploads,id),normalized,{mode:0o600});res.status(201).json({image:'/media/'+id});
  }));
  app.post('/api/admin/gallery',owner,wrap(async(req,res)=>{
    const v=req.body;
    if(!/^\/media\/[a-f0-9-]{36}\.webp$/.test(v.image||'')) throw error(400,'Sube primero una imagen.');
    const {access}=await import('node:fs/promises');try {await access(path.join(uploads,path.basename(v.image)));} catch {throw error(400,'Imagen no encontrada.');}
    if(!['men','kids'].includes(v.audience)||!['classic','fade','textured'].includes(v.style)||v.permissionConfirmed!==true) throw error(400,'Categoría, estilo o autorización inválidos.');
    if(v.simple===true&&v.ownPhoto!==true)throw error(400,'El formulario sencillo es para fotos propias con autorización.');
    const name=v.simple===true?text(v.name,100):null;
    const id=randomUUID(),data={id,image:v.image,name:name?{es:name,en:name}:bilingual(v.name,100),description:v.simple===true?{es:'Foto propia de referencia. El resultado se acuerda en el local.',en:'Own haircut reference photo. The result is agreed at the shop.'}:bilingual(v.description,600),audience:v.audience,style:v.style,author:v.simple===true?req.user.name:text(v.author,100),source:v.simple===true?'Foto propia declarada por el dueño':text(v.source,500),license:v.simple===true?'Autorización de uso e imagen declarada por el dueño':text(v.license,200),permissionConfirmed:true};
    await scheduleTransaction(pool,async db=>{const position=v.simple===true?(await db.query('SELECT COALESCE(max(position),-1)+1 AS next FROM gallery')).rows[0].next:number(v.position,0,10000);await db.query('INSERT INTO gallery(id,data,position) VALUES($1,$2,$3)',[id,JSON.stringify(data),position]);});res.status(201).json(data);
  }));
  app.patch('/api/admin/gallery/:id',owner,wrap(async(req,res)=>{
    if(Object.keys(req.body).some(k=>!['active','position'].includes(k))) throw error(400,'Campos no permitidos.');
    if(typeof req.body.active!=='boolean') throw error(400,'Estado inválido.');
    const row=(await pool.query('UPDATE gallery SET active=$1,position=$2 WHERE id=$3 RETURNING id',[req.body.active,number(req.body.position,0,10000),req.params.id])).rows[0];
    if(!row) throw error(404,'Referencia no encontrada.');res.json({ok:true});
  }));
  installBookings(app,pool,{auth,owner,wrap,clock,referralOptions});
  installWaitlist(app,pool,{auth,owner,wrap,clock});
  installReviews(app,pool,{auth,wrap});
  installContent(app,pool,{owner,wrap,limiter,uploads,clock});
  installFinance(app,pool,{owner,wrap,clock});
  installMusic(app,pool,{owner,wrap,limiter,uploads});
  installMediaLibrary(app,pool,{owner,wrap,uploads});
  installGocho(app,pool,{owner,wrap,limiter,clock,...(gocho?{provider:gocho}:{})});
  app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
  app.use('/media',express.static(uploads,{dotfiles:'deny',index:false,maxAge:'1d'}));
  app.use(express.static(path.join(root,'prototipo'),{dotfiles:'deny',index:'index.html',maxAge:0}));
  app.use((err,req,res,next)=>{
    const status=['23505','23P01'].includes(err.code)?409:(err.status||500);
    if(status===500) console.error('Backend error:',err.code||err.message);
    res.status(status).json({error:err.code==='23P01'?'Ese intervalo está ocupado por una cita o bloqueo.':err.code==='23505'?'La cuenta o configuración ya existe.':status===500?'Error interno del servidor.':err.message});
  });
  return app;
}
