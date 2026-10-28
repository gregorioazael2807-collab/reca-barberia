// One preference for every entry point and tab on this browser/origin.
export const languageKey='barberia-language';
export const normalizeLanguage=value=>value==='en'?'en':'es';
export function createLanguagePreference({storage,events}={}){
 let value='es';
 try{value=normalizeLanguage(storage?.getItem(languageKey));}catch{}
 const listeners=new Set();
 function publish(next){
  next=normalizeLanguage(next);if(next===value)return;
  value=next;for(const listener of listeners)listener(value);
 }
 events?.addEventListener('storage',event=>{
  if(event.key===languageKey||event.key===null)publish(event.newValue);
 });
 return {
  get:()=>value,
  set(next){next=normalizeLanguage(next);try{storage?.setItem(languageKey,next);}catch{}publish(next);},
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
 };
}
let storage;try{storage=globalThis.window?.localStorage;}catch{}
export const languagePreference=createLanguagePreference({storage,events:globalThis.window});
