import {mediaCreditsHTML} from './media-credits.js';
import { copy, cuts } from './data.js';
import {fetchJSON,customerError} from './client-request.js';
export const state={connected:false,loading:true,bootstrapError:null,user:null,csrf:null,public:null,admin:null,automation:null,referrals:null,recovery:null,verification:null};
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rerender=()=>{}, bitmap=null, crop={zoom:1,x:0,y:0}, customerAuthMode='register';
let resetToken=null,verificationToken=null,referralCode='',setupToken=null;
try{referralCode=sessionStorage.getItem('reca-referral')||'';}catch{}
function consumeAccountLink(){
  if(/^#setup\/[a-f0-9]{64}$/.test(location.hash)){
    setupToken=location.hash.slice(7);history.replaceState(null,'','#admin');return;
  }
  if(location.hash==='#login')customerAuthMode='login';
  if(location.hash==='#register')customerAuthMode='register';
  if(/^#verify\/[a-f0-9]{64}$/.test(location.hash)){
    verificationToken=location.hash.slice(8);customerAuthMode='verify';history.replaceState(null,'','#profile');
  }else if(/^#reset\/[a-f0-9]{64}$/.test(location.hash)){
    resetToken=location.hash.slice(7);customerAuthMode='reset';history.replaceState(null,'','#profile');
  }else if(/^#ref\/[a-f0-9]{32}$/.test(location.hash)){
    referralCode=location.hash.slice(5);customerAuthMode='register';
    try{sessionStorage.setItem('reca-referral',referralCode);}catch{}
    history.replaceState(null,'','#register');
  }
}
consumeAccountLink();
window.addEventListener('hashchange',consumeAccountLink);
export async function request(url,{method='GET',body,raw=false,headers={},timeoutMs}={}) {
  const requestUser=state.user,requestCsrf=state.csrf;
  try {
    return await fetchJSON(url,{method,timeoutMs,credentials:'same-origin',headers:{...(!raw&&body?{'Content-Type':'application/json'}:{}),...(state.csrf?{'X-CSRF-Token':state.csrf}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});
  }catch(err){
    if(err.status===401&&!url.startsWith('/api/auth/')&&state.user===requestUser&&state.csrf===requestCsrf){const hadUser=!!state.user;state.user=null;state.csrf=null;state.admin=null;state.automation=null;state.referrals=null;if(hadUser)rerender();}
    err.originalMessage ||= err.message;err.message=customerError(err,document.documentElement.lang);throw err;
  }
}
function applyPublic(data) {
  state.public=data;state.connected=true;cuts.splice(0,cuts.length,...data.gallery);
  for(const svc of data.services) for(const language of ['es','en']) {copy[language][svc.id+'Cut']=svc.name[language];copy[language][svc.id+'Desc']=svc.description[language];}
  copy.es.footer='Estados Unidos · '+(data.settings.city||'Ciudad por definir');copy.en.footer='United States · '+(data.settings.city||'City to be defined');
  copy.es.imageNote=`${data.gallery.length} fotografías reales de referencia. No garantizan un resultado idéntico.`;
  copy.en.imageNote=`${data.gallery.length} real inspiration photographs. They do not guarantee identical results.`;
}
function applySite(data){
  state.connected=true;state.admin=null;state.automation=null;state.referrals=null;state.verification=null;
  state.public={settings:{name:data.name,ownerPhoto:data.ownerPhoto,welcomeVideos:data.welcomeVideos||{},welcomeVideoCredits:data.welcomeVideoCredits||{},hiddenWelcomeVideos:data.hiddenWelcomeVideos||{},weekly:[]},services:[],gallery:[],offers:[]};
  cuts.splice(0,cuts.length);
}
export async function refresh() {
  if(!state.connected) return;
  const user=state.user;
  const data=await request(user?'/api/public':'/api/site');
  if(state.user!==user)return; // Ignore responses from a session that ended/changed.
  if(!user){applySite(data);return;}
  applyPublic(data);
  if(user.role==='owner') {
    state.referrals=null;
    const [admin,automation]=await Promise.all([request('/api/admin'),request('/api/admin/automation')]);
    if(state.user!==user)return;
    state.admin=admin;state.automation=automation;
  } else {
    const [referrals,verification]=await Promise.all([request('/api/referrals'),request('/api/account/verification')]);if(state.user!==user)return;
    state.admin=null;state.automation=null;state.referrals=referrals;state.verification=verification;
  }
}
export async function bootstrap() {
  state.loading=true;state.bootstrapError=null;
  try {
    applySite(await request('/api/site'));
    const [recovery,session]=await Promise.all([
      request('/api/auth/recovery-status',{timeoutMs:3000}).catch(()=>null),
      request('/api/me').catch(err=>{if(err.status===401)return null;throw err;})
    ]);
    state.recovery=recovery;state.user=session?.user??null;state.csrf=session?.csrf??null;
    await refresh();
  } catch(err){state.connected=false;state.bootstrapError=err;}
  finally{state.loading=false;}
}
const E=escapeHTML;
let passwordFieldId=0;
function field(name,label,value='',type='text',extra=''){
  if(type!=='password')return `<label class="field-label">${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
  const id=`password-field-${++passwordFieldId}`,en=document.documentElement.lang==='en';
  const hint=extra.includes('new-password')?(en?'Use at least 12 characters. A phrase with several words is easier to remember.':'Usa al menos 12 caracteres. Una frase con varias palabras es más fácil de recordar.'):(en?'Enter the password you chose when creating your account.':'Escribe la contraseña que elegiste al crear tu cuenta.');
  return `<div class="field-label password-field"><label for="${id}">${label}</label><div class="password-control"><input id="${id}" name="${name}" type="password" value="${E(value)}" aria-describedby="${id}-hint" ${extra}><button class="password-toggle" type="button" data-password-toggle aria-controls="${id}" aria-pressed="false" aria-label="${en?'Show password':'Mostrar contraseña'}">${en?'Show':'Mostrar'}</button></div><small id="${id}-hint">${hint}</small></div>`;
}
function customerRegistrationForm(language){
  const en=language==='en';
  return `<form class="card server-form" id="customer-registration" data-form="register"><h2>${en?'Create customer account':'Crear cuenta de cliente'}</h2>${field('name',en?'Your name':'Tu nombre','','text','required maxlength="100" autocomplete="name"')}${field('email','Email','','email','required autocomplete="email"')}${field('password',en?'Password (12+ characters)':'Contraseña (12 caracteres mínimo)','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}<input type="hidden" name="referralCode" value="${E(referralCode)}">${referralCode?`<p id="referral-note" class="demo-note">${en?'Referral applied from the shared link.':'Recomendación aplicada desde el enlace compartido.'} <button type="button" class="text-button" data-server-action="clear-referral">${en?'Register without referral':'Registrarme sin recomendación'}</button></p>`:''}<p class="demo-note">${en?'This creates a customer account. Referral discounts require email verification from My account.':'Este formulario crea una cuenta de cliente. Los descuentos por recomendación requieren verificar tu correo desde Mi cuenta.'}</p><button class="button full">${en?'Create customer account':'Crear cuenta de cliente'}</button></form>`;
}
export const recoveryActive=()=>customerAuthMode==='reset'&&!!resetToken;
export const verificationActive=()=>customerAuthMode==='verify'&&!!verificationToken;
export function resetCustomerEntry(){customerAuthMode='register';}
export function registrationContent(language){
  const en=language==='en';
  if(state.user&&!recoveryActive()&&!verificationActive())return accountContent(language)+`<a class="button full" href="#home">${en?'Go to home':'Ir a Inicio'}</a>`;
  const titles={register:en?'Create account':'Crear cuenta',login:en?'Sign in':'Iniciar sesión',forgot:en?'Recover password':'Recuperar contraseña',reset:en?'New password':'Nueva contraseña',verify:en?'Verify email':'Verificar correo'};
  const entryVideo=customerAuthMode==='register'&&!state.public?.settings.hiddenWelcomeVideos?.register?`<video class="entry-video" controls playsinline loop preload="metadata" aria-label="${state.public?.settings.welcomeVideoCredits?.register?.external?(en?'External reference video selected by RECA':'Video de referencia externo seleccionado por RECA'):(en?'RECA Barbería welcome video':'Video de bienvenida de RECA Barbería')}"><source src="${E(state.public?.settings.welcomeVideos?.register||'assets/videos/registro-musica.mp4')}" type="video/mp4">${en?'Your browser cannot play this video.':'Tu navegador no puede reproducir este video.'}</video>${mediaCreditsHTML(state.public?.settings.welcomeVideoCredits?.register)}`:'';
  return `${entryVideo}<h1>${titles[customerAuthMode]}</h1>${customerAuthMode==='register'?`<p>${en?'Register to book your haircut.':'Regístrate para reservar tu corte.'}</p>`:''}${authForms(language)}`;
}
function authForms(language,{ownerArea=false}={}) {
  const en=language==='en';
  if(!state.connected) return '<p class="warning">Abre el backend en http://127.0.0.1:8081 para usar las cuentas reales.</p>';
  if(setupToken&&ownerArea) return `<form class="card server-form" data-form="setup"><h2>${en?'Set up the owner':'Configurar al dueño'}</h2><p>${en?'Private, single-use local setup. Do not share this link.':'Configuración local privada y de un solo uso. No compartas este enlace.'}</p>${field('email',en?'Owner email':'Correo del dueño','demo-54b54911@example.com','email','required autocomplete="email"')}${field('name',en?'Owner name':'Nombre del dueño','','text','required maxlength="100" autocomplete="name"')}${field('password',en?'Password (12+ characters)':'Contraseña (12 caracteres mínimo)','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}<button class="button full">${en?'Create owner account':'Crear cuenta del dueño'}</button></form>`;
  if(ownerArea)return `<h1>${en?'Owner sign-in':'Acceso del dueño'}</h1><p>${en?'Private administration. This is not customer registration.':'Administración privada. Esta no es la entrada de clientes.'}</p><form class="card server-form" data-form="owner-login"><h2>${en?'Owner account':'Cuenta del dueño'}</h2>${field('email','Email','','email','required autocomplete="username"')}${field('password',en?'Password':'Contraseña','','password','required maxlength="128" autocomplete="current-password"')}<button class="button full">${en?'Enter private dashboard':'Entrar al panel privado'}</button></form><p>${en?'First-time owner setup requires the private setup link, not public registration.':'La primera configuración del dueño requiere el enlace privado, no el registro público.'}</p><a class="text-button" href="/">${en?'Back to customer application':'Volver a la aplicación de clientes'}</a>`;
  if(customerAuthMode==='verify'&&verificationToken)return `<form class="card server-form" data-form="verify-email"><p>${en?'Confirm that this email belongs to you. Verification does not subscribe you to advertising.':'Confirma que este correo te pertenece. Verificarlo no te suscribe a publicidad.'}</p><button class="button full">${en?'Confirm my email':'Confirmar mi correo'}</button></form>`;
  if(customerAuthMode==='forgot')return `<form class="card server-form" data-form="forgot-password"><h2>${en?'Recover password':'Recuperar contraseña'}</h2>${field('email','Email','','email','required autocomplete="email"')}<p class="${state.recovery?.enabled?'demo-note':'warning'}">${state.recovery?.enabled?(en?'Enter the email used to register. Check your inbox and spam folder. The link expires in 30 minutes.':'Escribe el correo con el que te registraste. Revisa tu bandeja de entrada y Spam. El enlace vence en 30 minutos.'):(en?'Email recovery is not enabled yet. No email will be sent until Gmail configuration and the reception test are completed.':'La recuperación por correo aún no está habilitada. No se enviará un correo hasta completar la configuración de Gmail y la prueba de recepción.')}</p>${state.recovery?.enabled&&state.recovery.localOnly?`<p class="warning">${en?'Local test: open the recovery link on the same Wi-Fi as the computer.':'Prueba local: abre el enlace de recuperación en la misma red Wi-Fi que la computadora.'}</p>`:''}<button class="button full">${en?'Request recovery':'Solicitar recuperación'}</button><button class="text-button" type="button" data-server-action="show-login">${en?'Back to sign in':'Volver a iniciar sesión'}</button></form>`;
  if(customerAuthMode==='reset'&&resetToken)return `<form class="card server-form" data-form="reset-password"><h2>${en?'New password':'Nueva contraseña'}</h2>${field('password',en?'New password (12+ characters)':'Nueva contraseña (12 caracteres mínimo)','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}${field('confirmPassword',en?'Repeat password':'Repite la contraseña','','password','required minlength="12" maxlength="128" autocomplete="new-password"')}<button class="button full">${en?'Save new password':'Guardar nueva contraseña'}</button></form>`;
  if(customerAuthMode==='register')return customerRegistrationForm(language)+`<button class="text-button" type="button" data-server-action="show-login">${en?'Already have an account? Sign in':'Ya tengo cuenta · Iniciar sesión'}</button>`;
  return `<form class="card server-form" data-form="login"><h2>${en?'Your customer account':'Tu cuenta de cliente'}</h2>${field('email','Email','','email','required autocomplete="username"')}${field('password',en?'Password':'Contraseña','','password','required maxlength="128" autocomplete="current-password"')}<button class="button full">${en?'Sign in':'Entrar'}</button><button class="text-button" type="button" data-server-action="show-forgot">${en?'Forgot password?':'¿Olvidaste tu contraseña?'}</button></form><button class="text-button" type="button" data-server-action="show-register">${en?'No account yet? Create account':'No tengo cuenta · Crear cuenta'}</button>`;
}
export function accountContent(language,{ownerArea=false}={}) {
  const en=language==='en';
  if(!state.user) return authForms(language);
  if(state.user.role==='owner'&&!ownerArea)return `<section class="card"><h2>${en?'Owner session active':'Sesión del dueño activa'}</h2><p>${en?'Open Sistema de Control de Barbería for your private dashboard. Sign out to enter as a customer.':'Abre Sistema de Control de Barbería para tu panel privado. Cierra sesión para entrar como cliente.'}</p><a class="button full" href="/comanda/">Sistema de Control de Barbería</a><button class="button secondary full" data-server-action="logout">${en?'Sign out to enter as customer':'Cerrar sesión para entrar como cliente'}</button></section>`;
  return `<section class="card"><span class="badge">${state.user.role==='owner'?(en?'Owner':'Dueño'):(en?'Customer':'Cliente')}</span><h2>${E(state.user.name)}</h2><p>${E(state.user.email)}</p><form class="server-form" data-form="account">${field('name',en?'Your name':'Tu nombre',state.user.name,'text','required maxlength="100"')}<button class="button secondary full" type="submit" hidden>${en?'Save name':'Guardar nombre'}</button></form><div class="account-actions"><button class="button secondary full" type="button" data-server-action="logout">${en?'Sign out':'Cerrar sesión'}</button>${state.user.role==='customer'?`<div class="account-delete"><button class="text-button danger" type="button" data-server-action="delete-account">${en?'Delete my account':'Eliminar mi cuenta'}</button></div>`:''}</div></section>${state.user.role==='customer'?verificationContent(language)+referralContent(language):''}`;
}
function verificationContent(language){
  const en=language==='en',data=state.verification;if(!data)return '';
  return `<section class="card"><h2>${en?'Email verification':'Verificación del correo'}</h2><p>${data.verified?(en?'Your email is verified.':'Tu correo está verificado.'):(en?'Verify your email to earn and use referral discounts. Both customers must have verified emails.':'Verifica tu correo para ganar y utilizar descuentos por recomendación. Ambos clientes deben tener el correo verificado.')}</p>${data.verified?'':data.enabled?`<button class="button secondary full" data-server-action="request-verification">${en?'Send verification link':'Enviar enlace de verificación'}</button>`:`<p class="warning">${en?'Verification email delivery is not enabled yet. No email will be sent until it is authorized and configured.':'El envío de verificaciones todavía no está habilitado. No se enviará ningún correo hasta autorizarlo y configurarlo.'}</p>`}</section>`;
}
function referralContent(language) {
  const en=language==='en',data=state.referrals;if(!data)return '';
  const invitation=(en?'Join RECA Barbería using my referral link: ':'Regístrate en RECA Barbería con mi enlace de recomendación: ')+data.url+(data.publicSharingReady?'':(en?'\nLocal test: only opens on the same Wi-Fi as the barber shop computer.':'\nPrueba local: solo abre en la misma Wi-Fi que la computadora de la barbería.'));
  const whatsappUrl='https://wa.me/?text='+encodeURIComponent(invitation);
  return `<section class="card"><h2>${en?'Recommend and earn':'Recomienda y gana'}</h2><p>${en?'Points earned':'Puntos ganados'}: <strong>${data.points}</strong> · ${en?'Available 25% discounts':'Descuentos del 25 % disponibles'}: <strong>${data.availableRewards}</strong></p>${data.verificationRequired&&!data.emailVerified?`<p class="warning">${en?'Your rewards stay pending until the required emails are verified and the owner marks the haircut completed.':'Los premios quedan pendientes hasta verificar los correos requeridos y que el dueño marque el corte como atendido.'}</p>`:''}<p>${en?'Each new customer who registers with your link and completes their first haircut earns you 1 point and a single-use 25% discount for a future booking. Discounts cannot be combined.':'Cada cliente nuevo que se registre con tu enlace y complete su primer corte te da 1 punto y un descuento del 25 % de un solo uso para una próxima reserva. No se acumulan descuentos.'}</p>${data.publicSharingReady?'':`<p class="warning">${en?'Local test link: only works on the same Wi-Fi. Public sharing requires HTTPS hosting.':'Enlace de prueba local: solo funciona en la misma red Wi-Fi. Compartir fuera de esa red requiere publicar con HTTPS.'}</p>`}<img src="${E(data.qrDataUrl)}" alt="${en?'Your referral QR':'Tu QR de recomendación'}" width="240" height="240">${field('referralLink',en?'Your referral link':'Tu enlace de recomendación',data.url,'text','readonly')}<a class="button full" href="${E(whatsappUrl)}" target="_blank" rel="noopener noreferrer" data-share-referral>${en?'Share via WhatsApp':'Compartir por WhatsApp'}</a><button class="button secondary full" data-server-action="copy-referral">${en?'Copy link':'Copiar enlace'}</button><a class="button secondary full" href="${E(data.qrDataUrl)}" download="recomendacion-barberia.png">${en?'Download QR':'Descargar QR'}</a><button class="text-button" data-server-action="refresh-referrals">${en?'Refresh points':'Actualizar puntos'}</button></section>`;
}
export function adminContent(language) {
  const en=language==='en';
  if(!state.user) return authForms(language,{ownerArea:true});
  if(state.user.role!=='owner') return `<div class="warning">${en?'Only the owner can access administration. Your customer session has no administrative permissions.':'Solo el dueño puede acceder a la administración. Tu sesión de cliente no tiene permisos administrativos.'}</div><button class="button secondary" data-server-action="logout">${en?'Sign out':'Cerrar sesión'}</button>`;
  const data=state.admin;if(!data) return '<p>Error al cargar la administración.</p>';
  const settings=data.settings;
  const services=data.services.map(svc=>`<form class="card server-form" data-form="service" data-id="${E(svc.id)}"><h2>${E(svc.name[language])}</h2>${field('nameEs','Nombre · Español',svc.name.es,'text','required maxlength="100"')}${field('nameEn','Name · English',svc.name.en,'text','required maxlength="100"')}${field('descEs','Descripción · Español',svc.description.es,'text','required maxlength="600"')}${field('descEn','Description · English',svc.description.en,'text','required maxlength="600"')}<div class="form-grid">${field('price',en?'Price · USD':'Precio · USD',svc.priceCents===null?'':(svc.priceCents/100).toFixed(2),'number','min="0" max="1000" step="0.01"')}</div><label class="check-label"><input type="checkbox" name="active" ${svc.active?'checked':''}>${en?'Visible service':'Servicio visible'}</label><small>${en?'Leave unknown values blank. Payments remain at the shop.':'Deja en blanco lo que aún no sepas. El pago sigue siendo en el local.'}</small><button class="button full">${en?'Save service':'Guardar servicio'}</button></form>`).join('');
  const weekdays=en?['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']:['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return `<span class="eyebrow">RECA BARBERÍA · ${en?'PRIVATE ADMIN':'ADMINISTRACIÓN PRIVADA'}</span><h1>${en?'Owner dashboard':'Panel del dueño'}</h1><p class="live-note">${en?'Changes and bookings are saved in PostgreSQL.':'Los cambios y las reservas se guardan en PostgreSQL.'}</p><form class="card server-form" data-form="settings"><h2>${en?'Location and hours':'Ubicación y horarios'}</h2>${field('city',en?'City and state':'Ciudad y estado',settings.city,'text','maxlength="120"')}${field('timezone',en?'IANA time zone':'Zona horaria IANA',settings.timezone,'text','placeholder="America/New_York" maxlength="80"')}${field('cancellationNoticeMinutes',en?'Minimum cancellation/reschedule notice · minutes':'Anticipación para cancelar o cambiar · minutos',settings.cancellationNoticeMinutes??'','number','min="0" max="10080" step="1"')}${field('bookingNoticeMinutes',en?'Minimum booking notice · minutes':'Anticipación mínima para reservar · minutos',settings.bookingNoticeMinutes??'','number','min="0" max="10080" step="1"')}${field('bookingSpacingMinutes',en?'Minimum spacing between bookings · minutes':'Separación mínima entre reservas · minutos',settings.bookingSpacingMinutes??'','number','min="60" max="600" step="1"')}<small>${en?'Calendar space, not an estimate of haircut duration. Minimum one hour.':'Espacio de agenda, no estimación del corte. Mínimo una hora.'}</small><small>${en?'Set booking notice to 0 to allow any future available time. Blank keeps bookings disabled.':'Usa 0 para permitir cualquier turno futuro disponible. En blanco las reservas permanecen deshabilitadas.'}</small><small>${en?'Example time-zone name, not a selected location.':'El ejemplo de zona horaria no establece la ubicación del negocio.'}</small>${settings.weekly.map(d=>`<div class="day-editor"><strong>${weekdays[d.day]}</strong><label class="check-label"><input type="checkbox" name="closed${d.day}" ${d.closed?'checked':''}>${en?'Closed':'Cerrado'}</label>${field('hours'+d.day,en?'Shifts separated by commas':'Turnos separados por comas',d.intervals.map(x=>x.join('-')).join(', '),'text','placeholder="10:00-14:00, 16:00-20:00"')}</div>`).join('')}<button class="button full">${en?'Save settings':'Guardar configuración'}</button></form>${services}<form class="card server-form" data-form="owner-photo"><h2>${en?'Your public photo':'Tu foto pública'}</h2><p>${en?'Separate from the RECA logo. Crop, preview, and save.':'Separada del logotipo RECA. Recorta, previsualiza y guarda.'}</p><input id="owner-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required><canvas id="photo-preview" width="500" height="500" hidden></canvas><div id="crop-controls" hidden>${field('zoom',en?'Zoom':'Acercamiento',1,'range','min="1" max="3" step="0.05"')}${field('panX',en?'Horizontal':'Horizontal',0,'range','min="-100" max="100"')}${field('panY',en?'Vertical':'Vertical',0,'range','min="-100" max="100"')}</div><small>JPEG / PNG / WebP · 6 MB ${en?'maximum':'máximo'}</small><button class="button full">${en?'Save owner photo':'Guardar foto del dueño'}</button><button type="button" class="text-button" data-server-action="remove-photo">${en?'Remove current photo':'Quitar foto actual'}</button></form><form class="card server-form" data-form="gallery"><h2>${en?'Add your haircut photo':'Añadir foto de tu corte'}</h2><label class="field-label">${en?'Photo':'Foto'}<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label>${field('name',en?'Haircut name':'Nombre del corte','','text','required maxlength="100"')}<label class="field-label">${en?'Audience':'Categoría'}<select name="audience"><option value="men">${en?'Gentlemen':'Caballeros'}</option><option value="kids">${en?'Kids':'Niños'}</option></select></label><label class="field-label">${en?'Style':'Estilo'}<select name="style"><option value="classic">${en?'Classic':'Clásico'}</option><option value="fade">Fade</option><option value="textured">${en?'Textured':'Texturizado'}</option></select></label><label class="check-label"><input name="permission" type="checkbox" required>${en?'This is my own photo and I have permission to publish it, including guardian permission for identifiable children.':'Es una foto propia y tengo permiso para publicarla; si aparece un niño identificable, también el de su representante.'}</label><small>${en?'Added last automatically. The haircut name is used in both languages.':'Se coloca al final automáticamente. El nombre del corte se usa en ambos idiomas.'}</small><button class="button full">${en?'Add photo':'Añadir foto'}</button></form><section class="card"><h2>${en?'Manage gallery':'Gestionar galería'}</h2>${data.gallery.map(c=>`<form class="gallery-admin-item server-form" data-form="gallery-state" data-id="${E(c.id)}"><img src="${E(c.image)}" alt="${E(c.name[language])}" loading="lazy"><div><strong>${E(c.name[language])}</strong><label class="check-label"><input type="checkbox" name="active" ${c.active?'checked':''}>${en?'Visible':'Visible'}</label>${field('position',en?'Order':'Orden',c.position,'number','min="0" max="10000" required')}<button class="button secondary">${en?'Save':'Guardar'}</button></div></form>`).join('')}</section><button class="text-button" data-server-action="logout">${en?'Sign out':'Cerrar sesión'}</button>`;
}
export function automationContent(language) {
  if(state.user?.role!=='owner')return '';
  const en=language==='en',data=state.automation;if(!data)return '';
  const labels=en?{confirmed:'Confirmation',rescheduled:'Reschedule',cancelled:'Cancellation',reminder:'Reminder',queued:'Queued',drafting:'Drafting',prepared:'Draft ready',failed:'Needs review',accepted:'Accepted by Gmail',sending:'Sending',uncertain:'Delivery uncertain'}:{confirmed:'Confirmación',rescheduled:'Cambio de horario',cancelled:'Cancelación',reminder:'Recordatorio',queued:'En cola',drafting:'Redactando',prepared:'Borrador listo',failed:'Revisar',accepted:'Aceptado por Gmail',sending:'Enviando',uncertain:'Envío por revisar'};
  const recent=data.jobs.filter(job=>job.status!=='cancelled');
  return `<section class="card automation-panel"><h2>${data.canSend?(data.runnerStatus==='connected'?(en?'Automatic emails · connected':'Correos automáticos · conectados'):(en?'Automatic emails · check connection':'Correos automáticos · revisar conexión')):(en?'Automatic emails · drafts':'Correos automáticos · borradores')}</h2><p class="warning">${data.canSend?(en?'WhatsApp is disabled. n8n sends only new appointment emails; historical drafts are excluded.':'WhatsApp desactivado. n8n envía únicamente correos de eventos nuevos; la cola antigua está excluida.'):(en?'WhatsApp is disabled. Appointment email delivery is not enabled.':'WhatsApp desactivado. El envío de correos de citas no está habilitado.')}</p>${data.canSend&&data.runnerStatus!=='connected'?`<p class="warning" role="alert">${en?'Email is configured, but n8n has not connected in the last 3 minutes. Check Docker and n8n, then refresh this status. Automatic delivery is not confirmed.':'El correo está configurado, pero n8n no se ha conectado en los últimos 3 minutos. Revisa Docker y n8n, y actualiza este estado. El envío automático no está confirmado.'}</p>`:''}<p>${data.lastPoll?(en?'Last n8n poll: ':'Última consulta de n8n: ')+E(new Date(data.lastPoll).toLocaleString(en?'en-US':'es-US',{timeZone:'America/New_York'})):(en?'n8n has not connected yet.':'n8n todavía no se ha conectado.')}</p><p>${en?'Ready':'Preparados'}: ${data.counts.prepared||0} · ${en?'Queued':'En cola'}: ${data.counts.queued||0} · ${en?'Review':'Revisar'}: ${data.counts.failed||0}</p><small>${en?'Reminders are prepared 1 hour before. SMTP acceptance is not confirmed inbox delivery; uncertain sends need review and are not automatically retried.':'Los recordatorios se preparan 1 hora antes. Aceptación por Gmail no garantiza recepción; los envíos inciertos requieren revisión y no se reintentan automáticamente.'} ${en?'Accepted by Gmail':'Aceptados por Gmail'}: ${data.emailDeliveries?.accepted||0} · ${en?'Uncertain':'Por revisar'}: ${data.emailDeliveries?.uncertain||0}</small><button class="button secondary full" data-server-action="refresh-automation">${en?'Refresh message status':'Actualizar estado de mensajes'}</button>${recent.length?recent.map(job=>`<details class="message-item"><summary>${E(labels[job.event])} · ${E(labels[job.email_status]||labels[job.status])}</summary>${job.draft?`<strong>${E(job.draft.subject)}</strong><p class="message-draft">${E(job.draft.emailText)}</p>`:`<p>${E(job.last_error||(en?'Waiting for n8n to prepare the draft.':'Esperando que n8n prepare el borrador.'))}</p>`}</details>`).join(''):`<p>${en?'No pending messages.':'No hay mensajes pendientes.'}</p>`}<h3>${en?'Waiting list · private drafts':'Lista de espera · borradores privados'}</h3><p>${en?'Active preferences':'Preferencias activas'}: ${data.waitlistCount||0}</p>${(data.waitlistNotices||[]).map(notice=>`<details class="message-item"><summary>${E(notice.draft.subject)}</summary><p class="message-draft">${E(notice.draft.emailText||notice.draft.whatsappText)}</p><small>${en?'Not sent; availability is checked before showing this draft.':'No enviado; se comprueba disponibilidad antes de mostrar este borrador.'}</small></details>`).join('')}</section>`;
}
function message(value,failed=false) {
  let box=document.querySelector('#server-feedback');if(!box){box=document.createElement('p');box.id='server-feedback';document.querySelector('main').prepend(box);}
  box.setAttribute('role',failed?'alert':'status');box.setAttribute('aria-atomic','true');box.classList.toggle('feedback-error',failed);box.textContent=value;
  if(failed){box.tabIndex=-1;box.focus({preventScroll:true});}box.scrollIntoView({block:'center'});
}
function drawCrop() {
  const canvas=document.querySelector('#photo-preview');if(!bitmap||!canvas)return;
  const edge=Math.min(bitmap.width,bitmap.height)/crop.zoom;
  const x=(bitmap.width-edge)/2+(bitmap.width-edge)/2*crop.x/100;
  const y=(bitmap.height-edge)/2+(bitmap.height-edge)/2*crop.y/100;
  canvas.getContext('2d').drawImage(bitmap,x,y,edge,edge,0,0,500,500);
}
async function upload(file) {
  if(!file||file.size>6*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Imagen inválida. JPEG, PNG o WebP de hasta 6 MB.');
  return (await request('/api/admin/upload',{method:'POST',body:file,raw:true,headers:{'Content-Type':file.type}})).image;
}
export function installServerUI(callback) {
  rerender=callback;
  document.querySelector('#app').addEventListener('change',async event=>{
    if(event.target.id!=='owner-file')return;
    try {const file=event.target.files[0];if(!file||file.size>6*1024*1024)throw new Error('Imagen de hasta 6 MB.');bitmap?.close();bitmap=await createImageBitmap(file);crop={zoom:1,x:0,y:0};document.querySelector('#photo-preview').hidden=false;document.querySelector('#crop-controls').hidden=false;drawCrop();}catch(err){message(err.message);}
  });
  document.querySelector('#app').addEventListener('input',event=>{
    if(event.target.name==='name'&&event.target.closest('[data-form="account"]')){
      event.target.closest('form').querySelector('[type="submit"]').hidden=event.target.value.trim()===state.user.name;
    }
    if(['zoom','panX','panY'].includes(event.target.name)){crop[{zoom:'zoom',panX:'x',panY:'y'}[event.target.name]]=Number(event.target.value);drawCrop();}
  });
  document.querySelector('#app').addEventListener('submit',async event=>{
    const form=event.target;if(!form.dataset.form)return;event.preventDefault();
    if(form.getAttribute('aria-busy')==='true')return;
    document.querySelector('#server-feedback')?.remove();
    const kind=form.dataset.form,en=document.documentElement.lang==='en';
    const submit=form.querySelector('button[type="submit"],button:not([type])'),submitLabel=submit?.textContent;
    form.setAttribute('aria-busy','true');
    if(submit){submit.disabled=true;submit.textContent=kind==='register'?(en?'Creating account…':'Creando cuenta…'):['login','owner-login'].includes(kind)?(en?'Signing in…':'Iniciando sesión…'):(en?'Please wait…':'Espera un momento…');}
    for(const input of form.querySelectorAll('.password-control input')){
      input.type='password';const toggle=input.parentElement.querySelector('[data-password-toggle]');toggle.setAttribute('aria-pressed','false');toggle.textContent=en?'Show':'Mostrar';toggle.setAttribute('aria-label',en?'Show password':'Mostrar contraseña');
    }
    const fd=new FormData(form),value=name=>String(fd.get(name)??''),nullable=name=>value(name)===''?null:Number(value(name));
    try {
      if(kind==='verify-email'){
        await request('/api/auth/verify-email',{method:'POST',body:{token:verificationToken}});
        verificationToken=null;customerAuthMode=state.user?'register':'login';history.replaceState(null,'',state.user?'#profile':'#login');await bootstrap();rerender();
        message(en?'Email verified. You can now return to your account.':'Correo verificado. Ya puedes volver a tu cuenta.');return;
      }
      if(kind==='forgot-password'){
        const result=await request('/api/auth/forgot-password',{method:'POST',body:{email:value('email')}});
        message(en?(result.mode==='email'?'If a customer account exists with that email, you will receive a recovery link. Check your spam folder. The link expires in 30 minutes.':'Email recovery is not enabled yet. This request does not send an email.'):result.message);return;
      }
      if(kind==='reset-password'){
        if(value('password')!==value('confirmPassword'))throw new Error(en?'Passwords do not match. Enter the same password in both fields.':'Las contraseñas no coinciden. Repite la misma contraseña en ambos campos.');
        await request('/api/auth/reset-password',{method:'POST',body:{token:resetToken,password:value('password')}});
        resetToken=null;customerAuthMode='login';history.replaceState(null,'','#login');state.user=null;state.csrf=null;await refresh();rerender();
        message(en?'Password updated. Sign in with your new password.':'Contraseña actualizada. Inicia sesión con tu nueva contraseña.');return;
      }
      if(['login','owner-login','register','setup'].includes(kind)){
        const result=await request('/api/auth/'+kind,{method:'POST',body:{email:value('email'),name:value('name'),password:value('password'),...(kind==='register'?{referralCode:value('referralCode')}: {})},headers:kind==='setup'?{'X-Setup-Token':setupToken}:{}});
        state.user=result.user;state.csrf=result.csrf;setupToken=null;
        if(kind==='register'){referralCode='';try{sessionStorage.removeItem('reca-referral');}catch{}}
        if(kind==='owner-login'||kind==='setup')history.replaceState(null,'','#admin');
      }else if(kind==='account'){state.user=(await request('/api/me',{method:'PATCH',body:{name:value('name')}})).user;}
      else if(kind==='settings'){
        const weekly=Array.from({length:7},(_,day)=>({day,closed:fd.has('closed'+day),intervals:value('hours'+day).trim()?value('hours'+day).split(',').map(x=>x.trim().split('-').map(y=>y.trim())):[]}));
        await request('/api/admin/settings',{method:'PATCH',body:{city:value('city'),timezone:value('timezone'),cancellationNoticeMinutes:nullable('cancellationNoticeMinutes'),bookingNoticeMinutes:nullable('bookingNoticeMinutes'),bookingSpacingMinutes:nullable('bookingSpacingMinutes'),weekly}});
      }else if(kind==='service'){
        await request('/api/admin/services/'+form.dataset.id,{method:'PUT',body:{name:{es:value('nameEs'),en:value('nameEn')},description:{es:value('descEs'),en:value('descEn')},priceCents:nullable('price')===null?null:Math.round(nullable('price')*100),active:fd.has('active')}});
      }else if(kind==='owner-photo'){
        if(!bitmap||document.querySelector('#photo-preview').hidden)throw new Error('Selecciona una imagen para previsualizar.');
        const blob=await new Promise(resolve=>document.querySelector('#photo-preview').toBlob(resolve,'image/webp',.9));
        const image=await upload(blob);await request('/api/admin/settings',{method:'PATCH',body:{ownerPhoto:image}});
      }else if(kind==='gallery'){
        const image=await upload(fd.get('file'));
        await request('/api/admin/gallery',{method:'POST',body:{image,simple:true,ownPhoto:fd.has('permission'),name:value('name'),audience:value('audience'),style:value('style'),permissionConfirmed:fd.has('permission')}});
      }else if(kind==='gallery-state')await request('/api/admin/gallery/'+form.dataset.id,{method:'PATCH',body:{active:fd.has('active'),position:Number(value('position'))}});
      await refresh();
      if(['login','register'].includes(kind)&&state.user?.role==='customer')history.replaceState(null,'','#home');
      rerender();
      if(kind==='register')message(en?'Your account is ready. Welcome to RECA Barbería.':'Tu cuenta está lista. Bienvenido a RECA Barbería.');
      else if(kind==='login')message(en?'Welcome back.':'Bienvenido de nuevo.');
    }catch(err){
      if(['login','register'].includes(kind)&&state.user&&err.kind){state.connected=false;state.bootstrapError=err;rerender();}
      message(customerError(err,document.documentElement.lang,kind),true);
    }finally{form.removeAttribute('aria-busy');if(submit){submit.disabled=false;submit.textContent=submitLabel;}}
  });
  document.querySelector('#app').addEventListener('click',async event=>{
    const toggle=event.target.closest('[data-password-toggle]');
    if(toggle){
      if(toggle.closest('form')?.getAttribute('aria-busy')==='true')return;
      const input=document.getElementById(toggle.getAttribute('aria-controls'));if(!input)return;
      const visible=input.type==='password',en=document.documentElement.lang==='en';
      input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.textContent=visible?(en?'Hide':'Ocultar'):(en?'Show':'Mostrar');toggle.setAttribute('aria-label',visible?(en?'Hide password':'Ocultar contraseña'):(en?'Show password':'Mostrar contraseña'));return;
    }
    const action=event.target.closest('[data-server-action]')?.dataset.serverAction;if(!action)return;
    if(action==='clear-referral'){
      referralCode='';try{sessionStorage.removeItem('reca-referral');}catch{}
      const input=document.querySelector('[name=referralCode]');if(input)input.value='';
      document.querySelector('#referral-note')?.remove();return;
    }
    if(['show-register','show-login','show-forgot'].includes(action)){
      customerAuthMode=({ 'show-register':'register','show-login':'login','show-forgot':'forgot' })[action];
      if(action!=='show-forgot'){
        const target=customerAuthMode==='register'?'#register':'#login';
        if(location.hash!==target)history.pushState(null,'',target);
      }
      rerender();document.querySelector('#main')?.focus({preventScroll:true});return;
    }
    try{
      if(action==='copy-referral'){
        const url=state.referrals?.url;if(!url)return;
        if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);message(document.documentElement.lang==='en'?'Link copied.':'Enlace copiado.');}
        else{document.querySelector('[name=referralLink]')?.select();message(document.documentElement.lang==='en'?'Copy the selected link.':'Copia el enlace seleccionado.');}return;
      }
      if(action==='request-verification'){
        const button=event.target.closest('[data-server-action]');if(button.disabled)return;button.disabled=true;
        try{const result=await request('/api/account/verification',{method:'POST',body:{}});message(document.documentElement.lang==='en'?'Check your inbox and spam folder. The verification link expires in 30 minutes.':result.message);}finally{button.disabled=false;}return;
      }
      if(action==='refresh-referrals'){await refresh();rerender();return;}
      if(action==='logout'){await request('/api/logout',{method:'POST',body:{}});state.user=null;state.csrf=null;state.admin=null;state.automation=null;customerAuthMode='register';}
      if(action==='delete-account'){if(!confirm(document.documentElement.lang==='en'?'Delete your account?':'¿Eliminar tu cuenta?'))return;await request('/api/me',{method:'DELETE'});state.user=null;state.csrf=null;customerAuthMode='register';}
      if(action==='remove-photo')await request('/api/admin/settings',{method:'PATCH',body:{ownerPhoto:null}});
      await refresh();rerender();message(document.documentElement.lang==='en'?'Done.':'Operación completada.');
    }catch(err){message(customerError(err,document.documentElement.lang),true);}
  });
  let syncingContent=false;
  async function syncClientContent(){
    // Comanda forms are edited independently; never overwrite the owner's drafts.
    if(syncingContent||!state.connected||state.loading||state.user?.role==='owner'||document.hidden)return;
    if(['#admin','#review','#booking','#appointments'].includes(location.hash)||document.querySelector('dialog[open],form[aria-busy="true"]'))return;
    if(document.activeElement?.matches('input,select,textarea')||document.querySelector('form[data-form="register"],form[data-form="login"],form[data-form="forgot-password"],form[data-form="reset-password"],form[data-form="verify-email"]'))return;
    const accountName=document.querySelector('[data-form="account"] [name="name"]');
    if(accountName&&accountName.value.trim()!==state.user?.name)return;
    syncingContent=true;const user=state.user;
    try{
      const data=await request(user?'/api/public':'/api/site');
      if(state.user!==user||state.loading)return;
      // Recheck after the request: the customer may have started typing meanwhile.
      if(document.activeElement?.matches('input,select,textarea')||document.querySelector('form[aria-busy="true"],dialog[open],form[data-form="register"],form[data-form="login"],form[data-form="forgot-password"],form[data-form="reset-password"],form[data-form="verify-email"]')||['#booking','#appointments'].includes(location.hash))return;
      const currentName=document.querySelector('[data-form="account"] [name="name"]');
      if(currentName&&currentName.value.trim()!==state.user?.name)return;
      const old=JSON.stringify(state.public);
      if(user)applyPublic(data);else applySite(data);
      if(JSON.stringify(state.public)===old)return;
      const y=scrollY,videos=[...document.querySelectorAll('video')].map(video=>({video,source:video.querySelector('source')?.getAttribute('src'),playing:!video.paused}));
      rerender();
      // Keep the existing player when its source did not change.
      for(const previous of videos){
        const replacement=[...document.querySelectorAll('video')].find(video=>video.querySelector('source')?.getAttribute('src')===previous.source);
        if(replacement){replacement.replaceWith(previous.video);if(previous.playing)previous.video.play().catch(()=>{});}else previous.video.pause();
      }
      window.scrollTo(0,y);
    }catch{/* Keep the last confirmed content; never retry writes or fake a logout. */}
    finally{syncingContent=false;}
  }
  setInterval(syncClientContent,5000);
  window.addEventListener('focus',()=>{void syncClientContent();});
  window.addEventListener('hashchange',()=>{setTimeout(()=>{void syncClientContent();},250);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncClientContent();});
}
