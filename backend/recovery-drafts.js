// Private local review only. No email/WhatsApp provider is contacted.
import {mkdir,writeFile,readdir,readFile,unlink,chmod} from 'node:fs/promises';
import path from 'node:path';
import {root} from './db.js';
const directory=path.join(process.env.PRIVATE_DIR||path.join(root,'.local'),'password-recovery-drafts');
export async function cleanRecoveryDrafts() {
  await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
  for(const name of await readdir(directory)) {
    if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
    const file=path.join(directory,name);
    const draft=JSON.parse(await readFile(file,'utf8'));
    if(Date.parse(draft.expiresAt)<=Date.now())await unlink(file);
  }
}
export async function saveRecoveryDraft(draft) {
  await cleanRecoveryDrafts();
  await writeFile(path.join(directory,draft.userId+'.json'),JSON.stringify(draft)+'\n',{mode:0o600});
  await chmod(path.join(directory,draft.userId+'.json'),0o600);
}
export async function removeRecoveryDrafts(userId) {
  await unlink(path.join(directory,userId+'.json')).catch(err=>{if(err.code!=='ENOENT')throw err;});
}
