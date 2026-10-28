// Self-contained: n8n embeds this reviewed template without calling an AI provider.
// Drafting does not enable delivery or authorize WhatsApp.
export function renderMessage(payload) {
  const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  const name=clean(payload.customerName)||'cliente';
  const date=new Intl.DateTimeFormat('es-US',{timeZone:payload.timezone,dateStyle:'full'}).format(new Date(payload.start));
  const time=new Intl.DateTimeFormat('es-US',{timeZone:payload.timezone,timeStyle:'short'}).format(new Date(payload.start));
  const price=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(payload.priceCents/100);
  const service=clean(payload.serviceName);
  const hours=payload.cancellationNoticeMinutes/60;
  if(typeof payload.appUrl!=='string'||!/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?\/?$/i.test(payload.appUrl))throw new Error('Enlace de aplicación inválido.');
  const appUrl=payload.appUrl.replace(/\/$/,'');
  const titles={confirmed:'Tu cita está confirmada',cancelled:'Cancelación de tu cita',rescheduled:'Nuevo horario de tu cita',reminder:'Recordatorio de tu cita'};
  if(!titles[payload.event])throw new Error('Evento de mensaje inválido.');
  const intros={confirmed:'Tu cita en RECA Barbería está confirmada. Será un gusto recibirte.',rescheduled:'Actualizamos el horario de tu cita en RECA Barbería. Estos son los detalles vigentes:',cancelled:'Tu cita en RECA Barbería está cancelada. El horario se ha liberado.',reminder:'Te recordamos tu próxima cita en RECA Barbería. Te esperamos en el horario indicado.'};
  const details=`Servicio: ${service}\nFecha: ${date}\nHora: ${time} (hora de la barbería · ${clean(payload.timezone)})`;
  const policy=payload.event==='reminder'
    ? `El plazo para cancelar o cambiar era de ${hours} horas de anticipación y ya terminó.`
    : `Puedes cancelar o cambiar tu cita con al menos ${hours} horas de anticipación, según las condiciones de tu reserva.`;
  const action=payload.event==='cancelled'
    ? `Cuando quieras volver, puedes reservar otra cita aquí:\n${appUrl}/#booking`
    : `Consulta o gestiona tu cita desde tu cuenta:\n${appUrl}/#appointments`;
  const bookingInfo=payload.event==='cancelled'?'':`\nTotal de la reserva: ${price} USD\nPago en el local${payload.city?`\nUbicación: ${clean(payload.city)}`:''}\n\n${policy}`;
  const local=appUrl.startsWith('http://')?'\n\nPrueba local: el enlace solo abre en la misma red Wi-Fi que la computadora de la barbería.':'';
  const body=`Hola, ${name}:\n\n${intros[payload.event]}\n\n${details}${bookingInfo}\n\n${action}\n\nGracias por elegirnos.\nRECA Barbería\n\nEste correo informa sobre tu cita; no es publicidad.${local}`;
  // Legacy callers may still read whatsappText; the email-only n8n flow never saves it.
  return {subject:`RECA Barbería · ${titles[payload.event]}`,emailText:body,whatsappText:body};
}
