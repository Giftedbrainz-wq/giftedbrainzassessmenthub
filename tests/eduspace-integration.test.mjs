import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {handleEduSpaceBridge} from '../edge-functions/api/eduspace-bridge.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const SECRET='my-sample-testing-secret-for-eduspace-bridge-0123456789';
const CRON='periodic-drain-secret-test-0123456789-abcd';
const U={device:'a-device-id-01234567890',attempt:'88888888-8888-4888-8888-888888888888',quiz:'77777777-7777-4777-8777-777777777777',q1:'11111111-1111-4111-8111-111111111111',q2:'22222222-2222-4222-8222-222222222222',q3:'33333333-3333-4333-8333-333333333333'};
const rows={eduspace_hub_links:[],eduspace_hub_outbox:[],attempts:[{id:U.attempt,quiz_id:U.quiz,device_id:U.device,result_token:'secret-private-result-token',status:'submitted'}],quizzes:[{id:U.quiz,title:'Chemistry',settings:{reviewEnabled:true,resultEnabled:true}}],quiz_sections:[{id:'44444444-4444-4444-8444-444444444444',quiz_id:U.quiz,title:'Acids and Bases'}],attempt_answers:[{question_id:U.q1,attempt_id:U.attempt,selected_answer:1},{question_id:U.q2,attempt_id:U.attempt,selected_answer:2},{question_id:U.q3,attempt_id:U.attempt,selected_answer:null}],questions:[{id:U.q1,quiz_id:U.quiz,section_id:'44444444-4444-4444-8444-444444444444',subject:'Chemistry',text:'What is the formula of water?',options:['CO2','H2O','NaCl'],answer:1,explanation:'Hydrogen and oxygen.'},{id:U.q2,quiz_id:U.quiz,section_id:'44444444-4444-4444-8444-444444444444',subject:'Chemistry',text:'Which is a noble gas?',options:['Helium','Hydrogen','Nitrogen'],answer:0,explanation:'Group 18 gases.'},{id:U.q3,quiz_id:U.quiz,section_id:'44444444-4444-4444-8444-444444444444',subject:'Chemistry',text:'Select the correct chemical reaction.',options:['A','B','C'],answer:0,explanation:'Test.'}],brainz_biltz_attempts:[],brainz_biltz_challenges:[]};
let webhookRequests=[],failDelivery=false,config=true;
const env=name=>name==='ASSESSMENT_HUB_SYNC_SECRET'?(config?SECRET:''):name==='EDUSPACE_BASE_URL'?'https://eduspace.example':name==='ASSESSMENT_HUB_CRON_SECRET'?CRON:'';
function mockSb(_context,table,{method='GET',query='',body={}}={}){
 const all=rows[table];if(!all)throw Error('Mock table missing '+table);
 const params=new URLSearchParams(query);
 let selected=[...all];
 for(const [k,v] of params.entries()){
  if(['select','limit','offset','order'].includes(k))continue;
  if(v.startsWith('eq.'))selected=selected.filter(r=>String(r[k]??'')===v.slice(3));
  else if(v.startsWith('in.('))selected=selected.filter(r=>v.slice(4,-1).split(',').includes(String(r[k])));
  else if(v.startsWith('lte.'))selected=selected.filter(r=>Date.parse(r[k])<=Date.parse(v.slice(4)));
 }
 if(method==='POST'){
  const row={...body,id:crypto.randomUUID(),created_at:new Date().toISOString()};
  all.push(row);return Promise.resolve([row]);
 }
 if(method==='PATCH'){
  for(const r of selected)Object.assign(r,body);
  return Promise.resolve(params.get('select')?selected:[]);
 }
 if(method==='DELETE'){
  for(const r of selected){const i=all.indexOf(r);if(i>=0)all.splice(i,1);}
  return Promise.resolve([]);
 }
 let limit=Number(params.get('limit')||0);return Promise.resolve(limit?selected.slice(0,limit):selected);
}
async function mockFetch(url,opts){
 assert.equal(url,'https://eduspace.example/api/integrations/assessment-hub/events');
 const raw=opts.body,stamp=opts.headers['x-gb-hub-timestamp'];
 const expected='sha256='+createHmac('sha256',SECRET).update(stamp+'.'+raw).digest('hex');
 assert.equal(opts.headers['x-gb-hub-signature'],expected);
 const parsed=JSON.parse(raw);webhookRequests.push(parsed);
 return new Response(JSON.stringify(failDelivery?{error:'temporarily unavailable'}:{ok:true}),{status:failDelivery?503:200,headers:{'content-type':'application/json'}});
}
async function call(action,body={},headers={}){
 const r=await handleEduSpaceBridge(action,new Request('https://hub.example/api',{method:'POST',headers:{'content-type':'application/json',...headers}}),body,{context:{},env,sb:mockSb,fetcher:mockFetch});
 return {status:r.status,data:await r.json()};
}
const tests=[];function test(name,fn){tests.push({name,fn});}
let sessionKey='';
test('disabled integrations deny new links and never expose server secrets',async()=>{
 config=false;const r=await call('hub-integration-link',{deviceId:U.device,linkCode:'TEST_LINK-ABC'});assert.equal(r.status,503);
 const s=await call('hub-integration-status',{});assert.deepEqual(s.data,{configured:false,linked:false});config=true;
});
test('account linking sends a signed event and returns private credential',async()=>{
 const r=await call('hub-integration-link',{deviceId:U.device,linkCode:'TEST_LINK-ABC'});
 assert.equal(r.status,200);sessionKey=r.data.syncKey;assert.match(sessionKey,/^[a-f0-9]{64}$/);
 assert.equal(webhookRequests.at(-1).type,'account.linked');
 assert.equal(webhookRequests.at(-1).linkCode,'TEST_LINK-ABC');
 assert.notEqual(rows.eduspace_hub_links[0].credential_hash,sessionKey);
 assert.equal(rows.eduspace_hub_links[0].active,true);
});
test('signed-in browser credential required for linked status',async()=>{
 const valid=await call('hub-integration-status',{deviceId:U.device,syncKey:sessionKey});assert.equal(valid.data.linked,true);
 const invalid=await call('hub-integration-status',{deviceId:U.device,syncKey:'0'.repeat(64)});assert.equal(invalid.data.linked,false);
});
test('wrong device, wrong private result token and unfinished CBT do not synchronise',async()=>{
 const basic={deviceId:U.device,syncKey:sessionKey,attemptId:U.attempt,resultToken:'secret-private-result-token'};
 assert.equal((await call('hub-integration-sync-attempt',{...basic,deviceId:'another-device'})).status,401);
 assert.equal((await call('hub-integration-sync-attempt',{...basic,resultToken:'stolen-or-wrong'})).status,403);
 rows.attempts[0].status='started';assert.equal((await call('hub-integration-sync-attempt',basic)).status,403);
 rows.attempts[0].status='submitted';
});
test('unreleased CBT review cannot synchronise questions or bookmarks',async()=>{
 const body={deviceId:U.device,syncKey:sessionKey,attemptId:U.attempt,resultToken:'secret-private-result-token'};
 rows.quizzes[0].settings.reviewEnabled=false;
 assert.equal((await call('hub-integration-sync-attempt',body)).status,403);
 assert.equal((await call('hub-integration-bookmark',{...body,questionId:U.q1})).status,403);
 rows.quizzes[0].settings.reviewEnabled=true;
});
test('submitted reviews send correct HMAC and zero-based answers to EduSpace',async()=>{
 const body={deviceId:U.device,syncKey:sessionKey,attemptId:U.attempt,resultToken:'secret-private-result-token'};
 const r=await call('hub-integration-sync-attempt',body);
 assert.equal(r.status,200);assert.equal(r.data.delivered,true);assert.equal(r.data.answered,2);assert.equal(r.data.unansweredExcluded,1);
 const event=webhookRequests.at(-1);assert.equal(event.type,'cbt.completed');
 assert.equal(event.attemptId,U.attempt);assert.equal(event.questions[0].topic,'Acids and Bases');assert.deepEqual(event.questions.map(q=>q.selectedIndex),[1,2]);
 assert.equal(rows.eduspace_hub_outbox.at(-1).status,'delivered');
 const duplicate=await call('hub-integration-sync-attempt',body);
 assert.equal(duplicate.data.alreadySynced,true);assert.equal(webhookRequests.at(-1),event);
});
test('bookmarks only accept questions from submitted reviewed attempt',async()=>{
 const body={deviceId:U.device,syncKey:sessionKey,attemptId:U.attempt,resultToken:'secret-private-result-token'};
 const denied=await call('hub-integration-bookmark',{...body,questionId:crypto.randomUUID()});assert.equal(denied.status,403);
 const allowed=await call('hub-integration-bookmark',{...body,questionId:U.q1});assert.equal(allowed.status,200);assert.equal(webhookRequests.at(-1).type,'question.bookmarked');
 const removal=await call('hub-integration-bookmark',{...body,questionId:U.q1,save:false});assert.equal(removal.status,200);assert.equal(webhookRequests.at(-1).type,'question.unbookmarked');
});
test('delivery failure queues retry and cron drain is protected',async()=>{
 const body={deviceId:U.device,syncKey:sessionKey,attemptId:U.attempt,resultToken:'secret-private-result-token'};
 failDelivery=true;
 const queued=await call('hub-integration-bookmark',{...body,questionId:U.q2});assert.equal(queued.status,200);assert.equal(queued.data.delivered,false);
 assert.equal((await call('hub-integration-drain',{})).status,401);
 const pending=rows.eduspace_hub_outbox.filter(x=>x.status==='pending');assert.equal(pending.length,1);
 pending[0].next_attempt_at=new Date(Date.now()-5000).toISOString();failDelivery=false;
 const drained=await call('hub-integration-drain',{}, {authorization:`Bearer ${CRON}`});assert.equal(drained.status,200);assert.equal(drained.data.delivered,1);
 assert.equal(pending[0].status,'delivered');
});
let failed=0;
for(const t of tests){try{await t.fn();console.log('PASS ',t.name);}catch(e){failed++;console.error('FAIL ',t.name,e.stack||e);}}
console.log(`${tests.length-failed}/${tests.length} integration checks passed`);
if(failed)process.exitCode=1;
