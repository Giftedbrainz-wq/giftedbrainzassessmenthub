import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../edge-functions/api/index.js';

// Stubs the external services, not the integration protocol; signed bytes are independently verified.
const deviceId='a53e4e44-1111-4111-8111-abc123abc123';
const secret='for-testing-only-very-long-shared-secret-2026-11';
const env={SUPABASE_URL:'https://db.example.supabase.co',SUPABASE_SECRET_KEY:'test-key',ASSESSMENT_HUB_SYNC_SECRET:secret,EDUSPACE_BASE_URL:'https://edu.example.org'};
const links=new Map(),events=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async (input,init={})=>{
  const url=new URL(String(input));
  if(url.hostname==='edu.example.org') {
    assert.equal(url.pathname,'/api/integrations/assessment-hub/events');
    const stamp=init.headers['x-gb-hub-timestamp'];
    const signature=init.headers['x-gb-hub-signature'];
    const expected='sha256='+crypto.createHmac('sha256',secret).update(stamp+'.'+init.body).digest('hex');
    assert.equal(signature,expected,'HMAC must match exact timestamp and JSON bytes');
    assert.ok(Math.abs(Math.floor(Date.now()/1000)-Number(stamp))<20);
    const event=JSON.parse(init.body);
    if(event.type==='account.linked')assert.equal(event.linkCode,'ABCD1234EFGH');
    events.push(event);
    return Response.json({ok:true});
  }
  assert.equal(url.hostname,'db.example.supabase.co');
  assert.equal(url.pathname,'/rest/v1/eduspace_device_links');
  const method=String(init.method||'GET').toUpperCase();
  const id=url.searchParams.get('device_id')?.replace(/^eq\./,'') || deviceId;
  if(method==='GET')return Response.json(links.has(id)?[links.get(id)]:[]);
  if(method==='POST'){const row=JSON.parse(init.body);links.set(row.device_id,row);return Response.json([row]);}
  if(method==='DELETE'){links.delete(id);return new Response(null,{status:204});}
  throw Error('Unexpected fetch method');
};
const call=async(action,method='GET',body,opts={})=>{
  const r=await handler({request:new Request(`https://hub.example.org/api?action=${action}`,{method,headers:{'x-device-id':opts.deviceId||deviceId,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env:{...env,...opts.env}});
  return {status:r.status,data:await r.json()};
};
try{
  const before=await call('eduspace-status');
  assert.equal(before.status,200);assert.equal(before.data.linked,false);
  const invalid=await call('eduspace-connect','POST',{code:'short'});
  assert.equal(invalid.status,400);assert.equal(events.length,0);
  const valid=await call('eduspace-connect','POST',{code:'ABCD1234EFGH'});
  assert.equal(valid.status,200,JSON.stringify(valid.data));
  assert.equal(valid.data.linked,true);
  assert.equal(events.length,1);assert.equal(events[0].type,'account.linked');
  assert.match(events[0].externalUserId,/^device:[0-9a-f]{64}$/);
  assert.ok(!links.get(deviceId).linkCode,'Code must not be saved in Hub database');
  const after=await call('eduspace-status');
  assert.equal(after.data.linked,true);assert.equal(after.data.returnUrl,'https://edu.example.org/learning-centre.html');
  const disconnect=await call('eduspace-disconnect','POST',{});
  assert.equal(disconnect.status,200);assert.equal(disconnect.data.linked,false);
  assert.equal(events.at(-1).type,'account.unlinked');
  assert.equal(links.size,0);
  const disabled=await call('eduspace-connect','POST',{code:'ABCD1234EFGH'},{env:{ASSESSMENT_HUB_SYNC_SECRET:'weak'}});
  assert.equal(disabled.status,503);
  console.log('PASS: signed one-time pairing, per-device persistence, unlink, and missing-secret rejection');
} finally {globalThis.fetch=originalFetch;}
