import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../edge-functions/api/index.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../study-mode-v51.2.css',import.meta.url),'utf8');
const tests=[
 ['admin chooses study or practice and settings retain the choice',()=>{assert.match(app,/qAssessmentMode/);assert.match(api,/assessmentMode: s\.assessmentMode === 'study' \? 'study' : 'practice'/);} ],
 ['study uses no exam timer and immediate feedback on selecting an option',()=>{assert.match(app,/Study Mode · No timer/);assert.match(app,/attempt-study-feedback/);assert.match(app,/state\.studentStudyFeedback\[id\]=feedback/);} ],
 ['feedback restricted to signed started study attempts and the right device',()=>{assert.match(api,/verifyAttemptToken\(context,body\.attemptToken/);assert.match(api,/status!==\x27started\x27/);assert.match(api,/deviceIdForRequest\(request,body\)/);assert.match(api,/assessmentMode!==\x27study\x27/);} ],
 ['Brainz Biltz cannot retrieve study answers',()=>assert.match(api,/Immediate feedback is unavailable during a Brainz Biltz competition/)],
 ['light and readable feedback styling is used',()=>{assert.match(css,/#edf9f3/);assert.match(css,/#fff5ee/);assert.match(html,/study-mode-v51\.2\.css/);} ],
 ['loading logo has local same-origin fallback',()=>{assert.match(app,/src="\/assets\/icon\.png" onerror="this\.onerror=null;this\.src='\/assets\/logo-full\.png'"/);} ],
];
for(const [name,fn] of tests){try{fn();process.stdout.write('PASS '+name+'\n')}catch(e){process.stderr.write('FAIL '+name+' '+e.message+'\n');process.exitCode=1}}
