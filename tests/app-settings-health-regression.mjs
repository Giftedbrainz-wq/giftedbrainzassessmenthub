import assert from 'node:assert/strict';
import handler from '../edge-functions/api/index.js';

const originalFetch = globalThis.fetch;
const selected = [];
globalThis.fetch = async input => {
  const url = new URL(String(input));
  const table = url.pathname.split('/').pop();
  const projection = url.searchParams.get('select');
  selected.push({table, projection});
  if (table === 'app_settings' && projection === 'id') {
    return new Response(JSON.stringify({message: 'column app_settings.id does not exist'}), {status:400, headers:{'content-type':'application/json'}});
  }
  return new Response(JSON.stringify([{[projection || 'id']: 'ok'}]), {status:200, headers:{'content-type':'application/json'}});
};
try {
  const res = await handler({
    request: new Request('https://example.test/api?action=health'),
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test_secret', GROQ_API_KEY: 'test_ai' }
  });
  const data = await res.json();
  assert.equal(data.databaseOk, true, data.databaseError);
  assert.ok(selected.some(x=>x.table==='app_settings' && x.projection==='key'));
  assert.ok(selected.some(x=>x.table==='quizzes' && x.projection==='id'));
  assert.equal(selected.filter(x=>x.table==='app_settings' && x.projection==='id').length,0);
  console.log('PASS health checks app_settings.key, while other tables use id');
} finally {
  globalThis.fetch = originalFetch;
}
