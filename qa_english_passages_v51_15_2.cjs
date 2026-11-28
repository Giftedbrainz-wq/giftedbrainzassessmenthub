const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const code=app.slice(app.indexOf('function parseImportedPassageSection('),app.indexOf('// AI extraction is bounded'));
const f=new Function('MAX_DOCUMENT_EXTRACTION_QUESTIONS','$',code+'\nreturn {parseImportedDocumentLocally};');
const importer=f(1000,()=>null);
const master=fs.readFileSync('/mnt/data/Gifted_Brainz_UTME_2027_Use_of_English_60_REFORMATTED.txt','utf8');
const questions=importer.parseImportedDocumentLocally(master);
assert.equal(questions.length,60);
for(let i=0;i<60;i++){
 const q=questions[i];
 assert.equal(q.answer!==null,true,'answer '+(i+1));
 assert.equal(q.options.length,4,'options '+(i+1));
 assert(q.options.every(Boolean),'nonempty options '+(i+1));
 assert(!q.options.some(x=>/END OF PASSAGE|SECTION [A-Z]:|Passage Title:/i.test(x)),'polluted option '+(i+1));
 assert(!/\b(?:from:|source:)\s*the christian science monitor/i.test(q.passage?.content||''),'unwanted source line '+(i+1));
 assert.equal(q.type,i<15?'passage':'multiple_choice','type '+(i+1));
 if(i<5)assert.equal(q.passage?.title,'Comprehension Passage I 📖','reading title '+(i+1));
 else if(i<15)assert.equal(q.passage?.title,'Cloze Passage I 📖','cloze title '+(i+1));
 else assert.equal(q.passage,null,'independent question '+(i+1));
}
console.log('PASS: 60 questions, 5 reading-linked, 10 cloze-linked, 45 standalone; no source lines or section leakage.');
// Headerless and repeated-passage input regression cases.
const keys='ANSWER KEY\n1. A\n2. C\n3. B';
const single='PASSAGE TITLE: Demo Title\nA short passage for question group.\n1. What follows?\nA. one\nB. two\nC. three\nD. four\n2. Choose.\nA. one\nB. two\nC. three\nD. four\nEND OF PASSAGE\nSECTION B: VOCABULARY\n3. Pick a word.\nA. yes\nB. no\nC. a\nD. b\n'+keys;
const parts=importer.parseImportedDocumentLocally(single);
assert.equal(parts.length,3);assert.equal(parts[0].type,'passage');assert.equal(parts[1].type,'passage');assert.equal(parts[2].type,'multiple_choice');
console.log('PASS: marker reliably terminates reading scope.');
