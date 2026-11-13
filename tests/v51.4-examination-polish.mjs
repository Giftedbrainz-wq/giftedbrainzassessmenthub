import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../refinements-v51.4.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../edge-functions/api/index.js',import.meta.url),'utf8');
const slice=(a,b)=>{const start=app.indexOf(a),end=app.indexOf(b,start);assert.ok(start>=0&&end>start,a);return app.slice(start,end)};
const excerpt=[
 'const MAX_DOCUMENT_EXTRACTION_QUESTIONS=1000;',
 slice('function parseImportedPassageSection(', 'function parseImportedDocumentLocally('),
 slice('function parseImportedDocumentLocally(', '// AI extraction is bounded'),
 slice('function questionStemHtml(', 'function studentQuestionPassage('),
 slice('function studentQuestionPassage(', 'function studentPassageIsOpen(')
].join('\n');
const context={console,Array,Set,Map,Math,Number,String,$:()=>null,mathHtml:txt=>String(txt??'').replaceAll('<','&lt;'),esc:txt=>String(txt??'').replaceAll('<','&lt;')};
vm.createContext(context);vm.runInContext(excerpt,context);
for(const [title,doc] of [
 ['My Moon Title','Passage C: My Moon Title\nThe first paragraph is about the moon.\n\nThe second paragraph says something else.'],
 ['My Named Title','Passage Title: My Named Title\nA first paragraph.\nA second paragraph.'],
 ['Original Heading','Passage II\nTitle: Original Heading\nThe first paragraph.\nThe second paragraph.']
]){
 const p=vm.runInContext('parseImportedPassageSection(DOC)',Object.assign(context,{DOC:doc}));
 assert.equal(p.title,title,'custom heading must not be overwritten');
 assert.ok(p.content.includes('\n'),'paragraph breaks must survive');
}
console.log('PASS custom passage titles and newlines preserved');
const result=vm.runInContext('parseImportedDocumentLocally(DOC)',Object.assign(context,{DOC:'Passage C: Exactly This Title\nParagraph one about planets.\n\nParagraph two about orbits.\n\n1. What is the topic?\nA. Stars\nB. Planets\nC. Trees\nD. Oceans\n\n2. Who is writing?\nA. A traveller\nB. A pilot\nC. An observer\nD. A historian\n\nANSWER KEY\n1. B\n2. C'}));
assert.equal(result.length,2);assert.equal(result[0].passage.title,'Exactly This Title');assert.equal(result[1].passage.title,'Exactly This Title');
assert.ok(result[0].passage.content.includes('\n\n'));
console.log('PASS imported questions retain one original passage title across questions');
const passageHtml=vm.runInContext('studentQuestionPassage(Q)',Object.assign(context,{Q:{passage:{title:'Custom Title',content:'First paragraph.\n\nSecond paragraph.'}}}));
assert.match(passageHtml,/Custom Title/);assert.equal((passageHtml.match(/<p>/g)||[]).length,2);
console.log('PASS Study/CBT passage output uses distinct paragraphs');
const roman=vm.runInContext('questionStemHtml(T)',Object.assign(context,{T:'Which statements are correct? I. Breathing II. Growth III. Reproduction IV. Motion'}));
assert.equal((roman.match(/gb-roman-item/g)||[]).length,4);assert.match(roman,/III\./);
assert.doesNotMatch(vm.runInContext('questionStemHtml(T)',Object.assign(context,{T:'I. love all science topics.'})),/gb-roman-item/);
console.log('PASS multiple Roman-numeral statements show separate rows; ordinary text unaffected');
assert.match(css,/\.gb-exam-actions>\.btn:nth-child\(3\)/);
assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
assert.match(css,/\.gb-answer-letter/);
assert.match(css,/\.student-card\.library-public/);
assert.match(index,/refinements-v51\.4\.css/);
assert.match(app,/\$\{calculatorToolButton\(\)\}/);
assert.match(app,/id="calculatorRoot"/);
assert.doesNotMatch(slice('function toggleCalculator(', 'function safeCalculate('),/Decimals appear as 0\.8/);
assert.match(backend,/original paragraph newline/);
console.log('PASS answer colours, twin navigation buttons, shared pool calculator, responsive spacing and no instructional calculator text');
