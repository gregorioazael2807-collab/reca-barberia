const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initialized=new WeakSet();
const rowHeight=52;
export function syncBookingTimeWheel(){
 const wheel=document.querySelector('[data-time-wheel]');
 if(!wheel||initialized.has(wheel))return;
 initialized.add(wheel);
 const options=[...wheel.querySelectorAll('[data-wheel-start]')],button=wheel.closest('.booking-times').querySelector('[data-booking-action="pick"]');
 const disabled=wheel.getAttribute('aria-disabled')==='true';
 function select(index,scroll=false){
  index=Math.max(0,Math.min(options.length-1,index));
  options.forEach((option,i)=>{option.setAttribute('aria-selected',String(i===index));});
  wheel.setAttribute('aria-activedescendant',options[index].id);
  button.dataset.start=options[index].dataset.wheelStart;
  button.querySelector('[data-wheel-label]').textContent=options[index].textContent;
  if(scroll)wheel.scrollTop=index*rowHeight;
 }
 select(Math.max(0,options.findIndex(option=>option.getAttribute('aria-selected')==='true')),true);
 if(disabled)return;
 wheel.addEventListener('scroll',()=>select(Math.round(wheel.scrollTop/rowHeight)),{passive:true});
 wheel.addEventListener('click',event=>{
  const option=event.target.closest('[data-wheel-start]');
  if(option){select(options.indexOf(option),true);wheel.focus({preventScroll:true});}
 });
 wheel.addEventListener('keydown',event=>{
  const index=Math.round(wheel.scrollTop/rowHeight);
  const next={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:options.length-1,PageDown:index+5,PageUp:index-5}[event.key];
  if(next!==undefined){event.preventDefault();select(next,true);}
 });
}
export function bookingTimesHTML(slots,{timezone='America/New_York',language='es',selected=null,disabled=false}={}){
 const en=language==='en',locale=en?'en-US':'es-US';
 const clock=new Intl.DateTimeFormat(locale,{timeZone:timezone,hour:'numeric',minute:'2-digit'});
 const index=Math.max(0,slots.findIndex(slot=>slot.start===selected));
 // The containing render is synchronous. Initialize only after its HTML is attached.
 if(slots.length&&typeof document!=='undefined')queueMicrotask(syncBookingTimeWheel);
 return `<section class="booking-times" aria-labelledby="booking-times-title"><div class="booking-times-heading"><span class="eyebrow">${en?'YOUR NEXT VISIT':'TU PRÓXIMA VISITA'}</span><h2 id="booking-times-title">${en?'Choose your time':'Elige tu hora'}</h2><p id="booking-wheel-hint">${en?'Slide up or down to choose an available time, then press Select time. Use arrow keys with a keyboard.':'Desliza hacia arriba o abajo para elegir una hora disponible y pulsa Seleccionar hora. Con teclado, usa las flechas.'}</p><small>${en?'Shop time':'Hora de la barbería'} · ${escape(timezone)}</small></div>${slots.length?`<div class="booking-wheel-frame"><div class="booking-wheel" data-time-wheel role="listbox" aria-label="${en?'Available times':'Horas disponibles'}" aria-describedby="booking-wheel-hint" aria-disabled="${disabled}" aria-activedescendant="booking-wheel-${index}" tabindex="${disabled?-1:0}">${slots.map((slot,i)=>`<div class="booking-wheel-option" id="booking-wheel-${i}" role="option" aria-selected="${i===index}" data-wheel-start="${escape(slot.start)}">${escape(clock.format(new Date(slot.start)))}</div>`).join('')}</div><div class="booking-wheel-center" aria-hidden="true"></div></div><button type="button" class="button full booking-wheel-pick" data-booking-action="pick" data-start="${escape(slots[index].start)}" ${disabled?'disabled':''}>${en?'Select time':'Seleccionar hora'} · <span data-wheel-label>${escape(clock.format(new Date(slots[index].start)))}</span></button>`:`<p role="status">${en?'No times available on this date. Try another day.':'No hay turnos disponibles para esta fecha. Prueba otro día.'}</p>`}</section>`;
}
