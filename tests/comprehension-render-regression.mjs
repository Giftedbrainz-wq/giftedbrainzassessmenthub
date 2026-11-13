import assert from 'node:assert/strict';
import {onRequest} from '../edge-functions/api/index.js';

// Integration-style route test: a comprehension passage imported into the global
// question bank (passage.quiz_id=NULL) must still render in the public CBT bundle.
const quizId='11f11111-1111-4111-8111-111111111111';
const questionId='22f22222-2222-4222-8222-222222222222';
const passageId='33f33333-3333-4333-8333-333333333333';
const quiz={id:quizId,slug:'comprehension-test',title:'English Comprehension',status:'published',access_mode:'public',settings:{shuffleQuestions:false,shuffleOptions:false},duration:15,pass_mark:50,student_fields:[],description:'',instructions:''};
const q={id:questionId,quiz_id:quizId,section_id:null,passage_id:passageId,type:'passage',text:'Which word best describes the scene?',options:['Serene','Hostile','Noisy','Deserted'],answer:0,explanation:'The scene is peaceful.',subject:'English',topic:'Comprehension',marks:1,position:1,created_at:new Date().toISOString()};
const passage={id:passageId,quiz_id:null,title:'1983 Passage II 📖',content:'The classroom was peaceful and quiet.',created_at:new Date().toISOString()};
const mock={quizzes:[quiz],questions:[q],passages:[passage],quiz_sections:[],brainz_biltz_challenges:[],cbt_library_items:[]};
const old=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const u=new URL(input),table=u.pathname.split('/').pop();assert.ok(table in mock,`Unexpected table ${table}`);
 let rows=[...mock[table]];
 for(const [key,v] of u.searchParams.entries()){
  if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===v.slice(3));
  if(v.startsWith('in.'))rows=rows.filter(r=>v.slice(4,-1).split(',').includes(String(r[key])));
  if(v==='not.is.null')rows=rows.filter(r=>r[key]!=null);
 }
 const select=u.searchParams.get('select');if(select&&select!=='*')rows=rows.map(row=>Object.fromEntries(select.split(',').map(k=>[k,row[k]])));
 const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||10000);
 return Response.json(rows.slice(offset,offset+limit));
};
try{
 const request=new Request('https://quiz.test/api?action=public-quiz&id=comprehension-test',{headers:{'x-device-id':'device-test-comprehension'}});
 const response=await onRequest({request,env:{SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SECRET_KEY:'secret',SESSION_SECRET:'secret'}});
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
 assert.equal(data.quiz.questions.length,1);
 assert.equal(data.quiz.questions[0].passage.title,'1983 Passage II 📖');
 assert.equal(data.quiz.questions[0].passage.content,passage.content);
 assert.equal(data.quiz.questions[0].options.length,4);
 assert.equal(data.quiz.questions[0].answer,undefined,'Public CBT must not leak correct answer');
 console.log('PASS: global-bank comprehension passage resolved and attached to its public CBT question');
}finally{globalThis.fetch=old;}
