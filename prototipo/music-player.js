import {state,escapeHTML as E} from './server-ui.js';
import {mediaCreditsHTML} from './media-credits.js';
let root=null,source=null,attempted=null,prompt='';
const musicCopy={
 'Música de RECA':'RECA music', 'Música':'Music', 'Silenciar música':'Mute music', 'Activar música':'Enable music',
 'Tu navegador requiere un toque para activar el sonido.':'Your browser requires a tap to enable sound.',
 'No se pudo reproducir la música. Toca Activar para reintentar.':'Music could not be played. Tap Enable music to try again.',
 'Música silenciada en este dispositivo.':'Music muted on this device.',
 'Toca Activar música para continuar escuchando.':'Tap Enable music to keep listening.',
 'Toca Activar música para escuchar.':'Tap Enable music to listen.'
};
const musicText=text=>document.documentElement.lang==='en'?(musicCopy[text]||text):text;
function translatePlayer(){
 if(!root)return;
 root.setAttribute('aria-label',musicText('Música de RECA'));
 root.querySelector('[data-music-start]').textContent=musicText('Activar música');
 const pause=root.querySelector('[data-music-pause]');if(pause)pause.textContent=musicText('Silenciar música');
 root.querySelector('.music-start-message').textContent=musicText(prompt);
}
const preferenceKey=()=> 'reca-music-muted:'+state.user?.id;
const ownerPreview=()=>location.pathname.startsWith('/comanda/')&&state.user?.role==='owner';
function muted(){if(!ownerPreview())return false;try{return localStorage.getItem(preferenceKey())==='true';}catch{return false;}}
function setMuted(value){if(!ownerPreview())return;try{localStorage.setItem(preferenceKey(),String(value));}catch{}}
function showPause(value){const button=root?.querySelector('[data-music-pause]');if(button)button.hidden=!value;}
function promptStart(message){if(!root)return;prompt=message;root.querySelector('.music-start').hidden=false;translatePlayer();showPause(false);}
async function startMusic(){
 const current=root,expected=source,audio=current?.querySelector('audio');if(!audio)return;
 try{
  await audio.play();if(root!==current||source!==expected||audio.paused)return;
  current.querySelector('.music-start').hidden=true;showPause(true);
 }catch(err){
  if(root!==current||source!==expected||err.name==='AbortError')return;
  promptStart(err.name==='NotAllowedError'?'Tu navegador requiere un toque para activar el sonido.':'No se pudo reproducir la música. Toca Activar para reintentar.');
 }
}
// Outside #app: navigation does not restart the track or override a user's pause.
export function syncMusicPlayer(){
 const isAssistant=location.pathname.startsWith('/comanda/');
 const allowed=!!state.user&&(!isAssistant||state.user.role==='owner');
 const galleryOnly=state.public?.settings.musicScope==='gallery';
 const inGallery=location.hash==='#gallery';
 const track=allowed&&(!galleryOnly||(!isAssistant&&inGallery))?state.public?.settings.backgroundMusic:null;
 if(!track){const audio=root?.querySelector('audio');if(audio){audio.dataset.changing='1';audio.pause();}root?.remove();root=null;source=null;attempted=null;document.body.classList.remove('has-reca-music');return;}
 if(!root){
  root=document.createElement('aside');root.className='reca-music-player';root.setAttribute('aria-label','Música de RECA');
  root.innerHTML=`<details><summary>♫ <span></span></summary><audio ${isAssistant?'controls':''} loop preload="none"></audio><div class="music-credits"></div></details>${isAssistant?'<button class="text-button" type="button" data-music-pause hidden>Silenciar música</button>':''}<div class="music-start" hidden><button class="button secondary" type="button" data-music-start>Activar música</button><small class="music-start-message" role="status"></small></div>`;
  document.body.append(root);const audio=root.querySelector('audio');audio.volume=0.35;
  root.querySelector('[data-music-start]').addEventListener('click',()=>{setMuted(false);if(audio.error)audio.load();void startMusic();});
  root.querySelector('[data-music-pause]')?.addEventListener('click',()=>{setMuted(true);audio.pause();promptStart('Música silenciada en este dispositivo.');});
  audio.addEventListener('loadedmetadata',()=>{audio.dataset.changing='0';});
  audio.addEventListener('play',()=>{if(!root||!audio.isConnected)return;setMuted(false);root.querySelector('.music-start').hidden=true;showPause(true);});
  audio.addEventListener('pause',()=>{if(!root||!audio.isConnected||!audio.paused||audio.dataset.changing==='1')return;if(audio.currentTime>0)setMuted(true);promptStart('Toca Activar música para continuar escuchando.');});
  if(!isAssistant&&state.public.settings.musicAutoplay!==true)promptStart('Toca Activar música para escuchar.');
 }
 const audio=root.querySelector('audio');
 if(source!==track.url){audio.dataset.changing='1';audio.pause();audio.src=track.url;source=track.url;attempted=null;audio.load();}
 translatePlayer();
 root.querySelector('summary span').textContent=musicText('Música')+' · '+track.title;
 root.querySelector('.music-credits').innerHTML=mediaCreditsHTML(track.credit);
 document.body.classList.add('has-reca-music');
 if(!isAssistant&&state.public.settings.musicAutoplay===true&&attempted!==source){
  attempted=source;
  if(muted())promptStart('Música silenciada en este dispositivo.');else void startMusic();
 }
}
export function musicManagement(feedback=''){
 const track=state.public?.settings.backgroundMusic,autoplay=state.public?.settings.musicAutoplay===true;
 return `<h1>Música</h1>${feedback?`<p class="warning" role="status">${E(feedback)}</p>`:''}<p>Sube música con permiso para usarla en el negocio y compartirla en la app. Puedes intentar que suene al entrar; algunos teléfonos requieren tocar Activar música la primera vez. La pista y la zona se administran aquí; el cliente no tiene controles de pausa o volumen en la aplicación. No se sincroniza el instante de reproducción entre dispositivos.</p><form class="card server-form" data-content-form="music-playback"><h2>Dónde debe sonar</h2><label class="field-label">Zona de reproducción<select name="scope"><option value="gallery" ${state.public?.settings.musicScope==='gallery'?'selected':''}>Solo galería de fotos · Inicio y Citas usan el sonido del video de Inicio</option><option value="app" ${state.public?.settings.musicScope!=='gallery'?'selected':''}>Toda la aplicación</option></select></label><label class="check-label"><input type="checkbox" name="autoplay" ${autoplay?'checked':''}>Intentar reproducción automática con sonido</label><small>No puede forzar las restricciones del navegador. Si se bloquea, aparece Activar música. El teléfono y el navegador mantienen sus propios controles de sonido.</small><button class="button full">Guardar reproducción</button></form><form class="card server-form" data-music-form><h2>${track?'Cambiar música':'Subir música'}</h2><label class="field-label">Nombre de la pista<input name="title" maxlength="100" value="${E(track?.title||'')}" placeholder="Música de RECA"></label><label class="field-label">Archivo MP3 o M4A<input type="file" name="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" required></label><small>Hasta 20 MB y 10 minutos. Otros formatos deben convertirse antes.</small><label class="check-label"><input type="checkbox" name="permission" required>Tengo autorización para reproducir esta música en el negocio y compartirla en la aplicación.</label><label class="check-label"><input type="checkbox" name="publish" checked>Usar esta pista en la zona elegida al guardarla (desmarca para guardar solo en la biblioteca).</label><button class="button full">Guardar música</button></form>${track?`<section class="card"><h2>Pista actual</h2><p>${E(track.title)}</p><p>Abre el control ♫ Música para escucharla. Si un video tiene música, pausa uno de los dos para evitar que se mezclen.</p><button class="text-button danger" data-music-remove type="button">Quitar música de la aplicación</button></section>`:''}`;
}
