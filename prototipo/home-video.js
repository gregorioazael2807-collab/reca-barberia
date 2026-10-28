import {state,escapeHTML as E} from './server-ui.js';
let host=null,video=null,source=null,startPrompt=null,active=false,attempted=false,wasPlaying=false;
const english=()=>document.documentElement.lang==='en';
function remove(){active=false;video?.pause();host?.remove();startPrompt?.remove();host=null;video=null;source=null;startPrompt=null;attempted=false;wasPlaying=false;}
async function play(){
 const current=video;
 try{await current.play();if(current===video&&active)startPrompt.hidden=true;}
 catch(error){if(current!==video||!active||error.name==='AbortError')return;startPrompt.hidden=false;startPrompt.querySelector('small').textContent=english()?'Your browser requires a tap to enable sound.':'Tu navegador necesita un toque para activar el sonido.';}
}
// Keep the same video loaded while #app is redrawn: its sound carries into booking.
export function parkHomeVideo(){if(host&&document.querySelector('#app')?.contains(host)){wasPlaying=!video.paused;document.body.append(host);}}
export function syncHomeVideo(){
 const settings=state.public?.settings;
 if(!state.user||!settings||settings.hiddenWelcomeVideos?.home||location.pathname.startsWith('/comanda/')){remove();return;}
 const url=settings.welcomeVideos?.home||'assets/videos/login-musica.mp4';
 const route=location.hash||'#home';
 const enabled=['#home','#booking','#appointments'].includes(route);
 if(!host&&!enabled)return;
 if(source&&source!==url)remove();
 if(!host){
  host=document.createElement('div');host.className='persistent-home-video';
  host.innerHTML=`<video class="entry-video home-welcome-video" playsinline loop preload="metadata" aria-label="${english()?'Welcome video':'Video de Inicio'}"><source src="${E(url)}" type="video/mp4"></video>`;
  video=host.querySelector('video');source=url;video.volume=0.35;
  startPrompt=document.createElement('aside');startPrompt.className='reca-home-sound-start';startPrompt.hidden=true;
  startPrompt.innerHTML='<button class="button secondary" type="button" data-home-sound-start></button><small role="status"></small>';
  document.body.append(host,startPrompt);
  startPrompt.querySelector('button').addEventListener('click',()=>{attempted=true;void play();});
  video.addEventListener('play',()=>{if(startPrompt&&active)startPrompt.hidden=true;});
 }
 active=enabled;
 // A globally selected audio track must never mix with the welcome video's sound.
 video.muted=!!settings.backgroundMusic&&settings.musicScope!=='gallery';
 startPrompt.querySelector('button').textContent=english()?'Enable welcome sound':'Activar sonido de Inicio';
 const slot=document.querySelector('[data-home-video-slot]');
 wasPlaying=wasPlaying||!video.paused;
 host.hidden=!['#home','#booking'].includes(route);
 if(slot)slot.append(host);else if(host.parentElement!==document.body)document.body.append(host);
 if(!active){video.pause();startPrompt.hidden=true;attempted=false;wasPlaying=false;return;}
 if(wasPlaying||!attempted){attempted=true;wasPlaying=false;void play();}
}
