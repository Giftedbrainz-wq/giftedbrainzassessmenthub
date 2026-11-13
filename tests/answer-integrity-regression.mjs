import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base=new URL('../',import.meta.url);
const app=readFileSync(new URL('app.js',base),'utf8');
const api=readFileSync(new URL('edge-functions/api/index.js',base),'utf8');
const css=readFileSync(new URL('premium-interface.css',base),'utf8');
const snippet=(start,end)=>{
 const i=app.indexOf(start),j=app.indexOf(end,i);
 assert.ok(i!==-1&&j>i,`Source boundaries missing: ${start}`);
 return app.slice(i,j);
};
const source=[
 'const MAX_DOCUMENT_EXTRACTION_QUESTIONS=1000;',
 snippet('function parseImportedPassageSection(', 'function parseImportedDocumentLocally('),
 snippet('function parseImportedDocumentLocally(', '// AI extraction is bounded'),
 snippet('function normalizeDraftAnswer(', 'async function generateAI('),
 snippet('function draftHasDuplicateOptions(', 'function extractionReadyStats('),
 snippet('function isStudentOptionSelected(', 'function switchStudentSection('),
 snippet('function correctionDisplay(', 'function showStudentReview(')
].join('\n');
const state={studentQuiz:{questions:[{id:'q1',options:['Gamma','Alpha','Delta','Beta'],optionMap:[2,0,3,1]}]},studentAnswers:{},aiDraft:[]};
const context={state,console,Array,Set,Map,Math,Number,String,$:()=>null,mathHtml:txt=>String(txt||''),toast:message=>{throw Error(message)},persistStudentProgress:()=>{},renderStudent:()=>{}};
vm.createContext(context);vm.runInContext(source,context);
const imported=`1. Which system maintains body temperature?\nA. Digestive system\nB. Nervous system\nC. Circulatory system\nD. Skeletal system\n\n2. A cell lacks a nucleus. Which structure is present?\nA. Membrane-bound nucleus\nB. Mitochondria\nC. Golgi apparatus\nD. Ribosomes\n\nANSWER KEY\n1. B\n2. D\n\nEXPLANATIONS\n1. A detailed explanation starts with the letter A but the correct answer is the nervous system.\n2. A ribosome performs protein synthesis.`;
const importedQs=vm.runInContext('parseImportedDocumentLocally(INPUT)',Object.assign(context,{INPUT:imported}));
assert.equal(importedQs.length,2);
assert.equal(importedQs[0].answer,1,'Explanation starts with A: should not override the real answer B');
assert.equal(importedQs[1].answer,3,'Explanation starts with A: should not override the real answer D');
console.log('PASS answer key isolated from explanation text');
const contradictory=imported.replace('1. B\n2. D','1. B\n1. C\n2. D');
const flagged=vm.runInContext('parseImportedDocumentLocally(INPUT)',Object.assign(context,{INPUT:contradictory}));
assert.equal(flagged[0].answer,null);
assert.equal(flagged[0].needsReview,true);
console.log('PASS conflicting answer keys are flagged, not guessed');
vm.runInContext("chooseStudentAnswer('q1',3)",context);
assert.equal(state.studentAnswers.q1,1,'Displayed D must be recorded as original B');
assert.equal(vm.runInContext('isStudentOptionSelected(state.studentQuiz.questions[0],3)',context),true);
assert.equal(vm.runInContext('isStudentOptionSelected(state.studentQuiz.questions[0],1)',context),false);
console.log('PASS shuffled selections retain the original correct-answer index');
const correct={questionId:'q1',options:['Alpha','Beta','Gamma','Delta'],correctAnswer:1,selectedAnswer:1};
const markup=vm.runInContext('correctionOptionsHtml(ROW)',Object.assign(context,{ROW:correct}));
assert.match(markup,/D\.<\/b> Beta ✓ Correct answer — Your answer/);
const wrong=vm.runInContext('correctionOptionsHtml(ROW)',Object.assign(context,{ROW:{...correct,selectedAnswer:0}}));
assert.match(wrong,/B\.<\/b> Alpha  — Your answer/);
assert.match(wrong,/D\.<\/b> Beta ✓ Correct answer/);
console.log('PASS corrections retain the displayed shuffle order, including right/wrong selections');
assert.match(api,/validSelected === Number\(question\.answer\)/);
assert.match(api,/new Set\(q\.options\.map/);
assert.match(app,/draftHasDuplicateOptions\(q\)/);
assert.match(app,/draftExplanationDisagrees\(q\)/);
assert.doesNotMatch(snippet('function showStudentReview(', 'async function showStudentLeaderboard('),/marks-badge/);
assert.doesNotMatch(snippet('function renderResultAccess(', 'function toggleSharedPanel('),/marks-badge/);
assert.match(css,/#modalRoot \.modal-backdrop, #studentOverlay \.modal-backdrop\{z-index:240!important/);
assert.match(css,/\.review-answer\.correct\{background:#e9f7ef!important/);
assert.match(css,/\.review-answer\.wrong\{background:#fff0f0!important/);
const dubious={options:['One','Two','Three','Four'],answer:1,explanation:'Correct answer: C. The third option is intended.'};
assert.equal(vm.runInContext('draftExplanationDisagrees(ROW)',Object.assign(context,{ROW:dubious})),true);
assert.equal(vm.runInContext('draftHasDuplicateOptions(ROW)',Object.assign(context,{ROW:{...dubious,options:['One','Two','TWO','Four']}})),true);
assert.match(app,/q.answer!==null&&q.answer!==undefined&&Number\(q.answer\)===j/,'missing answers must not preselect A');
console.log('PASS conflicting explanations and duplicate alternatives receive manual-review flags');
console.log('PASS save checks, mark-free reviews, pastel results, and overlay above sidebar');
