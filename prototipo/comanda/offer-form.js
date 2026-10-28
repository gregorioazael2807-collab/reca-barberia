// The editor shows one language at a time, never discarding the other translation.
export const offerText=(offer,key,language)=>offer?.[key]?.[language]??offer?.[key]?.es??offer?.[key]?.en??'';
export function offerFromForm(formData,previous={},language='es'){
  const value=name=>String(formData.get(name)||'');
  const result={...previous};
  for(const key of ['title','description','conditions']){
    const text=value(key);
    result[key]={es:previous[key]?.es??text,en:previous[key]?.en??text,[language]:text};
  }
  return {...result,percent:Number(value('percent')),startsLocal:value('startsLocal'),endsLocal:value('endsLocal'),serviceIds:['men','kids'].filter(id=>formData.has(id)),active:formData.has('active')};
}
