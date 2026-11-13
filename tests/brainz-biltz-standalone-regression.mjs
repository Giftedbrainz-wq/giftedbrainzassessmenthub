import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { onRequest } from '../edge-functions/api/index.js';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sql=await readFile(new URL('../schema_brainz_biltz_standalone_migration.sql',import.meta.url),'utf8');
const tests=[];const test=(name,fn)=>tests.push({name,fn});

// Explicit contract tests protect against accidentally routing Brainz Biltz through CBT.
test('Brainz Biltz is a separately routed and branded student mode',()=>{
 assert.match(app,/\?biltzQuiz=\$\{encodeURIComponent\(slug\)\}/);
 assert.match(app,/if\(boostSlug\)\{boostLoadPublic\(boostSlug\)/);
 assert.match(app,/const boostSlug=_qs2\.get\('biltzQuiz'\)\|\|_qs2\.get\('boost'\)/);
 assert.match(app,/pageName\(\)/);
 assert.match(app, /item\('boost','⚡','Brainz Biltz'\)/);
 assert.doesNotMatch(app,/Brain Boost/);
 assert.match(app,/function boostRenderStudent\(/);
 assert.match(app,/if\(state\.studentBoost\)\{boostRenderStudent\(\);return;/);
 assert.doesNotMatch(app.slice(app.indexOf('async function boostStudentStart()'),app.indexOf('function boostStudentRestart()')),/attempt-start|public-quiz|\?quiz=/);
 assert.match(html,/app\.js\?v=(?:v50\.8\.0-contrast|51\.0\.0|51\.1\.0|51\.2\.0|51\.3\.0|51\.4\.0|51\.5\.0|51\.6\.0)/);
});
test('Brainz Biltz has independent protected database tables',()=>{
 for(const table of ['brain_boost_quizzes','brain_boost_questions','brain_boost_attempts']){
  assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
 }
 assert.match(sql,/question_snapshot jsonb/);
});

const db={brain_boost_quizzes:[],brain_boost_questions:[],brain_boost_attempts:[],brain_boost_registrations:[]};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const u=new URL(String(input));const table=u.pathname.split('/').pop();
 if(!db[table])throw Error(`Unexpected Supabase table ${table}`);
 const method=String(options.method||'GET').toUpperCase();let rows=db[table];
 for(const [key,val] of u.searchParams){if(val.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===val.slice(3));}
 if(method==='GET'){
  rows=[...rows];const order=u.searchParams.get('order');
  if(order){const [key,dir]=order.split(',')[0].split('.');rows.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))*(dir==='desc'?-1:1));}
  const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||100000);
  rows=rows.slice(offset,offset+limit);
  const columns=u.searchParams.get('select');if(columns&&columns!=='*')rows=rows.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));
  return Response.json(rows);
 }
 const data=JSON.parse(options.body||'{}');
 if(method==='POST'){
  const records=(Array.isArray(data)?data:[data]).map(d=>({id:randomUUID(),created_at:new Date().toISOString(),registered_at:new Date().toISOString(),updated_at:new Date().toISOString(),status:table==='brain_boost_attempts'?'active':'draft',...d}));
  for(const record of records){
    const existing=table==='brain_boost_registrations'&&u.searchParams.get('on_conflict')?db[table].find(r=>r.quiz_id===record.quiz_id&&r.device_id===record.device_id):null;
    if(existing)Object.assign(existing,record,{id:existing.id});else db[table].push(record);
  }
  return Response.json(records,{status:201});
 }
 if(method==='PATCH'){
  rows=rows.filter(r=>!u.searchParams.has('status')||String(r.status)===u.searchParams.get('status')?.slice(3));
  rows.forEach(r=>Object.assign(r,data));return Response.json(rows);
 }
 if(method==='DELETE'){
  const ids=new Set(rows.map(r=>r.id));db[table]=db[table].filter(r=>!ids.has(r.id));
  if(table==='brain_boost_quizzes'){
    db.brain_boost_questions=db.brain_boost_questions.filter(r=>r.quiz_id!==[...ids][0]);
    db.brain_boost_attempts=db.brain_boost_attempts.filter(r=>r.quiz_id!==[...ids][0]);
  }
  return Response.json(rows);
 }
 throw Error(`Unexpected method ${method}`);
};
const env={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SECRET_KEY:'test-secret',ADMIN_PASSWORD:'testpw',SESSION_SECRET:'test-secret-for-signing'};
const call=async(action,method='GET',payload={},token='',device='device-test-123')=>{
 const url=`https://quiz.test/api?action=${encodeURIComponent(action)}${method==='GET'?Object.entries(payload).map(([k,v])=>`&${k}=${encodeURIComponent(v)}`).join(''):''}`;
 const h={'content-type':'application/json','x-device-id':device};if(token)h.authorization=`Bearer ${token}`;
 const req=new Request(url,{method,headers:h,body:method==='GET'?undefined:JSON.stringify(payload)});
 const res=await onRequest({request:req,env});return {status:res.status,data:await res.json()};
};
let token,quizId,slug,questionId,attempt;
test('admin-only quiz creation, independent question creation and publishing',async()=>{
 let r=await call('boost-save','POST',{title:'Test'});assert.equal(r.status,401);
 r=await call('login','POST',{password:'testpw'});assert.equal(r.status,200);token=r.data.token;
 r=await call('boost-save','POST',{title:'Quick Algebra',secondsPerQuestion:30},token);assert.equal(r.status,200);quizId=r.data.quiz.id;slug=r.data.quiz.slug;
 r=await call('boost-save','POST',{id:quizId,title:'Quick Algebra',status:'published'},token);assert.equal(r.status,400);
 r=await call('boost-question-save','POST',{quizId,prompt:'What is $x^2$ when $x=3$?',options:['6','9','3','12'],correctIndex:1,explanation:'3 × 3 = 9'},token);assert.equal(r.status,200);questionId=r.data.question.id;
 r=await call('boost-save','POST',{id:quizId,title:'Quick Algebra',status:'published',secondsPerQuestion:30},token);assert.equal(r.status,200);assert.equal(r.data.quiz.status,'published');
 r=await call('boost-list','GET',{},token);assert.equal(r.status,200);assert.equal(r.data.quizzes[0].question_count,1);
});
test('public quiz metadata and question list do not reveal correct answers',async()=>{
 const r=await call('boost-public','GET',{id:slug});assert.equal(r.status,200);
 assert.equal(r.data.quiz.questionCount,1);assert.equal(r.data.quiz.title,'Quick Algebra');
 assert.equal(JSON.stringify(r.data).includes('correct_index'),false);
 assert.equal(JSON.stringify(r.data).includes('correctIndex'),false);
});
test('student plays Brainz Biltz without using CBT and receives a server-scored result',async()=>{
 let r=await call('boost-start','POST',{slug,name:'Ada'});assert.equal(r.status,403);
 r=await call('boost-register','POST',{slug,studentData:{full_name:'Ada'}});assert.equal(r.status,200);assert.equal(r.data.registration.studentName,'Ada');
 r=await call('boost-start','POST',{slug});assert.equal(r.status,200);attempt=r.data.attempt;
 assert.equal(r.data.questions.length,1);assert.equal(r.data.questions[0].id,questionId);
 assert.equal(r.data.questions[0].correct_index,undefined);assert.equal(r.data.questions[0].explanation,undefined);
 r=await call('boost-submit','POST',{attemptId:attempt.id,attemptToken:randomUUID(),answers:{[questionId]:1}});assert.equal(r.status,403);
 r=await call('boost-submit','POST',{attemptId:attempt.id,attemptToken:attempt.token,answers:{[questionId]:1}},'', 'different-device');assert.equal(r.status,403);
 r=await call('boost-submit','POST',{attemptId:attempt.id,attemptToken:attempt.token,answers:{[questionId]:1}});assert.equal(r.status,200);assert.equal(r.data.result.score,1);assert.equal(r.data.result.percent,100);assert.equal(r.data.result.review[0].correctIndex,1);
 r=await call('boost-submit','POST',{attemptId:attempt.id,attemptToken:attempt.token,answers:{[questionId]:1}});assert.equal(r.status,409);
});
test('server deadline prevents extra scores from expired attempts',async()=>{
 let r=await call('boost-register','POST',{slug,studentData:{full_name:'Tomi'}},'', 'device-test-456');assert.equal(r.status,200);
 r=await call('boost-start','POST',{slug},'', 'device-test-456');assert.equal(r.status,200);const a=r.data.attempt;
 const row=db.brain_boost_attempts.find(x=>x.id===a.id);row.started_at=new Date(Date.now()-60000).toISOString();
 r=await call('boost-submit','POST',{attemptId:a.id,attemptToken:a.token,answers:{[questionId]:1}},'', 'device-test-456');assert.equal(r.status,200);assert.equal(r.data.result.score,0);assert.equal(r.data.result.timedOut,true);
});
test('admin-selected registration fields are required, saved, and available on return',async()=>{
 const startAt=new Date(Date.now()+86400000).toISOString();const endAt=new Date(Date.now()+172800000).toISOString();
 let r=await call('boost-save','POST',{id:quizId,title:'Quick Algebra',status:'published',secondsPerQuestion:30,startAt,endAt,registrationFields:[{key:'full_name',label:'Full Name',required:true},{key:'institution',label:'Institution',required:true}]},token);
 assert.equal(r.status,200);
 r=await call('boost-public','GET',{id:slug},'','device-future');assert.equal(r.status,200);assert.equal(r.data.quiz.phase,'upcoming');
 r=await call('boost-register','POST',{slug,studentData:{full_name:'Mary'}},'','device-future');assert.equal(r.status,400);
 r=await call('boost-register','POST',{slug,studentData:{full_name:'Mary',institution:'UI'}},'','device-future');assert.equal(r.status,200);
 r=await call('boost-start','POST',{slug},'','device-future');assert.equal(r.status,409);
 r=await call('boost-public','GET',{id:slug},'','device-future');assert.equal(r.status,200);assert.equal(r.data.registration.studentData.institution,'UI');
 r=await call('boost-registrations','GET',{quizId},token);assert.equal(r.status,200);assert.ok(r.data.registrations.some(x=>x.student_name==='Mary'&&x.student_data.institution==='UI'));
});
test('scheduled closing rejects new attempts and allows reopening when rescheduled',async()=>{
 let r=await call('boost-save','POST',{id:quizId,title:'Quick Algebra',status:'published',secondsPerQuestion:30,startAt:new Date(Date.now()-2*86400000).toISOString(),endAt:new Date(Date.now()-86400000).toISOString()},token);assert.equal(r.status,200);
 r=await call('boost-public','GET',{id:slug});assert.equal(r.status,200);assert.equal(r.data.quiz.phase,'closed');
 r=await call('boost-start','POST',{slug});assert.equal(r.status,409);
 r=await call('boost-save','POST',{id:quizId,title:'Quick Algebra',status:'published',secondsPerQuestion:30},token);assert.equal(r.status,200);
 r=await call('boost-public','GET',{id:slug});assert.equal(r.data.quiz.phase,'open');
});
test('bulk question import validates questions and stores entire batch',async()=>{
 const questions=[{prompt:'What is a derivative?',options:['Rate of change','A root','A set','A sequence'],correctIndex:0,explanation:'A derivative measures instantaneous rate of change.'},{prompt:'Which is a cell organelle?',options:['Granite','Ribosome','Quartz','Helium'],correctIndex:1,explanation:'Ribosomes are involved in protein synthesis.'}];
 let r=await call('boost-question-batch-save','POST',{quizId,questions});assert.equal(r.status,401);
 r=await call('boost-question-batch-save','POST',{quizId,questions},token);assert.equal(r.status,200);assert.equal(r.data.inserted,2);
 r=await call('boost-questions','GET',{quizId},token);assert.equal(r.status,200);assert.equal(r.data.questions.length,3);
});
test('admin changes questions without modifying any CBT rows',async()=>{
 const r=await call('boost-questions','GET',{quizId},token);assert.equal(r.status,200);assert.equal(r.data.questions[0].correct_index,1);
 assert.deepEqual(Object.keys(db).sort(),['brain_boost_attempts','brain_boost_questions','brain_boost_quizzes','brain_boost_registrations']);
});
let failed=0;
for(const t of tests){try{await t.fn();console.log('PASS ',t.name);}catch(e){failed++;console.error('FAIL ',t.name,'\n',e.stack||e);}}
globalThis.fetch=originalFetch;
console.log(`\n${tests.length-failed}/${tests.length} Brainz Biltz tests passed.`);
if(failed)process.exitCode=1;
