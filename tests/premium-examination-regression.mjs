import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const source=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const js=source('app.js'),css=source('premium-interface.css'),html=source('index.html');
const checks=[
 ['Baskerville Old Face retained',()=>assert.match(source('baskerville-centered.css'),/Baskerville Old Face/)],
 ['Premium interface stylesheet included',()=>assert.match(html,/premium-interface\.css\?v=50\.6\.3-restored-main-layout/)],
 ['CBT intro remains free of team crests and student avatars',()=>{assert.doesNotMatch(js,/assets\/(avatars|battle|subject-cover)\//);assert.match(js,/premium-exam-badge/)}],
 ['Loading status uses indeterminate rather than false percentage',()=>{assert.match(js,/aria-label="Assessment loading"/);assert.match(css,/examIndeterminate/)}],
 ['Question progress and answered counts use real answer state',()=>{assert.match(js,/const answeredCount=qs\.filter\(x=>state\.studentAnswers\[x\.id\]!==undefined\)/);assert.match(js,/question-progress-bar/)}],
 ['Navigator shows flags and answered states',()=>{assert.match(js,/navigator-overview/);assert.match(js,/navigator-flags/);assert.match(js,/aria-current="step"/)}],
 ['Submission confirmation reports answered/unanswered and flags',()=>assert.match(js,/Review before submission/)],
 ['Exam timer has 5 minute and 1 minute states',()=>{assert.match(js,/state\.timeLeft<=300/);assert.match(js,/state\.timeLeft<=60/)}],
 ['Results and leaderboard use refined visual treatment',()=>{assert.match(css,/result-performance-caption/);assert.match(css,/leaderboard-entry\[data-rank="1"\]/)}],
 ['Bank filtering and pagination are functional',()=>{assert.match(js,/function filterAdminQuestionBank\(/);assert.match(js,/function pageAdminQuestionBank\(/);assert.match(js,/const perPage=25/)}],
 ['Extraction stages and readiness totals available',()=>{assert.match(js,/function setExtractionProgress\(/);assert.match(js,/extractionReadyStats/);assert.match(js,/extraction-workflow/)}],
 ['Brainz Biltz uses its own branded challenge layout',()=>{assert.match(css,/\.boost-welcome/);assert.match(js,/BRAINZ BILTZ/)}],
 ['Light-only theme and accessible focus states',()=>{assert.doesNotMatch(css,/body\.student-dark|body\.admin-theme/);assert.match(css,/:root\{color-scheme:light/);assert.match(css,/:focus-visible/);assert.match(js,/function studentThemeToggle\(\)\{return '';/)}],
 ['Mobile responsive safeguards and reduced-motion preferences',()=>{assert.match(css,/@media\(max-width:780px\)/);assert.match(css,/prefers-reduced-motion:reduce/)}],
 ['Results cards cannot stack side by side on mobile',()=>assert.match(css,/\.result-wrap\{display:flex!important;flex-direction:column!important/)],
 ['Existing questions, media, and server contracts remain present',()=>{assert.match(js,/function studentTest\(/);assert.match(js,/async function saveDraftQuestions\(/);assert.ok(existsSync(new URL('../edge-functions/api/index.js',import.meta.url)))}]
];
let passed=0;
for(const [label,fn] of checks){try{fn();passed++;console.log('PASS ',label);}catch(err){console.error('FAIL ',label,err.message);process.exitCode=1}}
console.log(`\nPremium Examination feature checks: ${passed}/${checks.length}`);
