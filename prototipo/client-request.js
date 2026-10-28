// No automatic retries: a timed-out mutation may already have been saved.
export async function fetchJSON(url,{timeoutMs,fetchImpl=globalThis.fetch,...options}={}) {
  const controller=new AbortController();
  const method=options.method||'GET';
  const timeout=setTimeout(()=>controller.abort(),timeoutMs??(method==='GET'?10000:45000));
  try {
    let response;
    try{response=await fetchImpl(url,{...options,signal:controller.signal});}
    catch{throw Object.assign(new Error('No se pudo conectar con la barbería.'),{kind:controller.signal.aborted?'timeout':'network',method});}
    let data;
    try{data=await response.json();}
    catch{throw Object.assign(new Error('No se pudo leer la respuesta de la barbería.'),{kind:controller.signal.aborted?'timeout':'response',method});}
    if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(new Error('La respuesta de la barbería no es válida.'),{kind:'response',method});
    if(!response.ok)throw Object.assign(new Error(typeof data.error==='string'?data.error:'No se pudo completar la solicitud.'),{status:response.status,method});
    return data;
  }finally{clearTimeout(timeout);}
}
export function customerError(err,language='es',kind='') {
  const en=language==='en';
  if(['network','timeout','response'].includes(err.kind)) {
    const mutation=err.method&&err.method!=='GET';
    if(mutation)return en?'We could not confirm the result. Check your connection and whether the change was saved before trying again.':'No pudimos confirmar el resultado. Revisa tu conexión y si el cambio se guardó antes de intentarlo otra vez.';
    return en?'We could not connect to the barbershop. Check your Wi-Fi or internet connection and try again.':'No pudimos conectar con la barbería. Revisa tu Wi-Fi o conexión a internet y vuelve a intentarlo.';
  }
  if(err.status===429)return en?'Too many attempts. Wait five minutes before trying again.':'Has realizado varios intentos. Espera cinco minutos antes de volver a probar.';
  if(err.status===401&&['login','owner-login'].includes(kind))return en?'We could not sign you in. Check your email and password. If you forgot your password, use password recovery.':'No pudimos iniciar sesión. Revisa tu correo y contraseña. Si no recuerdas tu contraseña, utiliza la opción de recuperación.';
  if(err.status===409&&kind==='register')return en?'We could not create this account. If you already registered, sign in or recover your password instead of creating another profile.':'No pudimos crear esta cuenta. Si ya te registraste, inicia sesión o recupera tu contraseña en lugar de crear otro perfil.';
  if(err.status===400&&kind==='register'&&err.message.includes('reservada'))return en?'This email is reserved for the owner. Use a different email for a customer account.':'Este correo está reservado para el dueño. Para tu cuenta de cliente utiliza otro correo.';
  const translations={
    'Inicia sesión.':'Please sign in.',
    'Ese horario ya no está disponible. Elige otro.':'That time is no longer available. Choose another.',
    'La retención caducó. Selecciona otro horario.':'Your hold expired. Choose another time.',
    'Cita no encontrada.':'Appointment not found.',
    'Esta cita no se puede cancelar.':'This appointment cannot be cancelled.',
    'Solo se pueden cambiar citas confirmadas.':'Only confirmed appointments can be rescheduled.',
    'Debes resolver tus próximas citas antes de eliminar la cuenta.':'Resolve your upcoming appointments before deleting your account.',
    'Selecciona al menos un canal de avisos.':'Select at least one notification channel.',
    'La hora final debe ser igual o posterior a la inicial.':'The end time must be at or after the start time.',
    'Usa un teléfono internacional válido, por ejemplo +18135551234.':'Use a valid international phone number, for example +18135551234.',
    'Puedes mantener como máximo cinco preferencias de espera.':'You can save at most five waiting-list preferences.',
    'Fecha inválida.':'Invalid date.',
    'Servicio inválido.':'Invalid service.',
    'No se acumulan ofertas y descuentos por recomendación.':'Offers and referral discounts cannot be combined.'
  };
  const original=err.originalMessage||err.message;
  if(en&&translations[original])return translations[original];
  if(en&&err.status)return ({400:'Check the information entered and try again.',401:'Please sign in again.',403:'This operation is not allowed. Refresh the page and check your session.',404:'The requested item is no longer available.',409:'This change cannot be completed. Refresh the information and check the booking rules before trying again.'})[err.status]||'We could not complete the operation. Please try again later.';
  return original|| (en?'We could not complete the operation. Please try again.':'No pudimos completar la operación. Vuelve a intentarlo.');
}
