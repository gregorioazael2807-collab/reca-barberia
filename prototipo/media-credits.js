const E=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const link=(url,label)=>typeof url==='string'&&/^https:\/\//.test(url)?`<a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(label)}</a>`:E(label);
export function mediaCreditsHTML(credit,language=globalThis.document?.documentElement.lang||'es'){
 const en=language==='en';
 if(!credit)return '';
 const parts=[E(credit.sourceTitle||credit.title),E(credit.author),link(credit.licenseUrl,credit.license),credit.sourceUrl?link(credit.sourceUrl,en?'Source':'Fuente'):'',E(credit.modification)].filter(Boolean);
 return `<small class="media-credit">${(credit.external||credit.sourceUrl)?(en?'External content; not produced by RECA. ':'Contenido externo; no producido por RECA. '):''}${parts.join(' · ')}</small>`;
}
