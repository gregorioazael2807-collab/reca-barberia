import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {gochoProvider} from '../gocho-provider.js';
test('adaptador OpenAI: configuración privada, JSON restringido y fallos sin secretos; red simulada',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'reca-gocho-config-'));let calls=0,body;
 try{
  const mock=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'agenda',startDate:null,endDateExclusive:null})}}]})};};
  assert.equal((await gochoProvider({privateDir:directory,env:{},fetchImpl:mock})).available,false);assert.equal(calls,0);
  const file=path.join(directory,'gocho-ai.env');await writeFile(file,'OPENAI_API_KEY=test-synthetic-not-real\nGOCHO_ENABLED=true\nGOCHO_DAILY_LIMIT=2\n',{mode:0o600});
  const provider=await gochoProvider({privateDir:directory,env:{},fetchImpl:mock});assert.equal(provider.available,true);assert.equal(provider.dailyLimit,2);assert.equal((await provider.classify('Consulta la agenda',{today:'2027-01-04',timezone:'America/New_York'})).action,'agenda');assert.equal(calls,1);assert.equal(body.store,false);assert.equal(body.max_tokens,800);assert.ok(body.response_format.json_schema.schema.properties.action.enum.includes('datetime'));assert.ok(body.response_format.json_schema.schema.required.includes('answer'));assert.match(body.messages[0].content,/No tienes búsqueda web/);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.response_format.json_schema.schema.additionalProperties,false);assert.equal(body.tools,undefined);assert.doesNotMatch(JSON.stringify(body),/test-synthetic-not-real/);
  const failed=await gochoProvider({privateDir:directory,env:{},fetchImpl:async()=>{throw new Error('test-synthetic-not-real');}});await assert.rejects(()=>failed.classify('Agenda',{}),err=>err.status===503&&!err.message.includes('test-synthetic-not-real'));
  const unlimited=await gochoProvider({privateDir:directory,env:{GOCHO_DAILY_LIMIT:'0'},fetchImpl:mock});assert.equal(unlimited.available,true);assert.equal(unlimited.dailyLimit,0);
  await chmod(file,0o644);assert.equal((await gochoProvider({privateDir:directory,env:{},fetchImpl:mock})).available,false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
