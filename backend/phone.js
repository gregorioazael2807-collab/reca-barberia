// Local Wi-Fi preview. The QR contains only the public URL, never the owner setup token.
import os from 'node:os';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import QRCode from 'qrcode';
import {root} from './db.js';
const interfaces=os.networkInterfaces();
const names=[...new Set(['en0','en1',...Object.keys(interfaces)])];
const address=names.flatMap(name=>interfaces[name]||[]).find(i=>i.family==='IPv4'&&!i.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
if(!address)throw new Error('No se encontró una IP privada. Conecta la computadora y el teléfono a la misma red Wi-Fi.');
const origin=`http://${address}:8081`;
const evidence=path.join(root,'prototipo/evidencias');await mkdir(evidence,{recursive:true});
await QRCode.toFile(path.join(evidence,'acceso-telefono.png'),origin,{width:600,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}});
console.log(`Teléfono: ${origin}\nQR: prototipo/evidencias/acceso-telefono.png\nUsa la misma red Wi-Fi. Este modo es solo para pruebas locales, sin HTTPS.`);
process.env.RECA_HOST='0.0.0.0';process.env.RECA_ORIGIN=origin;
await import('./server.js');
