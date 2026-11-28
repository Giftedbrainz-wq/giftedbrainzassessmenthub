import fs from 'node:fs';
import assert from 'node:assert/strict';
import handler from './edge-functions/api/index.js';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const daily=fs.readFileSync(new URL('./daily-challenge-v51.11.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('./edge-functions/api/index.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./upgrade-v51.15.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('./schema_upgrade_v51_15.sql',import.meta.url),'utf8');
const cases=[
 ['UUID name-shadow fix', !api.includes('const isUuid = /^[0-9a-f]')&&api.includes('const identifierIsUuid =')&&api.includes('isUuid(activeId)')],
 ['Candidate name visible on start',app.includes('gb-name-identity')&&app.includes('candidateSavedName')],
 ['Leaderboard shows time on podium & rows',app.includes('function leaderboardTime')&&(app.match(/gb-rank-time/g)||[]).length>=2],
 ['Admin CBT searchable',app.includes('function filterAdminCbts()')&&app.includes('gbCbtSearch')],
 ['Admin library picker searchable',app.includes('filterLibraryPicker(this)')],
 ['Student library searchable',app.includes('function filterPublicLibraryCbts(')],
 ['Main CBT auto next protected',app.includes('gbAutoNextTimer=setTimeout(')&&app.includes('nextStudent()')],
 ['Pool Practice auto next protected',app.includes('gbPoolAutoNextTimer=setTimeout(')],
 ['Countdown every second',app.includes('gbScheduleClock=setInterval(tick,1000)')],
 ['AI quiz review after submission',app.includes('gbLoadPersonalReview(false)')&&api.includes("action==='attempt-ai-review'")],
 ['Math batch validation',api.includes('function checkGeneratedMath(q)')],
 ['Photo camera & preview',daily.includes('capture="environment"')&&daily.includes('dailyPhotoPreview')],
 ['Photo transport + vision transcription',daily.includes('answerImageData:photoMode?dailyUi.photoImage')&&api.includes('async function challengeTranscribePhoto')],
 ['Legible-only photo grade',api.includes('const noLegiblePhotoWork=')&&api.includes('needs_review:!photoAnswer')],
 ['Photo result embargo',api.includes('challenge-grade-submitted')&&api.includes('Return no score, rubric or answer before scheduled release')],
 ['Photo private admin-only retrieval',api.includes("action==='challenge-answer-image'")&&api.includes('storage/v1/object/authenticated/daily_answer_images')],
 ['Official branding, not GB monogram',daily.includes('gb-daily-hero-type')&&!daily.includes('>GB</span>')],
 ['Custom CSS included last',html.includes('upgrade-v51.15.css?v=51.15.0')&&css.includes('.gb-daily-premium-hero')],
 ['DB migration included',sql.includes('answer_image_path')&&sql.includes('ai_review_started_at')&&sql.includes('daily_answer_images')],
 ['Browser camera allowed by policy',api.includes("camera=(self), microphone=(), geolocation=()")],
];
for(const [name,ok] of cases){assert.ok(ok,`FAILED: ${name}`);console.log('PASS',name)}
const contexts=[
 {method:'OPTIONS',url:'https://assessment.example/api?action=public-quiz',expected:204},
 {method:'POST',url:'https://assessment.example/api?action=attempt-ai-review',body:{},expected:401},
 {method:'POST',url:'https://assessment.example/api?action=challenge-grade-submitted',body:{},expected:400},
];
for(const test of contexts){const request=new Request(test.url,{method:test.method,headers:test.body?{'content-type':'application/json'}:{},body:test.body?JSON.stringify(test.body):undefined});const result=await handler({request,env:{}});assert.equal(result.status,test.expected,`${test.method} ${test.url}`);console.log('PASS API route',test.method,new URL(test.url).searchParams.get('action'),result.status)}
console.log('ALL STATIC & ROUTE SMOKE TESTS PASSED',cases.length+contexts.length);
