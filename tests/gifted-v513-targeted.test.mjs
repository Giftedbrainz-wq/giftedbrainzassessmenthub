import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../edge-functions/api/index.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../gifted-brand-enhancements-v51.3.css',import.meta.url),'utf8');
function sourceFunction(content,start,end){const startIdx=content.indexOf(`function ${start}(`);assert.ok(startIdx>=0);const endIdx=content.indexOf(`function ${end}(`,startIdx+10);assert.ok(endIdx>startIdx);return content.slice(startIdx,endIdx);}
test('calculator evaluates decimals and brackets safely without Function eval',()=>{
 const sandbox={};vm.createContext(sandbox);
 vm.runInContext(sourceFunction(app,'safeCalculate','calcPress'),sandbox);
 for(const [expr,expected] of [['0.8','0.8'],['1.2+2.3','3.5'],['(1+2)×3','9'],['1÷2','0.5'],['0.2+0.8','1'],['5−7','-2']])assert.equal(sandbox.safeCalculate(expr),expected);
 assert.throws(()=>sandbox.safeCalculate('alert(1)'));
 assert.throws(()=>sandbox.safeCalculate('1/0'));
});
test('reading passages are fetched from linked IDs across pool study and practice',async()=>{
 const records=new Map([['11111111-1111-4111-8111-111111111111',{id:'11111111-1111-4111-8111-111111111111',title:'Reading',content:'A complete passage.'}]]);
 const sandbox={isUuid:id=>/^[a-f0-9-]{36}$/.test(id),enc:encodeURIComponent,sb:async(_ctx,_table,{query})=>[...records.values()].filter(p=>query.includes(p.id))};
 vm.createContext(sandbox);vm.runInContext('async '+sourceFunction(api,'withPoolPassages','currentPoolCycle').replace(/\s+async\s*$/, ''),sandbox);const result=await sandbox.withPoolPassages({},[{id:'q1',passage_id:'11111111-1111-4111-8111-111111111111'},{id:'q2',passage_id:'22222222-2222-4222-8222-222222222222'}]);assert.equal(result[0].passage_content,'A complete passage.');assert.equal(result[1].passage_missing,true);
});
test('new source contains student-facing results links, saved names and gold accents',()=>{
 assert.match(app,/\?result=\$\{encodeURIComponent\(q\.result_slug\|\|q\.id\)\}/);
 assert.match(app,/candidateSavedName\(\)/);
 assert.match(app,/copyResultsUrl/);
 assert.match(css,/#c99b47/i);
 assert.match(api,/pool_questions=await withPoolPassages/);
 assert.match(app,/boost-register/);
});
