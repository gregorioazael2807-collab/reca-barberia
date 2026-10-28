import {error} from './security.js';
// Bounded ISO-BMFF inspection; never execute uploaded files or follow external references.
export function inspectVideo(buffer,{audioOnly=false}={}){
  if(!Buffer.isBuffer(buffer)||buffer.length<32||buffer.length>(audioOnly?20:30)*1024*1024)throw error(400,audioOnly?'Selecciona un M4A de hasta 20 MB.':'Selecciona un MP4 de hasta 30 MB.');
  let count=0;
  function boxes(from,to){
    const result=[];
    for(let at=from;at<to;){
      if(++count>10000||to-at<8)throw new Error();
      let size=buffer.readUInt32BE(at),header=8;
      if(size===1){if(to-at<16)throw new Error();size=Number(buffer.readBigUInt64BE(at+8));header=16;}
      if(size===0)size=to-at;
      if(!Number.isSafeInteger(size)||size<header||at+size>to)throw new Error();
      result.push({type:buffer.toString('ascii',at+4,at+8),from:at+header,to:at+size});at+=size;
    }
    return result;
  }
  const children=box=>boxes(box.from,box.to);
  const required=(list,type)=>{const matches=list.filter(box=>box.type===type);if(matches.length!==1)throw new Error();return matches[0];};
  try{
    const root=boxes(0,buffer.length),ftyp=required(root,'ftyp'),moov=required(root,'moov');
    if(ftyp.to-ftyp.from<8||!root.some(box=>box.type==='mdat'&&box.to>box.from))throw new Error();
    const movie=children(moov),mvhd=required(movie,'mvhd'),version=buffer[mvhd.from];
    if(![0,1].includes(version)||mvhd.to-mvhd.from<(version?32:20))throw new Error();
    const scale=buffer.readUInt32BE(mvhd.from+(version?20:12));
    const ticks=version?Number(buffer.readBigUInt64BE(mvhd.from+24)):buffer.readUInt32BE(mvhd.from+16);
    const duration=ticks/scale;if(!Number.isFinite(duration)||duration<=0||duration>(audioOnly?600:60))throw new Error();
    let videos=0,audio=false,audioTracks=0;
    for(const track of movie.filter(box=>box.type==='trak')){
      const mdia=required(children(track),'mdia'),media=children(mdia),hdlr=required(media,'hdlr');
      if(hdlr.to-hdlr.from<12)throw new Error();const kind=buffer.toString('ascii',hdlr.from+8,hdlr.from+12);
      if(!['vide','soun'].includes(kind))throw new Error();
      const minf=children(required(media,'minf')),dinf=children(required(minf,'dinf')),dref=required(dinf,'dref');
      if(dref.to-dref.from<8)throw new Error();
      const refs=boxes(dref.from+8,dref.to);
      if(!refs.length||refs.some(ref=>ref.type!=='url '||ref.to-ref.from!==4||buffer.readUInt32BE(ref.from)!==1))throw new Error();
      const stsd=required(children(required(minf,'stbl')),'stsd');if(stsd.to-stsd.from<8)throw new Error();
      const entries=boxes(stsd.from+8,stsd.to);if(entries.length!==1||buffer.readUInt32BE(stsd.from+4)!==1)throw new Error();
      const entry=entries[0];
      if(kind==='vide'){
        if(audioOnly)throw new Error();
        if(!['avc1','avc3'].includes(entry.type)||entry.to-entry.from<78||!boxes(entry.from+78,entry.to).some(box=>box.type==='avcC'&&box.to-box.from>=7))throw new Error();
        const width=buffer.readUInt16BE(entry.from+24),height=buffer.readUInt16BE(entry.from+26);if(!width||!height||width>3840||height>3840)throw new Error();videos++;
      }else{if(entry.type!=='mp4a')throw new Error();audio=true;audioTracks++;}
    }
    if(audioOnly?(videos!==0||audioTracks!==1):videos!==1)throw new Error();
    return {durationSeconds:Math.round(duration*100)/100,hasAudio:audio};
  }catch{if(audioOnly)throw error(400,'Audio inválido. Usa M4A/AAC sin referencias externas y duración máxima de 10 minutos.');throw error(400,'Video inválido. Usa MP4 con video H.264, audio MP4/AAC, sin referencias externas y duración máxima de 60 segundos.');}
}
