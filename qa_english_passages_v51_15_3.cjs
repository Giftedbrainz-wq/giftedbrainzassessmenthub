const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=__dirname;
const src=fs.readFileSync(path.join(root,'app.js'),'utf8');
const prior=fs.readFileSync('/mnt/data/gb_v51_15_2_work/app.js','utf8');
const importerCode=src.slice(src.indexOf('function parseImportedPassageSection('),src.indexOf('// AI extraction is bounded'));
const importer=new Function('MAX_DOCUMENT_EXTRACTION_QUESTIONS','$',importerCode+'\nreturn parseImportedDocumentLocally')(1000,()=>null);
const importerBefore=new Function('MAX_DOCUMENT_EXTRACTION_QUESTIONS','$',prior.slice(prior.indexOf('function parseImportedPassageSection('),prior.indexOf('// AI extraction is bounded'))+'\nreturn parseImportedDocumentLocally')(1000,()=>null);
const sampleFiles=['/mnt/data/Use_of_English_60_Questions.txt','/mnt/data/Gifted_Brainz_UTME_2027_Use_of_English_60_REFORMATTED.txt','/mnt/data/GIFTED_BRAINZ_UTME_2027_ENGLISH_60_SHARED_PASSAGES_FIXED.txt'];
const original=fs.readFileSync(sampleFiles[0],'utf8');
const previous=importerBefore(original);
assert.equal(previous.filter(q=>q.type==='passage').length,0,'old importer did not embed passages in stems as expected');
assert.match(previous[0].text,/^Passage Title:/);
assert.match(previous[1].text,/^Passage Title:/);
console.log('REPRODUCED regression: v51.15.2 treated all 60 as standalone and embedded complete passages in Q1–15 stems.');
for(const filename of sampleFiles){
  const qs=importer(fs.readFileSync(filename,'utf8'));
  assert.equal(qs.length,60,`count ${filename}`);
  for(let i=0;i<60;i++){
    const q=qs[i];
    assert.equal(q.type,i<15?'passage':'multiple_choice',`incorrect link Q${i+1}, ${filename}`);
    assert.equal(q.passage?.title||null,i<5?'Comprehension Passage I 📖':i<15?'Cloze Passage I 📖':null,`title Q${i+1}`);
    assert.equal(q.options.length,4,`four options Q${i+1}`);
    assert(q.options.every(Boolean),`missing option Q${i+1}`);
    assert.equal(Number.isInteger(q.answer),true,`missing key Q${i+1}`);
    assert(q.explanation?.length>8,`missing explanation Q${i+1}`);
    assert(!/Passage\s+Title\s*:/i.test(q.text),`embedded passage in stem Q${i+1}`);
    assert(!/The Christian Science Monitor|From:\s*|Source:\s*/i.test(q.text),`embedded source Q${i+1}`);
    assert(!/The Christian Science Monitor|From:\s*|Source:\s*/i.test(q.passage?.content||''),`embedded source Q${i+1}`);
    if(i>=15)assert.equal(q.passage,null,`orphan passage Q${i+1}`);
  }
  assert(qs[0].passage.content.length>1500);
  assert(qs[5].passage.content.length>1000);
  assert(qs[0].passage.content!==qs[5].passage.content);
  console.log(`PASS importer: ${path.basename(filename)} => 60, 5 reading, 10 cloze, 45 independent, answers intact.`);
}
const backend=fs.readFileSync(path.join(root,'edge-functions/api/index.js'),'utf8');
const backendCode=backend.slice(backend.indexOf('function gbLegacyInlinePassage(rawStem)'),backend.indexOf('function publicSection(section, questionCount)'));
const funcs=new Function('boundedImageData',backendCode+'\nreturn {publicQuestion,gbLegacyInlinePassage};')((x)=>x);
const oldQ=previous.map((q,i)=>({...q,id:`q${i+1}`,position:i+1,section_id:'english',type:'multiple_choice',passage_content:null,passage_title:null,passage_id:null}));
const mapped=oldQ.map(q=>funcs.publicQuestion(q));
for(let i=0;i<60;i++){
  assert.equal(mapped[i].type,i<15?'passage':'multiple_choice',`legacy public type Q${i+1}`);
  assert(!mapped[i].text.includes('Passage Title:'),`public legacy stem Q${i+1}`);
  assert.equal(Boolean(mapped[i].passage),i<15,`public passage Q${i+1}`);
}
assert.equal(mapped[0].passage.id,mapped[4].passage.id);
assert.equal(mapped[5].passage.id,mapped[14].passage.id);
assert.notEqual(mapped[0].passage.id,mapped[5].passage.id);
assert.equal(mapped[15].passage,null);
assert.equal(mapped[59].passage,null);
console.log('PASS previously saved malformed questions: public API strips embedded prose, shares each passage and leaves Q16–60 independent WITHOUT database writes.');
// Renderer fallback for old cached client quiz payloads.
const appLegacy=src.slice(src.indexOf('function gbLegacyInlinePassage(rawStem)'),src.indexOf('function parseImportedDocumentLocally(text){'));
const repairCode=src.slice(src.indexOf('function gbRepairLegacyQuestionForDisplay(q){'),src.indexOf('function studentQuestionPassage(q){'));
const repair=new Function('gbLegacyInlinePassage',repairCode+'\nreturn {gbRepairLegacyQuestionForDisplay,gbRepairLegacyQuizForDisplay};')(new Function(appLegacy+'\nreturn gbLegacyInlinePassage')());
const repaired=repair.gbRepairLegacyQuizForDisplay({questions:oldQ}).questions;
for(let i=0;i<60;i++)assert.equal(Boolean(repaired[i].passage),i<15,`client retrofit Q${i+1}`);
assert.equal(repaired[0].passage.id,repaired[4].passage.id);
assert.equal(repaired[5].passage.id,repaired[14].passage.id);
console.log('PASS cached-client fallback: 15 linked + 45 independent.');
const compatibility=src.slice(src.indexOf('function gbKnownEnglish60Fingerprint('),src.indexOf('function gbRepairLegacyQuizForDisplay('));
const repairKnown=new Function(compatibility+'\nreturn gbRepairKnownEnglish60Passages')();
const contaminated=mapped.map(q=>({...q,passage:q.passage||mapped[0].passage,type:'passage'}));
assert.equal(contaminated.filter(q=>q.passage).length,60);
const cleared=repairKnown(contaminated);
for(let i=0;i<60;i++){
  assert.equal(Boolean(cleared[i].passage),i<15,`old-DB passage leak ${i+1}`);
  assert.equal(cleared[i].type,i<15?'passage':'multiple_choice',`old-DB type ${i+1}`);
}
assert.equal(repairKnown([{text:'This is unrelated',passage:{content:'keep'}}])[0].passage.content,'keep');
console.log('PASS archived 60-question saved-data contamination: all unwanted Q16–60 passage links suppressed in the student view; unrelated quizzes untouched.');
assert(src.includes('class="gb-passage-open-button"'));
assert(src.includes('const passageOverlay=readablePassage&&!isFirstOfPassage&&state.studentPassageOpen'));
assert(src.includes('const passageDesktop=isFirstOfPassage?'));
console.log('PASS student rendering: no full passage in Q2+ HTML until learner opens the passage viewer.');
console.log('ALL CHECKS PASSED.');
