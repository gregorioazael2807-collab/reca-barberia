import {error} from './security.js';
import {offerData} from './content.js';
export async function offerServices(db,ids){
 const rows=(await db.query('SELECT id,data FROM services WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows;
 if(rows.length!==ids.length||rows.some(r=>!r.data.active||!Number.isInteger(r.data.priceCents)||r.data.priceCents<0))throw error(409,'Los servicios deben estar activos y tener un precio configurado.');
 return rows.map(r=>({id:r.id,name:r.data.name,priceCents:r.data.priceCents}));
}
export async function prepareGochoOffer(db,intent,range,now){
 const data=offerData({active:true,serviceIds:intent.offer.serviceIds,percent:intent.offer.percent,title:{es:`${intent.offer.percent}% de descuento`,en:`${intent.offer.percent}% discount`},description:{es:'Descuento en los servicios seleccionados durante la vigencia indicada.',en:'Discount on selected services during the stated validity period.'},conditions:{es:'No acumulable con otras ofertas ni descuentos por recomendación. No cambia el precio de citas ya confirmadas. Pago en el local.',en:'Cannot be combined with other offers or referral discounts. Does not change the price of already confirmed appointments. Payment on site.'}});
 const from=Math.max(range.from,now),until=range.until;
 if(until<=from||from>now+90*86400000)throw error(400,'La oferta debe tener vigencia futura y comenzar dentro de 90 días.');
 const services=await offerServices(db,data.serviceIds);
 const local=ms=>new Intl.DateTimeFormat('es-US',{timeZone:range.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(ms));
 return {...range,action:'create_offer',from,until,canConfirm:true,offer:{...data,active:true},services,text:`Propuesta: ${data.percent}% de descuento para ${services.map(s=>s.name.es).join(' y ')}. Desde ${local(from)} hasta ${local(until)} (${range.timezone}). No modifica citas confirmadas y no se acumula con otros descuentos. Revisa y confirma para publicar.`};
}
