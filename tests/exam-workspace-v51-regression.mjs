import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const app=read('app.js'),css=read('exam-workspace-v51.css'),index=read('index.html');
const requirements=[
  ['v51 examination stylesheet is loaded last',()=>{assert.match(index,/exam-workspace-v51\.css\?v=51\.0\.0/);assert.ok(index.indexOf('exam-workspace-v51.css')>index.indexOf('unified-typography.css'));}],
  ['dedicated indeterminate loading screen',()=>{assert.match(app,/function studentLoadingMarkup\(/);assert.match(app,/gb-fullscreen-loading/);assert.match(css,/\.gb-fullscreen-loading/);assert.doesNotMatch(app.slice(app.indexOf('function studentLoadingMarkup('),app.indexOf('function renderStudent(')),/student-loading-card/);}],
  ['real quiz navigation remains backed by answer/flag state',()=>{assert.match(app,/const answeredCount=qs\.filter\(x=>state\.studentAnswers\[x\.id\]!==undefined\)\.length/);assert.match(app,/const flaggedCount=qs\.filter\(x=>state\.studentFlags\.has\(x\.id\)\)\.length/);assert.match(app,/goStudent\(\$\{i\}\)/);}],
  ['CBT header shows live timer and progress',()=>{assert.match(app,/id="studentTimer"/);assert.match(app,/gb-exam-header-progress/);assert.match(app,/gb-exam-question-toggle/);}],
  ['mobile navigation is a separate accessible panel',()=>{assert.match(app,/toggleExamNavigator\(/);assert.match(app,/aria-expanded="false"/);assert.match(css,/gb-exam-navigator-open/);assert.match(css,/@media\(max-width:860px\)/);}],
  ['questions avoid public answer key leakage',()=>{assert.match(app,/isStudentOptionSelected\(q,i\)/);assert.match(app,/chooseStudentAnswer\('/);assert.doesNotMatch(app.slice(app.indexOf('function studentTest(){'),app.indexOf('function toggleCalculator()')),/correctAnswer/);}],
  ['passage support desktop and mobile',()=>{assert.match(app,/gb-exam-passage-desktop/);assert.match(app,/gb-exam-passage-mobile/);assert.match(app,/studentQuestionPassage\(q\)/);assert.match(app,/missingPassage/);}],
  ['submission safety remains connected',()=>{assert.match(app,/onclick="confirmSubmit\(\)"/);assert.match(app,/Review before submission/);assert.match(app,/const questions=state\.studentQuiz\?\.questions/);}],
  ['question pool study and practice include mobile question controls',()=>{assert.equal((app.match(/class="cbt-shell gb-pool-exam"/g)||[]).length,2);assert.equal((app.match(/onclick="togglePoolNavigator\(\)"/g)||[]).length,2);}],
  ['readability, responsive support and reduced motion',()=>{assert.match(css,/\.gb-exam-question \.cbt-option/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/focus-visible/);}],
  ['business logic remains separate from view',()=>{assert.match(app,/async function submitStudent\(/);assert.match(app,/function persistStudentProgress\(/);assert.match(app,/function correctionDisplay\(/);assert.match(index,/channel-prompt\.js/);}]
];
let count=0;
for(const [name,test] of requirements){try{test();console.log('PASS',name);count++;}catch(e){console.error('FAIL',name,'\n',e.message);process.exitCode=1;}}
console.log(`${count}/${requirements.length} CBT workspace checks passed`);
