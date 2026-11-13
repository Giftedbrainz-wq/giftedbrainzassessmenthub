import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest } from '../edge-functions/api/index.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../app.js'),apiSrc=read('../edge-functions/api/index.js'),html=read('../index.html'),css=read('../study-ai-v51.5.css'),schema=read('../schema_study_ai_v51_5.sql');
const poolId='90000000-0000-4000-8000-000000000001';
const topicId='90000000-0000-4000-8000-000000000002';
const questionId='90000000-0000-4000-8000-000000000003';
const otherId='90000000-0000-4000-8000-000000000004';
const device='gb-student-test-12345';
const tables={
 question_pools:[{id:poolId,slug:'mathematics-2027',name:'Mathematics',access_mode:'public'}],
 pool_study_progress:[{id:'p1',pool_id:poolId,device_id:device,topic_ids:[topicId],question_ids:[questionId],question_index:0,answers:{[questionId]:1}}],
 questions:[{id:questionId,pool_id:poolId,topic_id:topicId,text:'What is 2 + 2?',options:['2','3','4','5'],answer:2,explanation:'Addition makes four.',subject:'Mathematics',topic:'Numbers',passage_id:null,needs_review:false}],
 passages:[],
 cbt_libraries:[{id:'l1',slug:'mock-library',name:'Mock Library',access_mode:'public'}],
 cbt_library_items:[{library_id:'l1',quiz_id:'q1',position:0}],
 quizzes:[{id:'q1',slug:'mock-quiz',title:'Sample Quiz',description:'',duration:30,status:'published',settings:{},result_slug:'old-results-link',result_released:false}]
};
const requests={groq:[],quotas:[],results:[]};
let allowQuota=true,groqFails=false;
const oldFetch=globalThis.fetch;
globalThis.fetch=async(input,opts={})=>{
 const u=new URL(String(input));const endpoint=u.pathname.split('/').pop(),method=(opts.method||'GET').toUpperCase();
 if(u.hostname==='api.groq.com'){
  assert.equal(method,'POST');assert.match(opts.headers.authorization,/Bearer test-groq-key/);
  requests.groq.push(JSON.parse(opts.body));
  return groqFails?Response.json({error:{message:'API secret issue, should not leak'}},{status:500}):Response.json({choices:[{message:{content:'Step 1: add $2+2$. The correct answer is C.'}}]});
 }
 if(u.pathname.includes('/rest/v1/rpc/')){
  assert.equal(endpoint,'gb_study_ai_reserve_v1');requests.quotas.push(JSON.parse(opts.body));return Response.json(allowQuota);
 }
 assert.ok(u.pathname.includes('/rest/v1/'),u.href);
 if(!tables[endpoint])return Response.json({message:'Missing mock table'},{status:404});
 let found=[...tables[endpoint]];
 for(const [key,value] of u.searchParams){if(value.startsWith('eq.'))found=found.filter(row=>String(row[key])===value.slice(3));else if(value==='eq.false')found=found.filter(row=>row[key]===false);}
 const columns=u.searchParams.get('select');
 if(columns&&columns!=='*')found=found.map(row=>Object.fromEntries(columns.split(',').map(k=>[k,row[k]])));
 return Response.json(found);
};
const env={SUPABASE_URL:'https://mock.supabase.test',SUPABASE_SECRET_KEY:'test-sb-secret',SESSION_SECRET:'a-secret-that-is-long-enough-for-quota',GROQ_API_KEY:'test-groq-key'};
async function call(action,payload={},candidate=device){
 const req=new Request(`https://hub.local/api?action=${action}`,{method:'POST',headers:{'content-type':'application/json','x-device-id':candidate},body:JSON.stringify(payload)});
 const res=await onRequest({request:req,env});return {status:res.status,data:await res.json()};
}
try{
 assert.match(html,/app\.js\?v=51\.6\.0/);
 assert.match(html,/study-ai-v51\.5\.css/);
 assert.match(app,/Results &amp; Review 📊/);
 assert.doesNotMatch(app,/Results not yet released/);
 assert.match(app,/encodeURIComponent\(q\.result_slug\|\|q\.id\)/);
 assert.match(apiSrc,/isUuid\(resultSlug\)\?`id=eq/);
 assert.match(app,/window\.poolStudyAiOpen=poolStudyAiOpen/);
 assert.match(app,/function poolStudyAiPanel/);
 assert.match(app,/function poolStudyAiAsk/);
 assert.match(app,/const q=poolStudyAiCurrent\(\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(schema,/revoke all on function public\.gb_study_ai_reserve_v1/);
 assert.match(schema,/security definer/);
 console.log('PASS permanent library results link and mobile/desktop study AI components');
 let result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId:otherId,mode:'explain',message:'Please solve'});
 assert.equal(result.status,403);assert.equal(requests.groq.length,0);
 console.log('PASS AI refuses questions outside an active Study Mode session');
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'unknown',message:'Please solve'});
 assert.equal(result.status,400);
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'explain',message:'Please solve'},'fake-device-new');
 assert.equal(result.status,403);
 console.log('PASS AI refuses unsupported actions and guessed device IDs');
 tables.pool_study_progress[0].answers={};
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'explain',message:'Please solve'});
 assert.equal(result.status,403);assert.equal(requests.groq.length,0);
 assert.match(result.data.error||result.data.message||'',/Answer this question/);
 tables.pool_study_progress[0].answers={[questionId]:1};
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'explain',message:'Please solve'});
 assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.answer,/correct answer is C/);
 assert.equal(requests.quotas.length,3);
 assert.equal(requests.groq.length,1);
 const prompts=requests.groq[0].messages.map(x=>x.content).join('\n');
 assert.match(prompts,/What is 2 \+ 2\?/);
 assert.match(prompts,/Addition makes four/);
 assert.match(prompts,/STORED ANSWER INDEX \(zero-based\): 2/);
 console.log('PASS authorised AI request uses server-stored context and atomic quotas');
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'followup',message:'Why C?',history:[{role:'assistant',content:'We added two and two.'}]});
 assert.equal(result.status,200);
 assert.match(requests.groq.at(-1).messages.at(-2).content,/We added two and two/);
 console.log('PASS follow-up chat retains per-question conversation context');
 allowQuota=false;
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'hint',message:'hint'});
 assert.equal(result.status,429);assert.equal(requests.groq.length,2);
 console.log('PASS 429 quota does not make paid model call');
 allowQuota=true;groqFails=true;
 result=await call('pool-study-ai',{poolSlug:'mathematics-2027',questionId,mode:'hint',message:'hint'});
 assert.equal(result.status,502);assert.doesNotMatch(JSON.stringify(result.data),/API secret issue/);
 console.log('PASS provider errors do not expose API secrets');
 // Existing publicly shared CBTs can show buttons before release; server checks release.
 const libReq=new Request('https://hub.local/api?action=public-library&id=mock-library',{headers:{'x-device-id':device}});
 const libResp=await onRequest({request:libReq,env});const lib=await libResp.json();
 assert.equal(libResp.status,200);assert.equal(lib.library.quizzes[0].result_released,false);
 console.log('PASS unpublished quiz still appears in library with canonical results link');
}finally{globalThis.fetch=oldFetch;}
