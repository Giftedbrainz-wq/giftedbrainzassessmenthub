import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const constants=src.slice(src.indexOf('const MAX_DOCUMENT_EXTRACTION_QUESTIONS='),src.indexOf('async function compressImageDataForUpload'));
function get(name,next){const start=src.indexOf(name);assert.ok(start>=0,`missing ${name}`);const end=src.indexOf(next,start);assert.ok(end>start,`missing function boundary ${next}`);return src.slice(start,end)}
const fns=[
  get('function parseImportedPassageSection(', 'function parseImportedDocumentLocally('),
  get('function parseImportedDocumentLocally(', '// AI extraction is bounded'),
  get('function splitDocumentForExtraction(', 'async function extractDocument('),
  get('function changeDraftPage(', 'function normalizeDraftAnswer('),
  get('function normalizeDraftAnswer(', 'async function generateAI('),
  get('function draftHasDuplicateOptions(', 'function extractionReadyStats('),
  get('async function saveDraftQuestions(', 'async function saveDraftToBank(')
].join('\n');
const saved=[],toasts=[];
const state={aiDraft:[],aiDraftPage:0, savingDraft:false};
let failureAt=-1, serverCall=0;
const context={
  console,state, Map,Set,Array,Number,String,Math,Error,
  render:()=>{},toast:(message)=>toasts.push(message),
  $:()=>null,compressImageDataForUpload:async()=>null,MAX_STORED_IMAGE_CHARS:1200000,
  api:async(action,{body})=>{
    assert.equal(action,'ai-save-batch');
    assert.ok(body.questions.length<=100,'server save batch exceeds 100');
    serverCall++;
    if(serverCall===failureAt)throw Error('Simulated network failure');
    saved.push(...body.questions);
    return {inserted:body.questions.length};
  }
};
vm.createContext(context);
vm.runInContext(`${constants}\n${fns}`,context);
function exampleQuestions(count){return Array.from({length:count},(_,i)=>`${i+1}. What is ${i+1} plus zero?\nA. ${i+1}\nB. -100\nC. -200\nD. -300`).join('\n\n')+'\n\nANSWER KEY\n'+Array.from({length:count},(_,i)=>`${i+1}. A`).join('\n');}
const text=exampleQuestions(1000);
let questions=vm.runInContext('parseImportedDocumentLocally(INPUT)',Object.assign(context,{INPUT:text}));
assert.equal(questions.length,1000,'local extractor must parse all 1000');
assert.equal(questions[999].answer,0);
assert.equal(questions[999].text,'What is 1000 plus zero?');
assert.equal(questions[999].options.length,4);
console.log('PASS  Local extraction parses all 1,000 numbered questions and their answer keys');
let chunks=vm.runInContext('splitDocumentForExtraction(INPUT)',context);
assert.ok(chunks.length>1 && chunks.length<=50);
assert.equal(chunks.reduce((n,c)=>n+c.estimated,0),1000);
assert.ok(chunks.every(c=>c.text.includes('ANSWER KEY FOR THIS BATCH')));
assert.ok(chunks.every(c=>c.numbers.length<=25));
console.log('PASS  Long documents split into complete, numbered extraction chunks without losing questions');
assert.throws(()=>vm.runInContext('parseImportedDocumentLocally(INPUT)',Object.assign(context,{INPUT:exampleQuestions(1001)})),/1000|1,000/);
assert.throws(()=>vm.runInContext('splitDocumentForExtraction(INPUT)',context),/1000|1,000/);
console.log('PASS  Above-limit documents receive an explicit error rather than silent truncation');
context.state.aiDraft=Array.from(questions,q=>({...q}));
assert.equal(await vm.runInContext('saveDraftQuestions(null,null)',context),true);
assert.equal(saved.length,1000);
assert.equal(serverCall,10);
assert.equal(context.state.aiDraft.length,0);
console.log('PASS  One 1,000-question import saves in ten verified 100-question requests');
context.state.aiDraft=Array.from(questions,q=>({...q}));
failureAt=serverCall+4;
const before=saved.length;
assert.equal(await vm.runInContext('saveDraftQuestions(null,null)',context),false);
assert.equal(saved.length-before,300);
assert.equal(context.state.aiDraft.length,700);
console.log('PASS  Failed save retains the 700 unsaved questions for retry without losing draft data');
failureAt=-1;
assert.equal(await vm.runInContext('saveDraftQuestions(null,null)',context),true);
assert.equal(context.state.aiDraft.length,0);
assert.equal(saved.length,2000);
console.log('PASS  Retry successfully saves the remaining 700 questions');
assert.ok(src.includes('DRAFT_REVIEW_PAGE_SIZE=25')&&src.includes('changeDraftPage(-1)')&&src.includes('changeDraftPage(1)'));
console.log('PASS  Review screen is paginated to prevent rendering 1,000 editable cards together');
