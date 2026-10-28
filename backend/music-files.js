import {error} from './security.js';
import {inspectVideo} from './video-files.js';
export function inspectMusic(buffer,type){
 if(!Buffer.isBuffer(buffer)||buffer.length<32||buffer.length>20*1024*1024)throw error(400,'Selecciona un MP3 o M4A de hasta 20 MB.');
 if(type==='m4a'){const value=inspectVideo(buffer,{audioOnly:true});return {durationSeconds:value.durationSeconds};}
 if(type!=='mp3')throw error(400,'Formato de audio inválido.');
 try{
  let offset=0,end=buffer.length,frames=0,seconds=0;
  if(buffer.toString('ascii',0,3)==='ID3'){
   if(![2,3,4].includes(buffer[3])||[6,7,8,9].some(i=>buffer[i]&128))throw new Error();
   const size=(buffer[6]<<21)|(buffer[7]<<14)|(buffer[8]<<7)|buffer[9];offset=10+size+(buffer[3]===4&&(buffer[5]&16)?10:0);if(offset>=end)throw new Error();
  }
  if(end>=128&&buffer.toString('ascii',end-128,end-125)==='TAG')end-=128;
  while(offset<end){
   if(end-offset<4||buffer[offset]!==255||(buffer[offset+1]&224)!==224){if(end-offset<=4096&&buffer.subarray(offset,end).every(byte=>byte===0))break;throw new Error();}
   const version=(buffer[offset+1]>>3)&3,layer=(buffer[offset+1]>>1)&3,index=buffer[offset+2]>>4,rate=(buffer[offset+2]>>2)&3,padding=(buffer[offset+2]>>1)&1;
   if(version===1||layer!==1||index===0||index===15||rate===3)throw new Error();
   const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index]*1000;
   const sampleRate=[44100,48000,32000][rate]/(version===3?1:version===2?2:4),size=Math.floor((version===3?144:72)*bitrate/sampleRate)+padding;
   if(size<4||offset+size>end||++frames>50000)throw new Error();
   seconds+=(version===3?1152:576)/sampleRate;if(seconds>600)throw new Error();offset+=size;
  }
  if(frames<2||seconds<=0)throw new Error();return {durationSeconds:Math.round(seconds*100)/100};
 }catch{throw error(400,'MP3 inválido o incompleto. Máximo 10 minutos; convierte otros formatos antes de subirlos.');}
}
