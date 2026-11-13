import assert from 'node:assert/strict';
import handler from '../edge-functions/api/index.js';

const privateLibraryId = '223e4567-e89b-12d3-a456-426614174000';
const publicLibraryId  = '323e4567-e89b-12d3-a456-426614174000';
const privateQuizId    = '423e4567-e89b-12d3-a456-426614174000';
const publicQuizId     = '523e4567-e89b-12d3-a456-426614174000';
const standalonePrivateQuizId = '723e4567-e89b-12d3-a456-426614174000';
const secondStandalonePrivateQuizId = '923e4567-e89b-12d3-a456-426614174000';
const questionId       = '623e4567-e89b-12d3-a456-426614174000';
const approvedDevice   = 'approved-device-12345';
const privateResultToken = 'private-result-token-12345';
const sessionSecret = 'mock-session-secret-for-regression-tests';
const biltzQuizId = 'a2345678-e89b-12d3-a456-426614174001';
const biltzChallengeId = 'b2345678-e89b-12d3-a456-426614174002';
const biltzParticipantId = 'c2345678-e89b-12d3-a456-426614174003';
const biltzAttemptId = 'd2345678-e89b-12d3-a456-426614174004';
const biltzDevice = 'registered-biltz-device-123';
const biltzResultToken = 'private-biltz-result-token-123';

async function makeAttemptToken(attemptId, quizId) {
  const payload = { sub: 'attempt', attemptId, quizId, exp: Date.now() + 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded))).toString('base64url');
  return `${encoded}.${signature}`;
}

const tables = {
  cbt_libraries: [
    { id: privateLibraryId, slug: 'bio-private', name: 'Biology Private', description: 'Restricted library', access_mode: 'private' },
    { id: publicLibraryId, slug: 'general-public', name: 'General Public', description: 'Open library', access_mode: 'public' }
  ],
  cbt_library_items: [
    { id: '1', library_id: privateLibraryId, quiz_id: privateQuizId, position: 0, created_at: '2026-01-01T00:00:00Z' },
    { id: '2', library_id: publicLibraryId, quiz_id: publicQuizId, position: 0, created_at: '2026-01-01T00:00:00Z' }
  ],
  cbt_library_device_access: [
    { id: 'device-access-1', library_id: privateLibraryId, device_id: approvedDevice, is_active: true }
  ],
  quiz_device_access: [],
  app_settings: [{ key: 'administrator_whatsapp', value: '2348156767275' }],
  quizzes: [
    { id: privateQuizId, slug: 'private-biology', title: 'Private Biology CBT', description: 'Restricted assessment', duration: 30, pass_mark: 50, settings: { leaderboardEnabled: true, resultEnabled: true, reviewEnabled: true }, status: 'published', result_released: true, result_slug: 'private-result-slug', access_mode: 'public' },
    { id: publicQuizId, slug: 'public-general', title: 'General Public CBT', description: 'Open assessment', duration: 20, pass_mark: 50, settings: { leaderboardEnabled: true, resultEnabled: true, reviewEnabled: true }, status: 'published', result_released: true, result_slug: 'public-result-slug', access_mode: 'public' },
    { id: standalonePrivateQuizId, slug: 'private-standalone', title: 'Standalone Private Quiz', description: 'Private quiz without a library', duration: 25, pass_mark: 50, settings: { leaderboardEnabled: true, resultEnabled: true, reviewEnabled: true }, status: 'published', result_released: true, result_slug: 'private-standalone-result', access_mode: 'private' },
    { id: secondStandalonePrivateQuizId, slug: 'private-standalone-two', title: 'Another Standalone Private Quiz', description: 'Second private quiz', duration: 25, pass_mark: 50, settings: { leaderboardEnabled: true, resultEnabled: true, reviewEnabled: true }, status: 'published', result_released: true, result_slug: 'private-standalone-two-result', access_mode: 'private' },
    { id: biltzQuizId, slug: 'biltz-private-biology', title: 'Brainz Biltz Biology', description: 'Challenge-linked assessment', duration: 30, pass_mark: 50, settings: { leaderboardEnabled: true, resultEnabled: true, reviewEnabled: true }, status: 'published', result_released: false, result_slug: 'biltz-shared-result-slug', access_mode: 'public' }
  ],
  attempts: [
    { id: 'attempt-private-1', quiz_id: privateQuizId, device_id: approvedDevice, attempt_no: 1, result_token: privateResultToken, student_name: 'Approved User', score: 8, total: 10, percent: 80, pass_mark: 50, time_used: 300, status: 'submitted', submitted_at: '2026-01-01T00:00:00Z' },
    { id: 'attempt-private-standalone', quiz_id: standalonePrivateQuizId, device_id: 'previous-device-1234', attempt_no: 1, result_token: 'private-standalone-result-token', student_name: 'Standalone Student', score: 7, total: 10, percent: 70, pass_mark: 50, time_used: 200, status: 'submitted', submitted_at: '2026-01-03T00:00:00Z' },
    { id: 'public-attempt-first', quiz_id: publicQuizId, device_id: 'participant-device-1', attempt_no: 1, student_name: 'Participant One', score: 4, total: 10, percent: 40, time_used: 300, status: 'submitted', submitted_at: '2026-01-01T00:00:00Z' },
    { id: 'public-attempt-retake', quiz_id: publicQuizId, device_id: 'participant-device-1', attempt_no: 2, student_name: 'Participant One', score: 10, total: 10, percent: 100, time_used: 250, status: 'submitted', submitted_at: '2026-01-02T00:00:00Z' },
    { id: 'public-attempt-other', quiz_id: publicQuizId, device_id: 'participant-device-2', attempt_no: 1, student_name: 'Participant Two', score: 6, total: 10, percent: 60, time_used: 280, status: 'submitted', submitted_at: '2026-01-01T01:00:00Z' },
    { id: biltzAttemptId, quiz_id: biltzQuizId, device_id: biltzDevice, attempt_no: 1, result_token: biltzResultToken, student_name: 'Biltz Participant', score: 1, total: 1, percent: 100, pass_mark: 50, time_used: 45, status: 'submitted', submitted_at: '2026-01-02T00:00:00Z' }
  ],
  questions: [
    { id: questionId, quiz_id: privateQuizId, text: 'Question', options: ['A', 'B', 'C', 'D'], answer: 0, marks: 1, image_data: 'data:image/png;base64,AAAA' },
    { id: 'f2345678-e89b-12d3-a456-426614174005', quiz_id: biltzQuizId, section_id: null, subject: 'Biology', text: 'Biltz question', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 1, explanation: 'Challenge explanation', marks: 1, passage_id: null, image_data: null }
  ],
  quiz_sections: [],
  passages: [],
  attempt_answers: [{ attempt_id: biltzAttemptId, question_id: 'f2345678-e89b-12d3-a456-426614174005', selected_answer: 1, is_correct: true, marks: 1 }],
  brainz_biltz_challenges: [{ id: biltzChallengeId, slug: 'private-biology-blitz', title: 'Private Biology Blitz', description: 'Private scheduled challenge', quiz_id: biltzQuizId, cover_image_url: '', start_at: '2026-01-01T00:00:00Z', end_at: '2026-01-03T00:00:00Z', duration_minutes: 30, entry_fee: 500, access_mode: 'private', status: 'published', challenge_only: true, attempt_limit: 1, max_participants: null, finish_policy: 'full_duration', leaderboard_enabled: false, leaderboard_release: 'after_end', review_enabled: false, results_published: false, payment_instructions: '' }],
  brainz_biltz_participants: [{ id: biltzParticipantId, challenge_id: biltzChallengeId, device_id: biltzDevice, participant_name: 'Biltz Participant', status: 'approved' }],
  brainz_biltz_attempts: [{ id: 'e2345678-e89b-12d3-a456-426614174006', challenge_id: biltzChallengeId, participant_id: biltzParticipantId, attempt_id: biltzAttemptId, device_id: biltzDevice, duration_minutes: 30, started_at: '2026-01-02T00:00:00Z' }]
};

function conditionMatches(value, condition) {
  if (condition.startsWith('eq.')) return String(value ?? '') === condition.slice(3);
  if (condition.startsWith('neq.')) return String(value ?? '') !== condition.slice(4);
  if (condition.startsWith('in.(') && condition.endsWith(')')) {
    const values = condition.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''));
    return values.includes(String(value ?? ''));
  }
  if (condition === 'is.true') return value === true;
  if (condition === 'is.false') return value === false;
  if (condition === 'not.is.null') return value !== null && value !== undefined;
  return true;
}

const originalFetch = globalThis.fetch;
let mockSequence = 1;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const match = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
  if (!match) return new Response(JSON.stringify({ message: 'Unexpected mock URL' }), { status: 404 });
  const tableName = decodeURIComponent(match[1]);
  if (!tables[tableName]) tables[tableName] = [];
  const table = tables[tableName];
  const method = String(options.method || 'GET').toUpperCase();
  const params = url.searchParams;
  const matches = (row) => {
    for (const [key, value] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
      if (!conditionMatches(row[key], value)) return false;
    }
    return true;
  };
  const returningMinimal = String(options.headers?.prefer || '').includes('return=minimal');
  if (method === 'POST') {
    const payload = options.body ? JSON.parse(options.body) : {};
    const conflictFields = String(params.get('on_conflict') || '').split(',').filter(Boolean);
    let row = conflictFields.length ? table.find(candidate => conflictFields.every(field => String(candidate[field] ?? '') === String(payload[field] ?? ''))) : null;
    if (row) Object.assign(row, payload);
    else {
      row = { id: payload.id || `mock-${tableName}-${mockSequence++}`, ...payload };
      table.push(row);
    }
    if (returningMinimal) return new Response(null, { status: 204 });
    return new Response(JSON.stringify([row]), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'PATCH') {
    const payload = options.body ? JSON.parse(options.body) : {};
    const changed = [];
    for (const row of table) if (matches(row)) { Object.assign(row, payload); changed.push({ ...row }); }
    if (returningMinimal) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(changed), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'DELETE') {
    const removed = [];
    for (let index = table.length - 1; index >= 0; index--) {
      if (matches(table[index])) removed.push(...table.splice(index, 1));
    }
    if (returningMinimal) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(removed), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  let rows = table.map(row => ({ ...row })).filter(matches);
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || 1000);
  rows = rows.slice(offset, offset + limit);
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
};

async function request(action, { method = 'GET', query = {}, body, deviceId = 'unapproved-device-12345', token = '' } = {}) {
  const url = new URL('https://gifted-brainz.test/api');
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const headers = { 'x-device-id': deviceId };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await handler({ request: req, env: { SUPABASE_URL: 'https://mock.supabase.test', SUPABASE_SECRET_KEY: 'mock-secret', SESSION_SECRET: sessionSecret, ADMIN_PASSWORD: 'admin-test-password' } });
  return { response, data: await response.json() };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('public library remains accessible without device approval', async () => {
  const { response, data } = await request('public-library', { query: { id: 'general-public' }, deviceId: 'unregistered-device-12345' });
  assert.equal(response.status, 200);
  assert.equal(data.library.name, 'General Public');
  assert.equal(data.library.quizzes.length, 1);
  assert.equal(data.library.quizzes[0].slug, 'public-general');
});

test('private library denies unapproved device and returns the required message and device ID', async () => {
  const { response, data } = await request('public-library', { query: { id: 'bio-private' }, deviceId: 'unapproved-device-12345' });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
  assert.equal(data.error, 'You are not eligible to open this library. Contact the administrator for more details.');
  assert.equal(data.deviceId, 'unapproved-device-12345');
  assert.equal(data.librarySlug, 'bio-private');
});

test('approved device can open the private library', async () => {
  const { response, data } = await request('public-library', { query: { id: 'bio-private' }, deviceId: approvedDevice });
  assert.equal(response.status, 200);
  assert.equal(data.library.quizzes[0].slug, 'private-biology');
});

test('individual private CBT URL is blocked for an unapproved device', async () => {
  const { response, data } = await request('public-quiz', { query: { id: 'private-biology' } });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
  assert.equal(data.librarySlug, 'bio-private');
});

test('private question media endpoint is blocked for an unapproved device', async () => {
  const { response, data } = await request('question-media', { query: { quizId: privateQuizId, questionId } });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
});

test('private CBT attempt cannot start from an unapproved device', async () => {
  const { response, data } = await request('attempt-start', { method: 'POST', body: { quizId: privateQuizId, deviceId: 'unapproved-device-12345', studentName: 'Test User' } });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
});

test('private attempt result/corrections cannot be retrieved from an unapproved device', async () => {
  const attemptToken = await makeAttemptToken('attempt-private-1', privateQuizId);
  const { response, data } = await request('attempt', {
    method: 'POST',
    body: { attemptId: 'attempt-private-1', quizId: privateQuizId, attemptToken, deviceId: approvedDevice, answers: {} },
    deviceId: 'unapproved-device-12345'
  });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
  assert.equal(data.librarySlug, 'bio-private');
});

test('approved device can complete/retrieve its private attempt result', async () => {
  const attemptToken = await makeAttemptToken('attempt-private-1', privateQuizId);
  const { response, data } = await request('attempt', {
    method: 'POST',
    body: { attemptId: 'attempt-private-1', quizId: privateQuizId, attemptToken, deviceId: approvedDevice, answers: {} },
    deviceId: approvedDevice
  });
  assert.equal(response.status, 200);
  assert.equal(data.attempt.id, 'attempt-private-1');
});

test('private CBT leaderboard cannot be read from an unapproved device', async () => {
  const { response, data } = await request('leaderboard', { query: { id: privateQuizId } });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
});

test('standalone private quiz denies access and returns a clickable administrator contact number', async () => {
  const device = 'standalone-unapproved-device';
  const { response, data } = await request('public-quiz', { query: { id: 'private-standalone' }, deviceId: device });
  assert.equal(response.status, 403);
  assert.equal(data.quizAccessRequired, true);
  assert.equal(data.accessKind, 'quiz');
  assert.equal(data.quizSlug, 'private-standalone');
  assert.equal(data.deviceId, device);
  assert.equal(data.adminWhatsAppNumber, '2348156767275');
  assert.equal(tables.cbt_library_items.some(item => item.quiz_id === standalonePrivateQuizId), false, 'fixture must not rely on library membership');
});

test('standalone private quiz gates question media, attempts, results, leaderboard and feedback', async () => {
  const device = 'standalone-route-check-device';
  const media = await request('question-media', { query: { quizId: standalonePrivateQuizId, questionId }, deviceId: device });
  assert.equal(media.response.status, 403);
  assert.equal(media.data.quizAccessRequired, true);
  const start = await request('attempt-start', { method: 'POST', deviceId: device, body: { quizId: standalonePrivateQuizId, deviceId: device, studentName: 'Test Student' } });
  assert.equal(start.response.status, 403);
  assert.equal(start.data.quizAccessRequired, true);
  const result = await request('result-access', { query: { token: 'private-standalone-result-token' }, deviceId: device });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.quizAccessRequired, true);
  const board = await request('leaderboard', { query: { id: standalonePrivateQuizId }, deviceId: device });
  assert.equal(board.response.status, 403);
  assert.equal(board.data.quizAccessRequired, true);
  const feedback = await request('feedback-submit', { method: 'POST', deviceId: device, body: { quizId: standalonePrivateQuizId, category: 'technical', message: 'Testing private access block.' } });
  assert.equal(feedback.response.status, 403);
  assert.equal(feedback.data.quizAccessRequired, true);
});

test('standalone private quiz activation is quiz-specific, device-bound, single-use, and revocable', async () => {
  const login = await request('login', { method: 'POST', body: { password: 'admin-test-password' } });
  assert.equal(login.response.status, 200);
  const device = 'standalone-approved-device';
  const registered = await request('quiz-device-code', { method: 'POST', token: login.data.token, body: { quizId: standalonePrivateQuizId, deviceId: device } });
  assert.equal(registered.response.status, 200);
  assert.match(registered.data.activationCode, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
  const record = tables.quiz_device_access.find(row => row.quiz_id === standalonePrivateQuizId && row.device_id === device);
  assert.ok(record);
  assert.match(record.activation_code_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(record.activation_code_hash, registered.data.activationCode);

  const wrongDevice = await request('quiz-device-activate', { method: 'POST', deviceId: 'other-standalone-device', body: { quizSlug: 'private-standalone', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test Student' } });
  assert.equal(wrongDevice.response.status, 403);
  const wrongQuiz = await request('quiz-device-activate', { method: 'POST', deviceId: device, body: { quizSlug: 'private-standalone-two', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test Student' } });
  assert.equal(wrongQuiz.response.status, 403, 'a code issued for one private quiz must not activate another private quiz');

  const activated = await request('quiz-device-activate', { method: 'POST', deviceId: device, body: { quizSlug: 'private-standalone', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test Student' } });
  assert.equal(activated.response.status, 200);
  assert.equal(record.is_active, true);
  assert.equal(record.activation_code_hash, null, 'successful activation consumes the code');
  const opened = await request('public-quiz', { query: { id: 'private-standalone' }, deviceId: device });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.data.quiz.slug, 'private-standalone');
  const replay = await request('quiz-device-activate', { method: 'POST', deviceId: device, body: { quizSlug: 'private-standalone', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test Student' } });
  assert.equal(replay.response.status, 403);

  // The REST mock uses synthetic IDs by default; make this row resemble the UUID generated by Postgres.
  record.id = '823e4567-e89b-12d3-a456-426614174000';
  const expiringDevice = 'standalone-expiring-device';
  const expiring = await request('quiz-device-code', { method: 'POST', token: login.data.token, body: { quizId: standalonePrivateQuizId, deviceId: expiringDevice } });
  assert.equal(expiring.response.status, 200);
  const expiringRecord = tables.quiz_device_access.find(row => row.quiz_id === standalonePrivateQuizId && row.device_id === expiringDevice);
  expiringRecord.activation_expires_at = new Date(Date.now() - 1000).toISOString();
  const expired = await request('quiz-device-activate', { method: 'POST', deviceId: expiringDevice, body: { quizSlug: 'private-standalone', deviceId: expiringDevice, activationCode: expiring.data.activationCode, studentName: 'Test Student' } });
  assert.equal(expired.response.status, 403);
  assert.match(expired.data.error, /expired/i);

  const devices = await request('quiz-device-list', { query: { quizId: standalonePrivateQuizId }, token: login.data.token });
  assert.equal(devices.response.status, 200);
  assert.equal(devices.data.devices.length, 1);
  await request('quiz-device-deactivate', { method: 'POST', token: login.data.token, body: { id: record.id } });
  const revoked = await request('public-quiz', { query: { id: 'private-standalone' }, deviceId: device });
  assert.equal(revoked.response.status, 403, 'revoked device loses quiz access immediately');
});

test('administrator WhatsApp setting can be changed and normalized', async () => {
  const login = await request('login', { method: 'POST', body: { password: 'admin-test-password' } });
  const updated = await request('platform-settings', { method: 'PUT', token: login.data.token, body: { administratorWhatsAppNumber: '08156767275' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.settings.administratorWhatsAppNumber, '2348156767275');
  assert.equal(tables.app_settings.find(row => row.key === 'administrator_whatsapp').value, '2348156767275');
});

test('personal result token cannot bypass a private library restriction', async () => {
  const { response, data } = await request('result-access', { query: { token: privateResultToken } });
  assert.equal(response.status, 403);
  assert.equal(data.accessRequired, true);
  assert.equal(data.librarySlug, 'bio-private');
});

test('public leaderboard uses first submitted attempt, not the best or latest retake', async () => {
  const { response, data } = await request('leaderboard', { query: { id: publicQuizId }, deviceId: 'any-device-12345' });
  assert.equal(response.status, 200);
  const one = data.leaderboard.find(row => row.name === 'Participant One');
  assert.ok(one);
  assert.equal(one.score, 4);
  assert.equal(one.percent, 40);
  assert.equal(data.leaderboard.length, 2);
  assert.ok(!('deviceId' in one), 'internal device IDs must not be exposed in leaderboard output');
});

test('AI question batch save rejects batches larger than 500 with the updated message', async () => {
  const login = await request('login', { method: 'POST', body: { password: 'admin-test-password' } });
  const result = await request('ai-save-batch', { method: 'POST', token: login.data.token, body: { questions: Array.from({ length: 501 }, () => ({})) } });
  assert.equal(result.response.status, 400);
  assert.equal(result.data.error, 'A maximum of 500 questions can be saved at once.');
});

test('administrator authentication is required to generate private-library activation codes', async () => {
  const { response, data } = await request('library-device-code', {
    method: 'POST',
    body: { libraryId: privateLibraryId, deviceId: 'activation-device-1234' }
  });
  assert.equal(response.status, 401);
  assert.match(data.error, /Admin authentication required/i);
});

test('administrator-generated activation code is hashed, device-bound, single-use, and grants library access', async () => {
  const login = await request('login', { method: 'POST', body: { password: 'admin-test-password' } });
  assert.equal(login.response.status, 200);
  assert.ok(login.data.token);
  const device = 'activation-device-1234';
  const registered = await request('library-device-code', {
    method: 'POST',
    token: login.data.token,
    body: { libraryId: privateLibraryId, deviceId: device }
  });
  assert.equal(registered.response.status, 200);
  assert.match(registered.data.activationCode, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
  const record = tables.cbt_library_device_access.find(row => row.library_id === privateLibraryId && row.device_id === device);
  assert.ok(record);
  assert.notEqual(record.activation_code_hash, registered.data.activationCode, 'database should store only a hash');
  assert.match(record.activation_code_hash, /^[a-f0-9]{64}$/);
  assert.equal(record.is_active, false);

  const wrongDevice = await request('library-device-activate', {
    method: 'POST',
    deviceId: 'different-device-1234',
    body: { librarySlug: 'bio-private', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test User' }
  });
  assert.equal(wrongDevice.response.status, 403, 'activation code must not activate a different device');

  const activated = await request('library-device-activate', {
    method: 'POST',
    deviceId: device,
    body: { librarySlug: 'bio-private', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test User' }
  });
  assert.equal(activated.response.status, 200);
  assert.equal(activated.data.ok, true);
  assert.equal(record.is_active, true);
  assert.equal(record.activation_code_hash, null, 'successful activation must consume the code');

  const library = await request('public-library', { query: { id: 'bio-private' }, deviceId: device });
  assert.equal(library.response.status, 200, 'activated device should be able to open the private library');

  const replay = await request('library-device-activate', {
    method: 'POST',
    deviceId: device,
    body: { librarySlug: 'bio-private', deviceId: device, activationCode: registered.data.activationCode, studentName: 'Test User' }
  });
  assert.equal(replay.response.status, 403, 'a consumed activation code must not work a second time');

  const expiringDevice = 'expiring-device-1234';
  const expiring = await request('library-device-code', {
    method: 'POST', token: login.data.token,
    body: { libraryId: privateLibraryId, deviceId: expiringDevice }
  });
  assert.equal(expiring.response.status, 200);
  const expiringRecord = tables.cbt_library_device_access.find(row => row.library_id === privateLibraryId && row.device_id === expiringDevice);
  expiringRecord.activation_expires_at = new Date(Date.now() - 1000).toISOString();
  const expiredActivation = await request('library-device-activate', {
    method: 'POST', deviceId: expiringDevice,
    body: { librarySlug: 'bio-private', deviceId: expiringDevice, activationCode: expiring.data.activationCode, studentName: 'Test User' }
  });
  assert.equal(expiredActivation.response.status, 403);
  assert.match(expiredActivation.data.error, /expired/i);
});

test('challenge-only CBT shared result slugs are blocked even when the underlying CBT has a result link', async () => {
  const { response, data } = await request('result-access', { query: { slug: 'biltz-shared-result-slug' }, deviceId: biltzDevice });
  assert.equal(response.status, 403);
  assert.match(data.error, /Brainz Biltz challenge link only/);
});

test('private Brainz Biltz personal result uses challenge release/settings and never exposes base CBT leaderboard or corrections', async () => {
  const { response, data } = await request('result-access', { query: { token: biltzResultToken }, deviceId: biltzDevice });
  assert.equal(response.status, 200);
  assert.equal(data.result.challengeSlug, 'private-biology-blitz');
  assert.equal(data.result.challengeTitle, 'Private Biology Blitz');
  assert.equal(data.result.percent, 100);
  assert.equal(data.result.settings.reviewEnabled, false);
  assert.equal(data.result.settings.leaderboardEnabled, false);
  assert.deepEqual(data.result.leaderboard, []);
  assert.equal(Object.hasOwn(data.result, 'corrections'), false);
});

test('private Brainz Biltz personal result token is bound to the registered device', async () => {
  const { response, data } = await request('result-access', { query: { token: biltzResultToken }, deviceId: 'different-browser-device-987' });
  assert.equal(response.status, 403);
  assert.match(data.error, /registered device/);
});

test('editing a registered Brainz Biltz challenge preserves unchanged fields and blocks payment/schedule changes', async () => {
  const login = await request('login', { method: 'POST', body: { password: 'admin-test-password' }, deviceId: 'admin-browser-device-12345' });
  assert.equal(login.response.status, 200);
  const token = login.data.token;
  const baseBody = {
    id: biltzChallengeId,
    title: 'Private Biology Blitz — Updated Description',
    description: 'A small editable description update.',
    quizId: biltzQuizId,
    startAt: '2026-01-01T00:00:00Z',
    endAt: '2026-01-03T00:00:00Z',
    durationMinutes: 30,
    entryFee: 500,
    accessMode: 'private',
    status: 'published',
    challengeOnly: true,
    attemptLimit: 1,
    maxParticipants: null,
    finishPolicy: 'full_duration',
    leaderboardRelease: 'after_end',
    leaderboardEnabled: false,
    reviewEnabled: false
  };
  const unchanged = await request('biltz-save', { method: 'POST', body: baseBody, token, deviceId: 'admin-browser-device-12345' });
  assert.equal(unchanged.response.status, 200, unchanged.data.error);
  assert.equal(unchanged.data.challenge.entry_fee, 500);
  const changed = await request('biltz-save', { method: 'POST', body: { ...baseBody, entryFee: 0 }, token, deviceId: 'admin-browser-device-12345' });
  assert.equal(changed.response.status, 409);
  assert.match(changed.data.error, /cannot be changed after registration begins/);
});

let failures = 0;
for (const { name, fn } of tests) {
  try { await fn(); process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL  ${name}\n      ${error?.stack || error}\n`); }
}
globalThis.fetch = originalFetch;
process.stdout.write(`\n${tests.length - failures}/${tests.length} regression checks passed.\n`);
if (failures) process.exitCode = 1;
