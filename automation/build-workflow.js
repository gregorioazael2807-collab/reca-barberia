import {renderMessage} from '../backend/message-texts.js';
// No credentials, phone numbers or sending nodes are embedded in this workflow.
export function buildWorkflow({id='recaDraftMessages',test=false}={}) {
  const base=test?'RECA_AUTOMATION_TEST_BASE_URL':'RECA_AUTOMATION_BASE_URL';
  const headerParameters={parameters:[{name:'Authorization',value:'=Bearer {{ $env.RECA_AUTOMATION_TOKEN }}'}]};
  return {
    id,name:test?'RECA — prueba aislada de correos':'RECA — correos automáticos (ENVÍO CONTROLADO)',active:false,
    nodes:[
      {id:'trigger',name:'Inicio',type:test?'n8n-nodes-base.manualTrigger':'n8n-nodes-base.scheduleTrigger',typeVersion:test?1:1.2,position:[0,0],parameters:test?{}:{rule:{interval:[{field:'minutes',minutesInterval:1}]}}},
      {id:'claim',name:'Recoger tareas de RECA',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[240,0],parameters:{method:'POST',url:`={{ $env.${base} + '/api/automation/claim' }}`,sendHeaders:true,headerParameters,options:{timeout:15000}}},
      {id:'draft',name:'Redactar correos para clientes',type:'n8n-nodes-base.code',typeVersion:2,position:[480,0],parameters:{mode:'runOnceForAllItems',jsCode:`const renderMessage = ${renderMessage.toString()};\nreturn $input.all().flatMap(item => (item.json.jobs || []).map(job => {const draft=renderMessage(job.payload);return {json:{id:job.id,leaseToken:job.leaseToken,message:{subject:draft.subject,emailText:draft.emailText}}};}));`}},
      {id:'save',name:'Guardar borrador — NO enviar',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[720,0],parameters:{method:'POST',url:`={{ $env.${base} + '/api/automation/jobs/' + $json.id + '/draft' }}`,sendHeaders:true,headerParameters,sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({leaseToken:$json.leaseToken,message:$json.message}) }}',options:{timeout:15000}}},
      ...(!test?[{id:'email',name:'Enviar correos nuevos autorizados',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[240,240],parameters:{method:'POST',url:`={{ $env.${base} + '/api/automation/email/run' }}`,sendHeaders:true,headerParameters,options:{timeout:90000}}}]:[])
    ],
    connections:{'Inicio':{main:[[{node:'Recoger tareas de RECA',type:'main',index:0},...(!test?[{node:'Enviar correos nuevos autorizados',type:'main',index:0}]:[])]]},'Recoger tareas de RECA':{main:[[{node:'Redactar correos para clientes',type:'main',index:0}]]},'Redactar correos para clientes':{main:[[{node:'Guardar borrador — NO enviar',type:'main',index:0}]]}},
    settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,executionTimeout:test?60:120},
    pinData:{},tags:[],versionId:'67bb48ec-1162-4b01-8e01-7b485daeb2bb'
  };
}
