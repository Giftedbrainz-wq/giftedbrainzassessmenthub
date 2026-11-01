import { handleEduSpaceBridge } from './eduspace-bridge.js';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-device-id',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Origin', ...CORS, ...securityHeaders }
});
const bad = (message, status = 400) => json({ error: message }, status);
const env = (context, name) => context?.env?.[name] ?? context?.env?.get?.(name) ?? '';
const cleanText = value => String(value ?? '').trim();
const enc = value => encodeURIComponent(String(value));
const sbBase = context => String(env(context, 'SUPABASE_URL')).replace(/\/$/, '');
const sbKey = context => env(context, 'SUPABASE_SECRET_KEY') || env(context, 'SUPABASE_SERVICE_ROLE_KEY');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SUPABASE_RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 524]);
// Keep the total retry budget comfortably below typical EdgeOne/serverless request limits.
const SUPABASE_MAX_RETRIES = 2;
const SUPABASE_TIMEOUT_MS = 6000;

async function supabaseFetch(url, options = {}, context = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  // Automatic retries are limited to idempotent reads. Retrying POST/PATCH/DELETE
  // after a timeout can duplicate a write when Supabase already committed it.
  const retryableMethod = method === 'GET' || method === 'HEAD';
  const maxAttempts = retryableMethod ? SUPABASE_MAX_RETRIES : 1;
  let lastNetworkError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timer = null;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
      const response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (response.ok) return { response, data, text };

      const message = data?.message || data?.hint || data?.error_description || data?.error || `Supabase request failed (${response.status})`;
      if (retryableMethod && SUPABASE_RETRYABLE.has(response.status) && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter >= 0
          ? Math.min(5000, retryAfter * 1000)
          : Math.min(2500, 350 * (2 ** (attempt - 1)));
        await sleep(backoff);
        continue;
      }

      const error = new Error(String(message));
      error.status = response.status;
      error.supabaseStatus = response.status;
      error.retryable = SUPABASE_RETRYABLE.has(response.status);
      error.endpoint = url;
      error.method = method;
      error.responseBody = typeof text === 'string' ? text.slice(0, 1200) : '';
      throw error;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Supabase request timed out after ${SUPABASE_TIMEOUT_MS / 1000}s.`);
        timeoutError.status = 504;
        timeoutError.retryable = retryableMethod;
        lastNetworkError = timeoutError;
      } else if (error?.status) {
        if (!(retryableMethod && error.retryable && attempt < maxAttempts)) throw error;
        lastNetworkError = error;
      } else {
        lastNetworkError = error instanceof Error ? error : new Error(String(error || 'Supabase network error'));
      }
      if (retryableMethod && attempt < maxAttempts) {
        await sleep(Math.min(2500, 350 * (2 ** (attempt - 1))));
        continue;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastNetworkError || new Error('Supabase request failed.');
}

function formatSupabaseFailure(error, operation) {
  const status = Number(error?.status || error?.supabaseStatus || 0);
  const base = error?.message || 'unknown Supabase error';
  if (status) return `${operation} failed at Supabase (HTTP ${status}): ${base}`;
  return `${operation} failed while contacting Supabase: ${base}`;
}

async function sb(context, table, { method = 'GET', query = '', body, headers = {} } = {}) {
  const base = sbBase(context);
  const key = sbKey(context);
  if (!base || !key) throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to EdgeOne.');

  const url = `${base}/rest/v1/${table}${query ? `?${query}` : ''}`;
  try {
    const { data } = await supabaseFetch(url, {
      method,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    }, context);
    return data;
  } catch (error) {
    if (error?.status === 401 || error?.status === 403 || /row level security|violates row-level security/i.test(String(error?.message || ''))) {
      throw new Error('Supabase rejected the server request. Check that SUPABASE_SECRET_KEY is the Supabase Secret key (sb_secret_...) or legacy service_role key, not the Publishable/anon key.');
    }
    const wrapped = new Error(formatSupabaseFailure(error, `Supabase ${table} request`));
    wrapped.status = Number(error?.status || 0) || undefined;
    wrapped.supabaseStatus = Number(error?.supabaseStatus || error?.status || 0) || undefined;
    wrapped.retryable = Boolean(error?.retryable);
    wrapped.endpoint = error?.endpoint || '';
    wrapped.method = error?.method || method;
    wrapped.responseBody = error?.responseBody || '';
    throw wrapped;
  }
}

async function sbRpc(context, fn, body) {
  const base = sbBase(context);
  const key = sbKey(context);
  if (!base || !key) throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to EdgeOne.');
  const url = `${base}/rest/v1/rpc/${fn}`;
  try {
    const { data } = await supabaseFetch(url, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }, context);
    return data;
  } catch (error) {
    if (error?.status === 401 || error?.status === 403 || /row level security|violates row-level security/i.test(String(error?.message || ''))) {
      throw new Error('Supabase rejected the server request. Check that SUPABASE_SECRET_KEY is the Supabase Secret key (sb_secret_...) or legacy service_role key, not the Publishable/anon key.');
    }
    const wrapped = new Error(formatSupabaseFailure(error, `Supabase RPC ${fn}`));
    wrapped.status = Number(error?.status || 0) || undefined;
    wrapped.supabaseStatus = Number(error?.supabaseStatus || error?.status || 0) || undefined;
    wrapped.retryable = Boolean(error?.retryable);
    wrapped.endpoint = error?.endpoint || '';
    wrapped.method = error?.method || 'POST';
    wrapped.responseBody = error?.responseBody || '';
    throw wrapped;
  }
}

// Smaller pages keep PostgREST responses below gateway/proxy limits when
// questions contain images or attempts contain sizeable student_data JSON.
async function sbAll(context, table, query = '', pageSize = 100, maxRecords = 50000) {
  const results = [];
  let offset = 0;
  const size = Math.max(1, Math.min(500, Number(pageSize) || 100));
  const cap = Math.max(size, Math.min(100000, Number(maxRecords) || 50000));
  while (true) {
    const remaining = cap - results.length;
    if (remaining <= 0) throw new Error(`Too many records in ${table}; narrow the request before continuing.`);
    const currentSize = Math.min(size, remaining);
    const params = new URLSearchParams(query);
    params.set('limit', String(currentSize));
    params.set('offset', String(offset));
    const page = await sb(context, table, { query: params.toString() });
    if (!Array.isArray(page)) return results;
    results.push(...page);
    if (page.length < currentSize) return results;
    offset += currentSize;
  }
}

async function withConcurrency(items, worker, limit = 3) {
  const out = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, () => run()));
  return out;
}

const te = new TextEncoder();
const td = new TextDecoder();
const b64u = bytes => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const ub64u = value => {
  let text = String(value).replaceAll('-', '+').replaceAll('_', '/');
  while (text.length % 4) text += '=';
  const raw = atob(text);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(data))));
}
async function issueSession(context) {
  const secret = env(context, 'SESSION_SECRET');
  if (!secret) throw new Error('SESSION_SECRET is not configured.');
  const payload = b64u(te.encode(JSON.stringify({ sub: 'admin', exp: Date.now() + 43200000 })));
  return `${payload}.${await hmac(secret, payload)}`;
}
async function isAdmin(context, request) {
  const secret = env(context, 'SESSION_SECRET');
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    if (await hmac(secret, parts[0]) !== parts[1]) return false;
    const payload = JSON.parse(td.decode(ub64u(parts[0])));
    return payload.sub === 'admin' && Number(payload.exp) > Date.now();
  } catch { return false; }
}

const loginFailures = new Map();
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
function clientIp(request) {
  const fwd = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (fwd) return fwd;
  return String(request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown').trim();
}
function loginBlocked(ip, now) {
  const rec = loginFailures.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil && now < rec.lockedUntil) return true;
  if (now - rec.windowStart > LOGIN_WINDOW_MS) return false;
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
const slugify = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55);
const randomToken = (length = 10) => { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); let out = ''; for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]; return out; };
async function ensureAttemptResultToken(context, attempt){
  if(attempt?.result_token) return String(attempt.result_token);
  const token=randomToken(36);
  const rows=await sb(context,'attempts',{method:'PATCH',query:`id=eq.${enc(attempt.id)}`,body:{result_token:token},headers:{prefer:'return=representation'}});
  return String(rows?.[0]?.result_token || token);
}

async function uniqueSlug(context) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const slug = randomToken(10);
    const found = await sb(context, 'quizzes', { query: `select=id&slug=eq.${enc(slug)}&limit=1` });
    if (!found.length) return slug;
  }
  return randomToken(11);
}

async function uniqueLibrarySlug(context) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const slug = randomToken(10);
    const found = await sb(context, 'cbt_libraries', { query: `select=id&slug=eq.${enc(slug)}&limit=1` });
    if (!found.length) return slug;
  }
  return randomToken(11);
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(String(value))));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function generatedActivationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}
function deviceIdForRequest(request, body = {}) {
  return cleanText(request.headers.get('x-device-id') || body.deviceId).slice(0, 200);
}
function normalizeWhatsAppNumber(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = `234${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : '';
}
async function getAdministratorWhatsAppNumber(context) {
  try {
    const rows = await sb(context, 'app_settings', { query: `select=value&key=eq.administrator_whatsapp&limit=1` });
    return normalizeWhatsAppNumber(rows?.[0]?.value || '');
  } catch {
    return '';
  }
}
async function isDeviceAuthorizedForQuiz(context, quizId, deviceId) {
  if (!deviceId) return false;
  const rows = await sb(context, 'quiz_device_access', {
    query: `select=id&quiz_id=eq.${enc(quizId)}&device_id=eq.${enc(deviceId)}&is_active=eq.true&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0;
}
function privateQuizDenied(quiz, deviceId, adminWhatsAppNumber = '') {
  return json({
    error: 'This is a private quiz.',
    accessRequired: true,
    accessKind: 'quiz',
    quizAccessRequired: true,
    quizSlug: quiz?.slug || '',
    quizName: quiz?.title || 'Private quiz',
    deviceId: deviceId || '',
    adminWhatsAppNumber: normalizeWhatsAppNumber(adminWhatsAppNumber)
  }, 403);
}
async function isDeviceAuthorizedForLibrary(context, libraryId, deviceId) {
  if (!deviceId) return false;
  const rows = await sb(context, 'cbt_library_device_access', {
    query: `select=id&library_id=eq.${enc(libraryId)}&device_id=eq.${enc(deviceId)}&is_active=eq.true&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0;
}
async function privateLibraryForQuiz(context, quizId, deviceId) {
  const memberships = await sbAll(context, 'cbt_library_items', `select=library_id&quiz_id=eq.${enc(quizId)}`, 100, 5000);
  const libraryIds = [...new Set(memberships.map(row => String(row.library_id || '')).filter(Boolean))];
  if (!libraryIds.length) return null;
  const libraries = await sb(context, 'cbt_libraries', {
    query: `select=id,slug,name,access_mode&id=in.(${libraryIds.map(enc).join(',')})`
  });
  for (const library of libraries || []) {
    if (library.access_mode !== 'private') continue;
    if (!(await isDeviceAuthorizedForLibrary(context, library.id, deviceId))) return library;
  }
  return null;
}
function privateLibraryDenied(library, deviceId, adminWhatsAppNumber = '') {
  return json({
    error: 'You are not eligible to open this library. Contact the administrator for more details.',
    accessRequired: true,
    librarySlug: library?.slug || '',
    libraryName: library?.name || 'Private CBT Library',
    deviceId: deviceId || '',
    adminWhatsAppNumber: normalizeWhatsAppNumber(adminWhatsAppNumber)
  }, 403);
}

async function uniquePoolSlug(context) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const slug = randomToken(10);
    const found = await sb(context, 'question_pools', { query: `select=id&slug=eq.${enc(slug)}&limit=1` });
    if (!found.length) return slug;
  }
  return randomToken(11);
}
async function isDeviceAuthorizedForPool(context, poolId, deviceId) {
  if (!deviceId) return false;
  const rows = await sb(context, 'pool_device_access', {
    query: `select=id&pool_id=eq.${enc(poolId)}&device_id=eq.${enc(deviceId)}&is_active=eq.true&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0;
}
function privatePoolDenied(pool, deviceId, adminWhatsAppNumber = '') {
  return json({
    error: 'You are not eligible to open this Question Pool. Contact the administrator for more details.',
    accessRequired: true,
    poolSlug: pool?.slug || '',
    poolName: pool?.name || 'Private Question Pool',
    deviceId: deviceId || '',
    adminWhatsAppNumber: normalizeWhatsAppNumber(adminWhatsAppNumber)
  }, 403);
}
async function issuePoolAttemptToken(context, attemptId, poolId, expiresAt) {
  const payload = { sub: 'poolAttempt', attemptId, poolId, exp: expiresAt };
  const encoded = b64u(te.encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(env(context, 'SESSION_SECRET'), encoded)}`;
}
async function verifyPoolAttemptToken(context, token, attemptId, poolId) {
  const secret = env(context, 'SESSION_SECRET');
  if (!secret || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  try {
    if (await hmac(secret, parts[0]) !== parts[1]) return false;
    const payload = JSON.parse(td.decode(ub64u(parts[0])));
    return payload.sub === 'poolAttempt' && payload.attemptId === attemptId && payload.poolId === poolId && Number(payload.exp) > Date.now();
  } catch { return false; }
}
function publicPoolQuestion(question, shuffleOptions = false) {
  const raw = Array.isArray(question.options) ? question.options : [];
  let options = raw;
  let optionMap = raw.map((_, index) => index);
  if (shuffleOptions) {
    const pairs = raw.map((text, index) => ({ text, index }));
    const shuffled = shuffleArray(pairs);
    options = shuffled.map(item => item.text);
    optionMap = shuffled.map(item => item.index);
  }
  return {
    id: question.id,
    type: question.type || 'multiple_choice',
    text: question.text,
    options,
    optionMap,
    topicId: question.topic_id || null,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    marks: Math.max(0.01, Number(question.marks) || 1),
    image_data: boundedImageData(question.image_data),
    passage: question.passage_content ? { id: question.passage_id, title: question.passage_title, content: question.passage_content } : null
  };
}
async function currentPoolCycle(context, poolId, deviceId) {
  const rows = await sb(context, 'pool_progress', { query: `select=cycle&pool_id=eq.${enc(poolId)}&device_id=eq.${enc(deviceId)}&limit=1` });
  return rows.length ? Math.max(1, Number(rows[0].cycle) || 1) : 1;
}
async function advancePoolCycle(context, poolId, deviceId, toCycle) {
  await sb(context, 'pool_progress', {
    method: 'POST', query: 'on_conflict=pool_id,device_id&select=cycle',
    body: { pool_id: poolId, device_id: deviceId, cycle: toCycle, updated_at: new Date().toISOString() },
    headers: { prefer: 'resolution=merge-duplicates,return=representation' }
  });
}
function poolRecommendation(timesSeen, timesCorrect) {
  if (!timesSeen) return null;
  const pct = Math.round((timesCorrect / timesSeen) * 100);
  if (pct >= 80) return { tier: 'strong', percent: pct, message: `Strong grasp so far (${pct}% correct). You're ready to move on, or do a quick practice recap to keep it fresh.` };
  if (pct >= 60) return { tier: 'good', percent: pct, message: `Good progress (${pct}% correct). Revisit the questions you missed, then practice again to push this higher.` };
  if (pct >= 40) return { tier: 'needs-work', percent: pct, message: `This needs more work (${pct}% correct). Switch to Study Mode to read the explanations, then practice again.` };
  return { tier: 'weak', percent: pct, message: `This topic needs focused revision (${pct}% correct). Go through Study Mode carefully before practicing again.` };
}

async function uniqueResultSlug(context) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const token = randomToken(10);
    const found = await sb(context, 'quizzes', { query: `select=id&result_slug=eq.${enc(token)}&limit=1` });
    if (!found.length) return token;
  }
  return randomToken(11);
}

function normalizeFields(fields) {
  const defaults = [{ key: 'full_name', label: 'Full Name', type: 'text', required: true, leaderboard: true }];
  if (!Array.isArray(fields)) return defaults;
  const output = [];
  const seen = new Set();
  for (const field of fields) {
    const key = String(field?.key || field?.label || 'field')
      .toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || `field_${output.length + 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      key,
      label: cleanText(field?.label) || key,
      type: ['text', 'tel', 'email', 'number'].includes(field?.type) ? field.type : 'text',
      required: Boolean(field?.required),
      leaderboard: key === 'full_name' ? true : Boolean(field?.leaderboard)
    });
  }
  if (!output.some(field => field.key === 'full_name')) output.unshift(defaults[0]);
  return output.slice(0, 30);
}

function normalizeSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const rawMaxAttempts = s.maxAttempts;
  const unlimitedAttempts = rawMaxAttempts === null || rawMaxAttempts === 0 || String(rawMaxAttempts).toLowerCase() === 'unlimited';
  return {
    resultEnabled: s.resultEnabled !== false,
    leaderboardEnabled: s.leaderboardEnabled !== false,
    shuffleQuestions: Boolean(s.shuffleQuestions),
    shuffleOptions: Boolean(s.shuffleOptions),
    reviewEnabled: s.reviewEnabled !== false,
    totalMarks: Number(s.totalMarks) > 0 ? Number(s.totalMarks) : null,
    equalMarks: Boolean(s.equalMarks),
    maxAttempts: unlimitedAttempts ? null : validInteger(rawMaxAttempts, 1, 1, 10000)
  };
}

const DEFAULT_IMAGE_DATA_MAX_CHARS = 1200000;
const STUDENT_MEDIA_MAX_CHARS = 5000000;
function safeHttpsImageUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
function boundedImageData(value, maxChars = DEFAULT_IMAGE_DATA_MAX_CHARS) {
  const imageRaw = typeof value === 'string' ? value.trim() : '';
  const dataValid = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+\/=\s]+$/i.test(imageRaw);
  const normalizedUrl = dataValid ? null : safeHttpsImageUrl(imageRaw);
  const finalValue = dataValid ? imageRaw : normalizedUrl || '';
  return finalValue && finalValue.length <= maxChars ? finalValue : null;
}

function normalizeAnswer(answer, options = []) {
  if (answer === null || answer === undefined || answer === '') return null;
  if (Number.isInteger(answer) && answer >= 0 && answer <= 3) return answer;
  const raw = cleanText(answer);
  if (!raw) return null;
  if (/^[A-D]$/i.test(raw)) return raw.toUpperCase().charCodeAt(0) - 65;
  if (/^[1-4]$/.test(raw)) return Number(raw) - 1;
  const cleaned = raw.replace(/^(?:option\s*)?[A-D][.)\-:]\s*/i, '').trim();
  const exact = options.findIndex(option => cleanText(option).toLowerCase() === cleaned.toLowerCase());
  if (exact >= 0) return exact;
  const loose = options.findIndex(option => cleanText(option).toLowerCase().replace(/\s+/g,' ') === cleaned.toLowerCase().replace(/\s+/g,' '));
  return loose >= 0 ? loose : null;
}

function normalizeQuestion(question) {
  const type = question?.type === 'passage' ? 'passage' : 'multiple_choice';
  const options = Array.isArray(question?.options) ? question.options.map(cleanText).slice(0, 4) : [];
  return {
    type,
    text: cleanText(question?.text),
    options,
    answer: normalizeAnswer(question?.answer, options),
    explanation: cleanText(question?.explanation),
    subject: cleanText(question?.subject) || 'General',
    topic: cleanText(question?.topic) || 'General',
    difficulty: cleanText(question?.difficulty) || 'Medium',
    marks: Math.max(0.01, Number(question?.marks) || 1),
    image_data: boundedImageData(question?.image_data),
    source_page: Number.isInteger(question?.source_page) ? question.source_page : null,
    position: Math.max(0, Number(question?.position) || 0)
  };
}

function validateQuestion(q) {
  if (!q.text) return 'Question text is required.';
  if (q.options.length !== 4 || q.options.some(option => !option)) return 'Question must contain four non-empty options.';
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return 'Question must have one valid correct answer.';
  return '';
}

function shuffleArray(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function publicQuestion(question, shuffleOptions = false) {
  const raw = Array.isArray(question.options) ? question.options : [];
  let options = raw;
  let optionMap = raw.map((_, index) => index);
  if (shuffleOptions) {
    const pairs = raw.map((text, index) => ({ text, index }));
    const shuffled = shuffleArray(pairs);
    options = shuffled.map(item => item.text);
    optionMap = shuffled.map(item => item.index);
  }
  return {
    id: question.id,
    type: question.type || 'multiple_choice',
    text: question.text,
    options,
    optionMap,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    section_id: question.section_id || null,
    marks: Math.max(0.01, Number(question.marks) || 1),
    image_data: boundedImageData(question.image_data),
    image_available: Boolean(question.image_available || question.image_data),
    source_page: question.source_page || null,
    passage: question.passage_content ? {
      id: question.passage_id,
      title: question.passage_title,
      content: question.passage_content
    } : null,
    position: question.position || 0
  };
}

function publicSection(section, questionCount) {
  return { id: section.id, title: section.title, description: section.description || '', position: section.position || 0, question_count: questionCount };
}

function publicQuiz(quiz, sections, questions) {
  const settings = normalizeSettings(quiz.settings);
  const prepared=questions.map(question=>publicQuestion(question,settings.shuffleOptions));
  // A passage and all questions that reference that same passage are one inseparable block.
  // Shuffle may move the block, but it must never split the questions apart.
  const buildBlocks=(items)=>{
    const blocks=[],byPassage=new Map(),standalone=[];
    for(const item of items){
      const pid=item.passage?.id?String(item.passage.id):'';
      if(pid){
        if(!byPassage.has(pid)){const block=[];byPassage.set(pid,block);blocks.push(block);}
        byPassage.get(pid).push(item);
      }else standalone.push([item]);
    }
    const ordered=[...blocks,...standalone];
    for(const block of ordered)block.sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));
    return ordered;
  };
  let list=[];
  const sectionIds=new Set(sections.map(s=>s.id));
  for(let si=0;si<sections.length;si++){
    const section=sections[si];
    const items=prepared.filter(q=>q.section_id===section.id || (si===0&&!q.section_id));
    const blocks=buildBlocks(items);
    if(settings.shuffleQuestions)shuffleArray(blocks).forEach(block=>list.push(...block));
    else blocks.forEach(block=>list.push(...block));
  }
  // Preserve legacy/unsectioned records not already included above.
  const included=new Set(list.map(q=>q.id));
  const leftovers=prepared.filter(q=>!included.has(q.id));
  const leftoverBlocks=buildBlocks(leftovers);
  if(settings.shuffleQuestions)shuffleArray(leftoverBlocks).forEach(block=>list.push(...block));else leftoverBlocks.forEach(block=>list.push(...block));
  const cleanSections = sections.map((section, si) => publicSection(section, questions.filter(q => q.section_id === section.id || (si === 0 && !q.section_id)).length));
  return {
    id: quiz.id,
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description || '',
    instructions: quiz.instructions || '',
    duration: quiz.duration,
    pass_mark: quiz.pass_mark,
    settings,
    student_fields: normalizeFields(quiz.student_fields),
    sections: cleanSections,
    questions: list,
    result_released: Boolean(quiz.result_released)
  };
}

async function loadQuizBundle(context, id, { includeImages = true } = {}) {
  const quizSelect = 'id,slug,title,description,instructions,duration,pass_mark,settings,student_fields,status,result_slug,result_released,access_mode,created_at,updated_at';
  const quizzes = await sb(context, 'quizzes', { query: `select=${quizSelect}&id=eq.${enc(id)}&limit=1` });
  if (!quizzes.length) throw new Error('Quiz not found.');
  const questionSelect = includeImages
    ? 'id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,image_data,source_page,needs_review,position,created_at'
    : 'id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,source_page,needs_review,position,created_at';
  const loadQuestions = async () => {
    try {
      return await sbAll(context, 'questions', `select=${questionSelect}&quiz_id=eq.${enc(id)}&order=position.asc,created_at.asc`, 100, 20000);
    } catch (error) {
      // A large legacy question image can push an otherwise healthy request over a
      // gateway payload limit. A reduced projection keeps the CBT available instead
      // of turning one oversized image into a complete 502 failure.
      if (includeImages && [413,429,502,503,504].includes(Number(error?.status))) {
        const reduced = await sbAll(context, 'questions', `select=id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,source_page,needs_review,position,created_at&quiz_id=eq.${enc(id)}&order=position.asc,created_at.asc`, 100, 20000);
        return reduced.map(q => ({ ...q, image_data: null, image_omitted: true }));
      }
      throw error;
    }
  };
  const sections = await sbAll(context, 'quiz_sections', `select=id,quiz_id,title,description,marks,position,created_at&quiz_id=eq.${enc(id)}&order=position.asc,created_at.asc`, 100, 2000);
  const questions = await loadQuestions();

  // Public CBT pages intentionally do not ship all base64 images in one response.
  // The ID-only lookup is tiny; each diagram is fetched on demand by question-media.
  let imageIds = new Set();
  let imageLookupUnavailable = false;
  if (!includeImages) {
    try {
      const imageRows = await sbAll(context, 'questions', `select=id&quiz_id=eq.${enc(id)}&image_data=not.is.null&order=position.asc,created_at.asc`, 250, 20000);
      imageIds = new Set(imageRows.map(row => row.id));
    } catch {
      // If the metadata lookup fails, let the student take the inexpensive on-demand
      // media path instead of silently suppressing every diagram on the CBT. A failed
      // question-media call is rendered as a safe placeholder and does not break the quiz.
      imageLookupUnavailable = true;
    }
  }

  let passages = [];
  try {
    passages = await sbAll(context, 'passages', `select=id,quiz_id,title,content,created_at&quiz_id=eq.${enc(id)}&order=created_at.asc`, 100, 5000);
  } catch (error) {
    // A non-passage CBT can still be served if the optional passage table is
    // temporarily unavailable. Passage-based CBTs must fail rather than silently
    // dropping reading content.
    if (questions.some(question => question.passage_id)) throw error;
  }
  const passageMap = new Map(passages.map(passage => [passage.id, passage]));
  const enriched = questions.map(question => {
    const passage = passageMap.get(question.passage_id);
    const withPassage = passage ? { ...question, passage_title: passage.title, passage_content: passage.content } : question;
    return includeImages ? withPassage : { ...withPassage, image_available: imageLookupUnavailable || imageIds.has(question.id) };
  });
  return { quiz: quizzes[0], sections, questions: enriched };
}

function aiSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['multiple_choice', 'passage'] },
            text: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
            answer: { type: 'integer', minimum: 0, maximum: 3 },
            explanation: { type: 'string' },
            subject: { type: 'string' },
            topic: { type: 'string' },
            difficulty: { type: 'string' },
            marks: { type: 'integer', minimum: 1 },
            image_data: { type: ['string', 'null'] },
            source_page: { type: ['integer', 'null'], minimum: 1 },
            passage: {
              type: ['object', 'null'],
              additionalProperties: false,
              properties: { title: { type: 'string' }, content: { type: 'string' } },
              required: ['title', 'content']
            }
          },
          required: ['type', 'text', 'options', 'answer', 'explanation', 'subject', 'topic', 'difficulty', 'marks', 'image_data', 'source_page', 'passage']
        }
      }
    },
    required: ['questions']
  };
}

function aiSchemaStem() {
  return {
    type: 'object', additionalProperties: false,
    properties: { questions: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        type:{type:'string',enum:['multiple_choice','passage']}, text:{type:'string'},
        options:{type:'array',items:{type:'string'},minItems:4,maxItems:4},
        answer:{type:['integer','null'],minimum:0,maximum:3}, explanation:{type:'string'},
        subject:{type:'string'},topic:{type:'string'},difficulty:{type:'string'},marks:{type:'number',minimum:0.01},
        image_data:{type:['string','null']},source_page:{type:['integer','null'],minimum:1},
        passage:{type:['object','null'],additionalProperties:false,properties:{title:{type:'string'},content:{type:'string'}},required:['title','content']}
      }, required:['type','text','options','answer','explanation','subject','topic','difficulty','marks','image_data','source_page','passage']
    }}}, required:['questions']
  };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(raw);
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
  }
  // Last-resort balanced-object scan. This handles prose before/after JSON and braces inside strings.
  let depth = 0, inString = false, escaped = false, begin = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) begin = i; depth++; }
    else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && begin >= 0) {
        try { return JSON.parse(raw.slice(begin, i + 1)); } catch {}
        begin = -1;
      }
    }
  }
  return null;
}

function questionFingerprint(question) {
  const stem = cleanText(question?.text).toLowerCase().replace(/\s+/g, ' ');
  const opts = Array.isArray(question?.options) ? question.options.map(cleanText).map(x => x.toLowerCase().replace(/\s+/g, ' ')).join('|') : '';
  return `${stem}||${opts}`;
}

function validateGeneratedBatch(questions, count, extract = false) {
  if (!Array.isArray(questions)) throw new Error('Groq did not return a questions array.');
  if (!extract && questions.length !== count) throw new Error(`Groq returned ${questions.length} questions instead of ${count}.`);
  const seen = new Set();
  for (const question of questions) {
    if (!question?.text) throw new Error('A generated question has no question text.');
    if (!extract) {
      const error = validateQuestion(question);
      if (error) throw new Error(error);
      if (question.type === 'passage' && !question.passage?.content) throw new Error('A passage question has no passage content.');
    }
    const fp = questionFingerprint(question);
    if (fp !== '||') {
      if (seen.has(fp)) throw new Error('Groq returned duplicate questions in the same batch.');
      seen.add(fp);
    }
  }
}

async function groqRequest(context, { key, model, system, user, schema, count }) {
  const maxAttempts=4;
  let lastMessage='Groq request failed.';
  for(let attempt=0;attempt<maxAttempts;attempt++){
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${key}`},
      body:JSON.stringify({
        model,
        messages:[{role:'system',content:system},{role:'user',content:user}],
        max_completion_tokens:Math.min(40000,Math.max(2200,count*420)),
        response_format:{type:'json_schema',json_schema:{name:'gifted_brainz_questions',strict:true,schema}}
      })
    });
    const data=await response.json().catch(()=>({}));
    if(response.ok)return data?.choices?.[0]?.message?.content||'';
    lastMessage=data?.error?.message||`Groq request failed (${response.status})`;
    if(response.status===401)throw new Error('Groq rejected the API key. Check GROQ_API_KEY in EdgeOne.');
    if(response.status===429){
      const retryHeader=response.headers.get('retry-after');
      const parsed=Number(retryHeader);
      const waitMs=Number.isFinite(parsed)?Math.min(30000,Math.max(1500,parsed*1000)):Math.min(30000,2500*Math.pow(2,attempt));
      if(attempt<maxAttempts-1){await sleep(waitMs);continue;}
      throw new Error('Groq is temporarily rate-limited. The request was retried automatically. Please wait a little and generate again.');
    }
    if(response.status>=500&&attempt<maxAttempts-1){await sleep(Math.min(10000,1500*Math.pow(2,attempt)));continue;}
    throw new Error(lastMessage);
  }
  throw new Error(lastMessage);
}

async function generateWithGroq(context, { prompt, count, extract = false }) {
  const key = env(context, 'GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY is not configured in EdgeOne.');
  const model = env(context, 'GROQ_MODEL') || 'openai/gpt-oss-120b';
  const schema = extract ? aiSchemaStem() : aiSchema();
  const system = extract
    ? `You are a meticulous Nigerian examination question extractor for Gifted Brainz. Extract the COMPLETE questions from the supplied document: stem, exactly four A-D options in original order, the correct answer when the document contains a key, and the explanation/reason/solution when present. Do not invent a missing answer; return null so the review screen can flag it. Preserve mathematical notation and associate embedded images with the question that uses them. Use source_page for [PAGE N] markers and keep passage groups intact. Return ONLY data matching the supplied JSON schema. Do not output Markdown, commentary, or code fences.`
    : `You are a meticulous Nigerian examination question setter for Gifted Brainz. Create high-quality assessment questions. Every question must have exactly four non-empty options and answer must be the zero-based correct option index (0=A, 1=B, 2=C, 3=D), never the option text, never a letter, and never a 1-4 ordinal. Detect the requested question type from the user's instruction when type is auto. For passage questions, include the passage in that question's passage object. For ordinary questions, passage must be null. Never invent a source answer when the supplied document contains a clear answer key; use the source key. If an answer or explanation is not present in an extraction source, infer only when it is unambiguous. Return ONLY data matching the supplied JSON schema. Do not output Markdown, commentary, or code fences.`;
  const user = extract
    ? `Extract the complete questions. Split and preserve A-D options even when they are on the same line or use A., (a), A), or similar labels. Treat LaTeX, TeX, MathML-like text, Unicode mathematical symbols, and code-style expressions such as \frac{a}{b}, \sqrt{x}, x^2, x_1, matrices, equations and inequalities as mathematical content rather than as formatting noise. Preserve them exactly enough for later rendering. Match answer-key entries back to question numbers. Capture explanations from Explanation/Reason/Solution/Rationale sections, including answer sections at the end. If no answer key exists, set answer to null rather than guessing. If [PAGE N] markers exist, set source_page. Do not fabricate content.\n\n${prompt}`
    : `Create exactly ${count} original questions. ${prompt}`;

  let lastError = null;
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestUser = attempt === 0 ? user : `Your previous response could not be safely parsed or validated. Produce a fresh response now. Return ONLY valid JSON matching the schema. No Markdown fences, no prose, no trailing text.\n\n${user}`;
      raw = await groqRequest(context, { key, model, system, user: requestUser, schema, count });
      if (!raw) throw new Error('Groq returned no question data.');
      const parsed = extractJsonObject(raw);
      if (!parsed) throw new Error('Groq returned malformed JSON.');

      const questions = Array.isArray(parsed.questions) ? parsed.questions.map(item => {
        if (extract) {
          const stem = cleanText(item.text);
          if (!stem) return null;
          const options = Array.isArray(item.options) ? item.options.map(cleanText).slice(0, 4) : [];
          const answer = normalizeAnswer(item.answer, options);
          const complete = options.length === 4 && options.every(Boolean) && answer !== null;
          return {
            type: item.type === 'passage' ? 'passage' : 'multiple_choice',
            text: stem,
            options,
            answer,
            explanation: cleanText(item.explanation),
            subject: cleanText(item.subject) || 'General',
            topic: cleanText(item.topic) || 'General',
            difficulty: cleanText(item.difficulty) || 'Medium',
            marks: Math.max(0.01, Number(item.marks) || 1),
            image_data: boundedImageData(item.image_data),
            source_page: Number.isInteger(item.source_page) ? item.source_page : null,
            passage: item.passage ? { title: cleanText(item.passage.title) || 'Passage', content: cleanText(item.passage.content) } : null,
            needsReview: !complete
          };
        }
        const normalized = normalizeQuestion(item);
        return { ...normalized, passage: item.passage || null, source_page: Number.isInteger(item.source_page) ? item.source_page : null };
      }).filter(Boolean) : [];

      validateGeneratedBatch(questions, count, extract);
      return { questions };
    } catch (error) {
      lastError = error;
      if (attempt === 0) continue;
    }
  }
  throw new Error(lastError?.message === 'Groq returned malformed JSON.' || /JSON|duplicate|questions instead|no question data/i.test(lastError?.message || '')
    ? `Groq could not return a valid question set after an automatic retry. Please try again. (${lastError.message})`
    : (lastError?.message || 'Question generation failed. Please try again.'));
}

function effectiveQuizTotal(settings,questions,sections=[]){const s=normalizeSettings(settings);if(s.equalMarks&&s.totalMarks>0)return Number(s.totalMarks);const allocated=(Array.isArray(sections)?sections:[]).filter(x=>x.marks!==null&&x.marks!==undefined&&x.marks!=='');if(allocated.length){const ids=new Set(allocated.map(x=>String(x.id)));const allocatedTotal=allocated.reduce((a,x)=>a+Math.max(0,Number(x.marks)||0),0);const fallback=(Array.isArray(questions)?questions:[]).filter(q=>!ids.has(String(q.section_id))).reduce((a,q)=>a+Math.max(0.01,Number(q?.marks)||1),0);return allocatedTotal+fallback;}return (Array.isArray(questions)?questions:[]).reduce((sum,q)=>sum+Math.max(0.01,Number(q?.marks)||1),0);}

async function issueAttemptToken(context, attemptId, quizId, expiresAt) {
  const payload = { sub: 'attempt', attemptId, quizId, exp: expiresAt };
  const encoded = b64u(te.encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(env(context, 'SESSION_SECRET'), encoded)}`;
}

async function verifyAttemptToken(context, token, attemptId, quizId) {
  const secret = env(context, 'SESSION_SECRET');
  if (!secret || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  try {
    if (await hmac(secret, parts[0]) !== parts[1]) return false;
    const payload = JSON.parse(td.decode(ub64u(parts[0])));
    return payload.sub === 'attempt' && payload.attemptId === attemptId && payload.quizId === quizId && Number(payload.exp) > Date.now();
  } catch { return false; }
}

function validInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

// Pure scoring: given a CBT's questions/sections/settings and a map of
// already-recorded selected answers (question_id -> selected index), compute
// the score exactly the way a fresh submission would be scored right now.
// Used to regrade existing attempts after an admin corrects a question.
function computeQuizScore(questions, sectionRows, settingsForScoring, answersByQuestionId) {
  const sectionMap = new Map((sectionRows || []).map(x => [String(x.id), x]));
  const allocatedSections = (sectionRows || []).filter(x => x.marks !== null && Number(x.marks) >= 0);
  const hasSectionAllocation = allocatedSections.length > 0;
  const rawBySection = new Map();
  const sectionBaseTotals = new Map();
  const equalWeight = settingsForScoring.equalMarks && settingsForScoring.totalMarks && questions.length ? settingsForScoring.totalMarks / questions.length : null;
  for (const q of questions) {
    const bm = equalWeight != null ? equalWeight : Math.max(0.01, Number(q.marks) || 1);
    const key = String(q.section_id || '');
    sectionBaseTotals.set(key, (sectionBaseTotals.get(key) || 0) + bm);
  }
  let score = 0;
  let totalMarks = 0;
  const answerRows = [];
  for (const question of questions) {
    const raw = answersByQuestionId.has(String(question.id)) ? answersByQuestionId.get(String(question.id)) : null;
    const selected = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    const validSelected = Number.isInteger(selected) && selected >= 0 && selected <= 3 ? selected : null;
    const baseMarks = equalWeight != null ? equalWeight : Math.max(0.01, Number(question.marks) || 1);
    const correct = validSelected !== null && validSelected === Number(question.answer);
    const secKey = String(question.section_id || '');
    if (!rawBySection.has(secKey)) rawBySection.set(secKey, { raw: 0, total: 0, allocated: sectionMap.get(secKey)?.marks });
    const bucket = rawBySection.get(secKey);
    bucket.total += baseMarks;
    if (correct) bucket.raw += baseMarks;
    const sectionAllocated = sectionMap.get(secKey)?.marks;
    const effectiveMarks = hasSectionAllocation && sectionAllocated !== null && sectionAllocated !== undefined ? (sectionBaseTotals.get(secKey) > 0 ? baseMarks * (Number(sectionAllocated) || 0) / sectionBaseTotals.get(secKey) : 0) : baseMarks;
    const marks = effectiveMarks;
    if (!hasSectionAllocation) { totalMarks += marks; if (correct) score += marks; }
    answerRows.push({ question_id: question.id, selected_answer: validSelected, is_correct: correct, marks: Number(marks.toFixed(4)) });
  }
  if (hasSectionAllocation) {
    score = 0; totalMarks = 0;
    for (const bucket of rawBySection.values()) {
      const alloc = bucket.allocated === null || bucket.allocated === undefined ? bucket.total : Number(bucket.allocated) || 0;
      totalMarks += alloc;
      score += bucket.total > 0 ? (bucket.raw / bucket.total) * alloc : 0;
    }
  }
  const percent = totalMarks ? Math.round(score / totalMarks * 100) : 0;
  return { score, total: totalMarks, percent, answerRows };
}

// Re-score every already-submitted attempt for a CBT using the CBT's current
// question data. Called right after a question's correct answer or marks are
// edited, so a student's previously wrong-marked (or right-marked) answer and
// their total score/percent/leaderboard position update immediately.
async function regradeQuizAttempts(context, quizId) {
  const [questions, sectionRows, quizRows] = await Promise.all([
    sbAll(context, 'questions', `select=id,section_id,answer,marks&quiz_id=eq.${enc(quizId)}`, 100, 5000),
    sbAll(context, 'quiz_sections', `select=id,title,marks&quiz_id=eq.${enc(quizId)}`, 100, 5000),
    sb(context, 'quizzes', { query: `select=id,settings&id=eq.${enc(quizId)}&limit=1` })
  ]);
  if (!questions.length || !quizRows.length) return { regraded: 0 };
  const settingsForScoring = normalizeSettings(quizRows[0].settings);
  const attempts = await sbAll(context, 'attempts', `select=id&quiz_id=eq.${enc(quizId)}&status=eq.submitted`, 100, 20000);
  let regraded = 0;
  for (const attempt of attempts) {
    try {
      const storedAnswers = await sbAll(context, 'attempt_answers', `select=question_id,selected_answer&attempt_id=eq.${enc(attempt.id)}`, 100, 5000);
      const answersByQuestionId = new Map(storedAnswers.map(a => [String(a.question_id), a.selected_answer]));
      const { score, total, percent, answerRows } = computeQuizScore(questions, sectionRows, settingsForScoring, answersByQuestionId);
      await sbRpc(context, 'regrade_attempt_atomic', {
        p_attempt_id: attempt.id,
        p_score: Number(score.toFixed(4)),
        p_total: Number(total.toFixed(4)),
        p_percent: percent,
        p_answer_rows: answerRows
      });
      regraded++;
    } catch (e) {
      // One attempt failing to regrade should not block the others, and must
      // never fail the question-save request itself (the correction is still
      // valid even if a historical attempt couldn't be re-scored).
      console.error('Regrade failed for attempt', attempt?.id, e?.message || e);
    }
  }
  return { regraded };
}

function buildSubjectScores(questions, scoredRows, sectionRows) {
  const qs = Array.isArray(questions) ? questions : [];
  const rows = Array.isArray(scoredRows) ? scoredRows : [];
  const sections = Array.isArray(sectionRows) ? sectionRows : [];
  const answersByQuestion = new Map(rows.map(row => [String(row.question_id || row.questionId), row]));
  const sectionById = new Map(sections.map(section => [String(section.id), section]));
  const assignedSectionIds = [...new Set(qs.map(q => q.section_id ? String(q.section_id) : '').filter(Boolean))];
  const distinctSubjects = [...new Set(qs.map(q => String(q.subject || 'General').trim() || 'General'))];
  const sectionCount = sections.filter(section => qs.some(q => String(q.section_id || '') === String(section.id))).length;
  const useSections = sectionCount > 1 || assignedSectionIds.length > 1;
  if (!useSections && distinctSubjects.length < 2) return [];

  const groups = new Map();
  for (const q of qs) {
    const section = q.section_id ? sectionById.get(String(q.section_id)) : null;
    const subject = String(q.subject || 'General').trim() || 'General';
    const key = useSections ? (q.section_id ? `section:${q.section_id}` : `subject:${subject}`) : `subject:${subject}`;
    const name = useSections ? (String(section?.title || '').trim() || subject) : subject;
    if (!groups.has(key)) groups.set(key, { name, score: 0, total: 0 });
    const group = groups.get(key);
    const answer = answersByQuestion.get(String(q.id));
    const marks = Number(answer?.marks);
    if (Number.isFinite(marks) && marks >= 0) {
      group.total += marks;
      if (answer?.is_correct) group.score += marks;
    }
  }
  return [...groups.values()].map(group => ({
    name: group.name,
    score: Math.round(group.score),
    total: Math.round(group.total)
  }));
}


const BILTZ_CHALLENGE_SELECT = 'id,slug,title,description,quiz_id,cover_image_url,start_at,end_at,duration_minutes,entry_fee,access_mode,status,challenge_only,attempt_limit,max_participants,finish_policy,leaderboard_enabled,leaderboard_release,review_enabled,results_published,payment_instructions,created_at,updated_at';
async function uniqueBiltzSlug(context, title) {
  const base = slugify(title) || 'challenge';
  for (let i = 0; i < 8; i++) {
    const candidate = `${base.slice(0, 42)}-${randomToken(5).toLowerCase()}`;
    const rows = await sb(context, 'brainz_biltz_challenges', { query: `select=id&slug=eq.${enc(candidate)}&limit=1` });
    if (!rows.length) return candidate;
  }
  throw new Error('Unable to create a unique Brainz Biltz link. Please try again.');
}
async function validateBiltzQuizAccess(context, { quizId, challengeSlug = '', deviceId = '', starting = false, attemptId = '' } = {}) {
  const slug = cleanText(challengeSlug);
  const device = cleanText(deviceId);
  if (!slug) {
    if (quizId) {
      const gated = await sb(context, 'brainz_biltz_challenges', { query: `select=id&quiz_id=eq.${enc(quizId)}&challenge_only=eq.true&limit=1` });
      if (gated.length) return { ok: false, status: 403, message: 'This CBT is available through its Brainz Biltz challenge link only.' };
    }
    return { ok: true, challenge: null, participant: null, link: null };
  }
  const challengeRows = await sb(context, 'brainz_biltz_challenges', { query: `select=${BILTZ_CHALLENGE_SELECT}&slug=eq.${enc(slug)}&limit=1` });
  if (!challengeRows.length) return { ok: false, status: 404, message: 'Brainz Biltz challenge not found.' };
  const challenge = challengeRows[0];
  if (quizId && String(challenge.quiz_id) !== String(quizId)) return { ok: false, status: 403, message: 'This challenge link does not match the requested CBT.' };
  // Existing token-bound attempts may be recovered/submitted after a pause, cancellation, or archival.
  // New metadata access and every new start still require a published challenge.
  if (challenge.status !== 'published' && !attemptId) return { ok: false, status: 403, message: challenge.status === 'paused' ? 'This Brainz Biltz challenge is temporarily paused.' : 'This Brainz Biltz challenge is not currently available.' };
  if (!device || device.length < 8) return { ok: false, status: 400, message: 'A valid device identifier is required for this challenge.' };

  let participant = null;
  let link = null;
  if (attemptId) {
    const links = await sb(context, 'brainz_biltz_attempts', { query: `select=id,participant_id,device_id,duration_minutes,started_at&challenge_id=eq.${enc(challenge.id)}&attempt_id=eq.${enc(attemptId)}&device_id=eq.${enc(device)}&limit=1` });
    if (!links.length) return { ok: false, status: 403, message: 'This attempt is not registered to the current Brainz Biltz challenge and device.' };
    link = links[0];
    const pRows = await sb(context, 'brainz_biltz_participants', { query: `select=id,status,participant_name&challenge_id=eq.${enc(challenge.id)}&id=eq.${enc(link.participant_id)}&device_id=eq.${enc(device)}&limit=1` });
    if (!pRows.length) return { ok: false, status: 403, message: 'Challenge registration could not be verified.' };
    participant = pRows[0];
    if (participant.status !== 'approved') {
      const message = participant.status === 'revoked' ? 'Your Brainz Biltz access has been revoked.' : 'Your Brainz Biltz registration is not approved.';
      return { ok: false, status: 403, message, participant, link };
    }
  } else {
    const participants = await sb(context, 'brainz_biltz_participants', { query: `select=id,status,participant_name&challenge_id=eq.${enc(challenge.id)}&device_id=eq.${enc(device)}&limit=1` });
    participant = participants[0] || null;
    if (!participant || participant.status !== 'approved') {
      const status = participant?.status || 'unregistered';
      const message = status === 'pending_payment' ? 'Your entry is awaiting payment verification.' : status === 'pending_approval' ? 'Your Brainz Biltz entry is awaiting administrator approval.' : status === 'rejected' ? 'Your challenge entry was not approved. Contact the administrator.' : status === 'revoked' ? 'Your challenge access has been revoked. Contact the administrator.' : 'Register for this Brainz Biltz challenge before entering.';
      return { ok: false, status: 403, message, participant };
    }
  }

  const now = Date.now();
  const startAt = Date.parse(challenge.start_at || '') || 0;
  const endAt = Date.parse(challenge.end_at || '') || 0;
  if (starting) {
    if (now < startAt) return { ok: false, status: 403, message: `Brainz Biltz opens at ${new Date(startAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT.` };
    if (now > endAt) return { ok: false, status: 403, message: 'The Brainz Biltz entry window has closed.' };
    if (challenge.finish_policy === 'finish_by_end' && now + Number(challenge.duration_minutes) * 60000 > endAt) return { ok: false, status: 403, message: 'There is not enough time left to complete this challenge before it closes.' };
  } else if (!attemptId) {
    if (now < startAt) return { ok: false, status: 403, message: `This challenge opens at ${new Date(startAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT.` };
    if (now > endAt) {
      // Permit reload/recovery only when this device already has an in-progress attempt.
      const priorLinks = await sb(context, 'brainz_biltz_attempts', { query: `select=attempt_id,duration_minutes,started_at&challenge_id=eq.${enc(challenge.id)}&participant_id=eq.${enc(participant.id)}&device_id=eq.${enc(device)}&order=started_at.desc&limit=10` });
      let hasLiveAttempt = false;
      if (priorLinks.length) {
        const ids = priorLinks.map(x => enc(x.attempt_id));
        const attempts = await sb(context, 'attempts', { query: `select=id,status,started_at&id=in.(${ids.join(',')})&status=in.(started,submitted)` });
        const byId = new Map(attempts.map(x => [String(x.id), x]));
        hasLiveAttempt = priorLinks.some(x => {
          const a = byId.get(String(x.attempt_id));
          if (!a) return false;
          if (a.status === 'submitted') return true;
          const at = Date.parse(a.started_at || x.started_at || '') || 0;
          return now <= at + Number(x.duration_minutes || challenge.duration_minutes) * 60000 + 5 * 60000;
        });
      }
      if (!hasLiveAttempt) return { ok: false, status: 403, message: 'This Brainz Biltz challenge has ended.' };
    }
  }
  return { ok: true, challenge, participant, link };
}
async function biltzChallengePublicPayload(context, challenge, deviceId) {
  const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,description,duration,status&id=eq.${enc(challenge.quiz_id)}&limit=1` });
  const quiz = quizRows[0] || {};
  const qRows = await sb(context, 'questions', { query: `select=id&quiz_id=eq.${enc(challenge.quiz_id)}&limit=5000` });
  const participantRows = deviceId ? await sb(context, 'brainz_biltz_participants', { query: `select=id,status,participant_name,created_at,approved_at&challenge_id=eq.${enc(challenge.id)}&device_id=eq.${enc(deviceId)}&limit=1` }) : [];
  return {
    ...challenge,
    quiz_slug: quiz.slug || '',
    quiz_title: quiz.title || 'Challenge assessment',
    question_count: qRows.length,
    participant: participantRows[0] ? { id: participantRows[0].id, status: participantRows[0].status, participantName: participantRows[0].participant_name, createdAt: participantRows[0].created_at, approvedAt: participantRows[0].approved_at } : null
  };
}

async function handler(context) {
  const request = context.request;
  if (request.method === 'OPTIONS') {
    const allowed = env(context, 'ALLOWED_ORIGIN');
    return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-origin': allowed && allowed !== '*' ? allowed : '*', ...securityHeaders } });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try { body = await request.json(); } catch { return bad('Invalid JSON body.'); }
  }

  try {
    if (action.startsWith('hub-integration-')) {
      if (request.method !== 'POST') return bad('Use POST for account and sync operations.', 405);
      return await handleEduSpaceBridge(action, request, body, {context, env:name=>env(context,name), sb});
    }
    if (action === 'health' && request.method === 'GET') {
      const databaseConfigured = Boolean(sbBase(context) && sbKey(context));
      const aiConfigured = Boolean(env(context, 'GROQ_API_KEY'));
      let databaseOk = false;
      let databaseError = '';
      if (databaseConfigured) {
        try {
          const requiredTables = ['quizzes','quiz_sections','passages','questions','attempts','attempt_answers','cbt_libraries','cbt_library_items','cbt_library_device_access','quiz_device_access','app_settings','student_feedback','question_pools','pool_topics','pool_device_access','pool_practice_attempts','pool_practice_answers','pool_study_progress','pool_progress','pool_question_exposure','brainz_biltz_challenges','brainz_biltz_participants','brainz_biltz_attempts'];
          for (const table of requiredTables) {
            try {
              await sb(context, table, { query: 'select=id&limit=1' });
            } catch (error) {
              throw new Error(`${table}: ${error?.message || 'table check failed'}`);
            }
          }
          databaseOk = true;
        } catch (error) {
          databaseError = String(error?.message || 'Database check failed.');
        }
      } else {
        databaseError = 'SUPABASE_URL or SUPABASE_SECRET_KEY is missing in EdgeOne.';
      }
      return json({ ok: databaseOk && aiConfigured, service: 'Gifted Brainz CBT API', build: 'v50.0.0-brainz-biltz-auditfix-20261029', databaseConfigured, databaseOk, databaseError, aiConfigured, time: new Date().toISOString() });
    }

    if (action === 'login' && request.method === 'POST') {
      if (!env(context, 'ADMIN_PASSWORD') || !env(context, 'SESSION_SECRET')) return bad('Admin authentication is not configured.', 500);
      const ip = clientIp(request);
      const now = Date.now();
      if (loginBlocked(ip, now)) return bad('Too many failed sign-in attempts. Please try again later.', 429);
      if (String(body.password || '') !== String(env(context, 'ADMIN_PASSWORD'))) {
        const rec = loginFailures.get(ip);
        if (!rec || now - rec.windowStart > LOGIN_WINDOW_MS) loginFailures.set(ip, { count: 1, windowStart: now, lockedUntil: 0 });
        else { rec.count += 1; if (rec.count >= LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + LOGIN_LOCK_MS; }
        return bad('Invalid admin password.', 401);
      }
      loginFailures.delete(ip);
      return json({ token: await issueSession(context) });
    }

    if (action === 'biltz-public' && request.method === 'GET') {
      const slug = cleanText(url.searchParams.get('id'));
      if (!slug) return bad('Brainz Biltz challenge link is required.');
      const rows = await sb(context, 'brainz_biltz_challenges', { query: `select=${BILTZ_CHALLENGE_SELECT}&slug=eq.${enc(slug)}&limit=1` });
      if (!rows.length || rows[0].status === 'draft' || rows[0].status === 'archived') return bad('Brainz Biltz challenge not found or no longer available.', 404);
      const quizStatusRows = await sb(context, 'quizzes', { query: `select=id,status&id=eq.${enc(rows[0].quiz_id)}&limit=1` });
      if (!quizStatusRows.length || quizStatusRows[0].status !== 'published') return bad('The assessment for this challenge is no longer published. Please contact the administrator.', 409);
      return json({ challenge: await biltzChallengePublicPayload(context, rows[0], deviceIdForRequest(request)) });
    }

    if (action === 'biltz-register' && request.method === 'POST') {
      const slug = cleanText(body.challengeSlug);
      const deviceId = deviceIdForRequest(request, body);
      const participantName = cleanText(body.participantName).slice(0, 200);
      const contact = cleanText(body.contact).slice(0, 200);
      const paymentReference = cleanText(body.paymentReference).slice(0, 200);
      if (!slug) return bad('Brainz Biltz challenge is required.');
      if (deviceId.length < 8) return bad('A valid device ID is required to register.');
      if (!participantName) return bad('Enter your name to register for the challenge.');
      const challengeRows = await sb(context, 'brainz_biltz_challenges', { query: `select=${BILTZ_CHALLENGE_SELECT}&slug=eq.${enc(slug)}&limit=1` });
      if (!challengeRows.length || challengeRows[0].status !== 'published') return bad('This Brainz Biltz challenge is not available for registration.', 404);
      const challenge = challengeRows[0];
      const now = Date.now();
      if (now > Date.parse(challenge.end_at)) return bad('Registration is closed because the challenge entry window has ended.', 409);
      const existing = await sb(context, 'brainz_biltz_participants', { query: `select=id,status,participant_name,created_at,approved_at&challenge_id=eq.${enc(challenge.id)}&device_id=eq.${enc(deviceId)}&limit=1` });
      if (!existing.length && challenge.max_participants) {
        const countRows = await sb(context, 'brainz_biltz_participants', { query: `select=id&challenge_id=eq.${enc(challenge.id)}&status=not.in.(rejected,revoked)&limit=${Number(challenge.max_participants) + 1}` });
        if (countRows.length >= Number(challenge.max_participants)) return bad('This Brainz Biltz challenge has reached its registration limit.', 409);
      }
      const initialStatus = Number(challenge.entry_fee) > 0 ? 'pending_payment' : challenge.access_mode === 'private' ? 'pending_approval' : 'approved';
      let participant;
      if (existing.length) {
        participant = existing[0];
        if (['rejected','revoked'].includes(participant.status)) {
          const updated = await sb(context, 'brainz_biltz_participants', { method: 'PATCH', query: `id=eq.${enc(participant.id)}&select=id,status,participant_name,created_at,approved_at`, body: { participant_name: participantName, contact, payment_reference: paymentReference, status: initialStatus, approved_at: initialStatus === 'approved' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, headers: { prefer: 'return=representation' } });
          participant = updated?.[0] || { ...participant, status: initialStatus, participant_name: participantName };
        } else {
          const updated = await sb(context, 'brainz_biltz_participants', { method: 'PATCH', query: `id=eq.${enc(participant.id)}&select=id,status,participant_name,created_at,approved_at`, body: { participant_name: participantName, contact, payment_reference: paymentReference, updated_at: new Date().toISOString() }, headers: { prefer: 'return=representation' } });
          participant = updated?.[0] || participant;
        }
      } else {
        const created = await sb(context, 'brainz_biltz_participants', { method: 'POST', query: 'select=id,status,participant_name,created_at,approved_at', body: { challenge_id: challenge.id, device_id: deviceId, participant_name: participantName, contact, payment_reference: paymentReference, status: initialStatus, approved_at: initialStatus === 'approved' ? new Date().toISOString() : null }, headers: { prefer: 'return=representation' } });
        participant = created?.[0];
      }
      if (!participant) return bad('Your registration could not be saved. Please try again.', 500);
      const message = participant.status === 'approved' ? 'Registration complete. You can enter when the challenge opens.' : participant.status === 'pending_payment' ? 'Registration saved. Your entry is awaiting payment verification.' : 'Registration saved. The administrator must approve your entry.';
      return json({ ok: true, participant: { id: participant.id, status: participant.status, participantName: participant.participant_name, createdAt: participant.created_at, approvedAt: participant.approved_at }, message });
    }

    if (action === 'biltz-list' && request.method === 'GET') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const rows = await sbAll(context, 'brainz_biltz_challenges', `select=${BILTZ_CHALLENGE_SELECT}&order=created_at.desc`, 100, 10000);
      const quizIds = [...new Set(rows.map(x => String(x.quiz_id)))];
      const quizMap = new Map();
      if (quizIds.length) {
        const qs = await sb(context, 'quizzes', { query: `select=id,slug,title,status&id=in.(${quizIds.map(enc).join(',')})` });
        qs.forEach(q => quizMap.set(String(q.id), q));
      }
      const counts = new Map();
      for (const row of rows) counts.set(String(row.id), { total: 0, pending: 0, approved: 0 });
      const participantRows = await sbAll(context, 'brainz_biltz_participants', 'select=id,challenge_id,status&order=created_at.desc', 500, 50000);
      for (const p of participantRows) {
        const c = counts.get(String(p.challenge_id));
        if (!c) continue;
        c.total++;
        if (['pending_payment','pending_approval'].includes(p.status)) c.pending++;
        if (p.status === 'approved') c.approved++;
      }
      return json({ challenges: rows.map(row => ({ ...row, quiz_title: quizMap.get(String(row.quiz_id))?.title || 'Missing CBT', quiz_slug: quizMap.get(String(row.quiz_id))?.slug || '', quiz_status: quizMap.get(String(row.quiz_id))?.status || 'missing', participant_counts: counts.get(String(row.id)) || { total: 0, pending: 0, approved: 0 } })) });
    }

    if (action === 'biltz-save' && request.method === 'POST') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const id = cleanText(body.id);
      const title = cleanText(body.title).slice(0, 180);
      const description = cleanText(body.description).slice(0, 1200);
      const quizId = cleanText(body.quizId);
      const startAt = Date.parse(body.startAt || '');
      const endAt = Date.parse(body.endAt || '');
      const durationRaw = Number(body.durationMinutes ?? 30);
      const durationMinutes = durationRaw;
      const entryFee = Number(body.entryFee ?? 0);
      const accessMode = cleanText(body.accessMode).toLowerCase() === 'private' ? 'private' : 'public';
      const status = ['draft','published','paused','cancelled','archived'].includes(cleanText(body.status)) ? cleanText(body.status) : 'draft';
      const finishPolicy = cleanText(body.finishPolicy) === 'finish_by_end' ? 'finish_by_end' : 'full_duration';
      const leaderboardRelease = ['immediate','after_end','manual'].includes(cleanText(body.leaderboardRelease)) ? cleanText(body.leaderboardRelease) : 'after_end';
      const attemptLimit = Number(body.attemptLimit ?? 1);
      const maxParticipantsRaw = cleanText(body.maxParticipants);
      const maxParticipants = maxParticipantsRaw ? Number(maxParticipantsRaw) : null;
      const coverImageUrl = cleanText(body.coverImageUrl).slice(0, 1200);
      const paymentInstructions = cleanText(body.paymentInstructions).slice(0, 1800);
      if (id && !isUuid(id)) return bad('Invalid Brainz Biltz challenge identifier.');
      if (!title) return bad('Challenge title is required.');
      if (!isUuid(quizId)) return bad('Select a valid CBT for this challenge.');
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return bad('Choose a valid start time and a closing time later than the start time.');
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) return bad('Challenge duration must be a whole number between 1 and 600 minutes.');
      if (!Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 100) return bad('Attempts per participant must be a whole number between 1 and 100.');
      if (maxParticipants !== null && (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 1000000)) return bad('Participant limit must be blank or a whole number between 1 and 1,000,000.');
      if (!Number.isFinite(entryFee) || entryFee < 0 || entryFee > 100000000) return bad('Entry fee must be zero or a positive amount.');
      if (coverImageUrl) { try { const u = new URL(coverImageUrl); if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return bad('Cover image must be a valid HTTPS URL.'); } catch { return bad('Cover image must be a valid HTTPS URL.'); } }
      const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,status,duration&id=eq.${enc(quizId)}&limit=1` });
      if (!quizRows.length) return bad('The selected CBT was not found.', 404);
      if (status === 'published' && quizRows[0].status !== 'published') return bad('Publish the selected CBT before publishing this Brainz Biltz challenge.');
      // Paid or private challenges must always gate the ordinary CBT URL; otherwise the fee/access rule could be bypassed.
      const challengeOnly = body.challengeOnly !== false || accessMode === 'private' || entryFee > 0;
      const payload = { title, description, quiz_id: quizId, cover_image_url: coverImageUrl, start_at: new Date(startAt).toISOString(), end_at: new Date(endAt).toISOString(), duration_minutes: durationMinutes, entry_fee: Number(entryFee.toFixed(2)), access_mode: accessMode, status, challenge_only: challengeOnly, attempt_limit: attemptLimit, max_participants: maxParticipants, finish_policy: finishPolicy, leaderboard_enabled: body.leaderboardEnabled !== false, leaderboard_release: leaderboardRelease, review_enabled: body.reviewEnabled !== false, payment_instructions: paymentInstructions, updated_at: new Date().toISOString() };
      let saved;
      if (id) {
        const found = await sb(context, 'brainz_biltz_challenges', { query: `select=id,slug,quiz_id,start_at,end_at,duration_minutes,entry_fee,access_mode,attempt_limit,max_participants,finish_policy,challenge_only&id=eq.${enc(id)}&limit=1` });
        if (!found.length) return bad('Brainz Biltz challenge not found.', 404);
        const registeredParticipants = await sb(context, 'brainz_biltz_participants', { query: `select=id&challenge_id=eq.${enc(id)}&limit=1` });
        if (registeredParticipants.length) {
          const lockedFields = ['quiz_id','start_at','end_at','duration_minutes','entry_fee','access_mode','attempt_limit','max_participants','finish_policy','challenge_only'];
          const differs = (field) => {
            const before = found[0][field];
            const after = payload[field];
            if (field === 'start_at' || field === 'end_at') return (Date.parse(before || '') || 0) !== (Date.parse(after || '') || 0);
            if (['duration_minutes','entry_fee','attempt_limit','max_participants'].includes(field)) {
              if (before === null || before === undefined || after === null || after === undefined || before === '' || after === '') return (before ?? null) !== (after ?? null) && !(before == null && after == null);
              return Number(before) !== Number(after);
            }
            return String(before ?? '') !== String(after ?? '');
          };
          const changedLockedField = lockedFields.some(differs);
          if (changedLockedField) return bad('The challenge schedule, CBT, entry fee, access mode, attempt limit, participant limit, and closing policy cannot be changed after registration begins. Create a new Brainz Biltz challenge for different settings.', 409);
        }
        const updated = await sb(context, 'brainz_biltz_challenges', { method: 'PATCH', query: `id=eq.${enc(id)}&select=${BILTZ_CHALLENGE_SELECT}`, body: payload, headers: { prefer: 'return=representation' } });
        saved = updated?.[0];
      } else {
        payload.slug = await uniqueBiltzSlug(context, title);
        const created = await sb(context, 'brainz_biltz_challenges', { method: 'POST', query: `select=${BILTZ_CHALLENGE_SELECT}`, body: payload, headers: { prefer: 'return=representation' } });
        saved = created?.[0];
      }
      if (!saved) return bad('Challenge could not be saved. Please try again.', 500);
      return json({ ok: true, challenge: { ...saved, quiz_title: quizRows[0].title, quiz_slug: quizRows[0].slug }, message: status === 'published' ? 'Brainz Biltz challenge published.' : 'Brainz Biltz challenge saved.' });
    }

    if (action === 'biltz-participants' && request.method === 'GET') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const challengeId = cleanText(url.searchParams.get('challengeId'));
      if (!isUuid(challengeId)) return bad('A valid challenge identifier is required.');
      const challengeRows = await sb(context, 'brainz_biltz_challenges', { query: `select=id,title&id=eq.${enc(challengeId)}&limit=1` });
      if (!challengeRows.length) return bad('Brainz Biltz challenge not found.', 404);
      const rows = await sbAll(context, 'brainz_biltz_participants', `select=id,challenge_id,device_id,participant_name,contact,status,payment_reference,admin_note,created_at,updated_at,approved_at&challenge_id=eq.${enc(challengeId)}&order=created_at.desc`, 100, 20000);
      const links = await sbAll(context, 'brainz_biltz_attempts', `select=participant_id,attempt_id,started_at&challenge_id=eq.${enc(challengeId)}`, 100, 20000);
      const attemptIds = [...new Set(links.map(x => String(x.attempt_id)))];
      const attempts = attemptIds.length ? await sb(context, 'attempts', { query: `select=id,status,score,total,percent,time_used,submitted_at&id=in.(${attemptIds.map(enc).join(',')})` }) : [];
      const attemptMap = new Map(attempts.map(x => [String(x.id), x]));
      const perParticipant = new Map();
      for (const link of links) { const a = attemptMap.get(String(link.attempt_id)); const key = String(link.participant_id); if (!perParticipant.has(key)) perParticipant.set(key, []); if (a) perParticipant.get(key).push({ ...a, started_at: link.started_at }); }
      return json({ challenge: challengeRows[0], participants: rows.map(row => ({ ...row, attempts: perParticipant.get(String(row.id)) || [] })) });
    }

    if (action === 'biltz-participant-status' && request.method === 'POST') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const id = cleanText(body.participantId);
      const status = cleanText(body.status).toLowerCase();
      const adminNote = cleanText(body.adminNote).slice(0, 1000);
      if (!isUuid(id)) return bad('Invalid participant identifier.');
      if (!['approved','rejected','revoked','pending_payment','pending_approval'].includes(status)) return bad('Invalid registration status.');
      const rows = await sb(context, 'brainz_biltz_participants', { method: 'PATCH', query: `id=eq.${enc(id)}&select=id,challenge_id,participant_name,status,approved_at`, body: { status, admin_note: adminNote, approved_at: status === 'approved' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, headers: { prefer: 'return=representation' } });
      if (!rows?.length) return bad('Participant registration was not found.', 404);
      return json({ ok: true, participant: rows[0] });
    }

    if (action === 'biltz-publish-results' && request.method === 'POST') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const id = cleanText(body.challengeId);
      const publish = body.published !== false;
      if (!isUuid(id)) return bad('Invalid Brainz Biltz challenge identifier.');
      const rows = await sb(context, 'brainz_biltz_challenges', { method: 'PATCH', query: `id=eq.${enc(id)}&select=id,results_published`, body: { results_published: publish, updated_at: new Date().toISOString() }, headers: { prefer: 'return=representation' } });
      if (!rows?.length) return bad('Brainz Biltz challenge not found.', 404);
      return json({ ok: true, resultsPublished: rows[0].results_published });
    }

    if (action === 'biltz-leaderboard' && request.method === 'GET') {
      const slug = cleanText(url.searchParams.get('id'));
      if (!slug) return bad('Brainz Biltz challenge identifier is required.');
      const rows = await sb(context, 'brainz_biltz_challenges', { query: `select=${BILTZ_CHALLENGE_SELECT}&slug=eq.${enc(slug)}&limit=1` });
      if (!rows.length) return bad('Brainz Biltz challenge not found.', 404);
      const challenge = rows[0];
      if (challenge.status === 'draft' || challenge.status === 'archived') return bad('Brainz Biltz challenge not found or no longer available.', 404);
      if (!challenge.leaderboard_enabled) return bad('The leaderboard is disabled for this challenge.', 403);
      if (challenge.access_mode === 'private' && !(await isAdmin(context, request))) {
        const deviceId = deviceIdForRequest(request);
        const registrations = deviceId ? await sb(context, 'brainz_biltz_participants', { query: `select=id,status&challenge_id=eq.${enc(challenge.id)}&device_id=eq.${enc(deviceId)}&limit=1` }) : [];
        if (registrations[0]?.status !== 'approved') return bad('This Brainz Biltz leaderboard is private. An approved participant account is required.', 403);
      }
      const ended = Date.now() > Date.parse(challenge.end_at || '') || ['cancelled','archived'].includes(challenge.status);
      if (challenge.leaderboard_release === 'after_end' && !ended) return bad('The leaderboard will be available after the challenge closes.', 403);
      if (challenge.leaderboard_release === 'manual' && !challenge.results_published) return bad('Challenge results have not been published yet.', 403);
      const links = await sbAll(context, 'brainz_biltz_attempts', `select=attempt_id,participant_id&challenge_id=eq.${enc(challenge.id)}`, 100, 50000);
      const ids = [...new Set(links.map(x => String(x.attempt_id)))];
      if (!ids.length) return json({ challenge: { title: challenge.title, slug: challenge.slug }, leaderboard: [] });
      const attempts = await sbAll(context, 'attempts', `select=id,student_name,score,total,percent,time_used,submitted_at,status&status=eq.submitted&id=in.(${ids.map(enc).join(',')})`, 100, 50000);
      const byId = new Map(attempts.map(a => [String(a.id), a]));
      const best = new Map();
      for (const link of links) {
        const a = byId.get(String(link.attempt_id));
        if (!a) continue;
        const key = String(link.participant_id);
        const prior = best.get(key);
        if (!prior || Number(a.percent) > Number(prior.percent) || (Number(a.percent) === Number(prior.percent) && Number(a.time_used) < Number(prior.time_used))) best.set(key, { ...a, participant_id: key });
      }
      const leaderboard = [...best.values()].sort((a,b) => Number(b.percent)-Number(a.percent) || Number(a.time_used)-Number(b.time_used) || String(a.id).localeCompare(String(b.id))).slice(0, 1000).map((a,i) => ({ rank: i+1, name: a.student_name || 'Participant', score: Math.round(Number(a.score)||0), total: Math.round(Number(a.total)||0), percent: Number(a.percent)||0, timeUsed: Number(a.time_used)||0, submittedAt: a.submitted_at }));
      return json({ challenge: { title: challenge.title, slug: challenge.slug }, leaderboard });
    }

    if (action === 'public-library' && request.method === 'GET') {
      const identifier=cleanText(url.searchParams.get('id'));
      if(!identifier)return bad('CBT Library link is required.');
      const deviceId=deviceIdForRequest(request);
      const libraryRows=await sb(context,'cbt_libraries',{query:`select=id,slug,name,description,access_mode&slug=eq.${enc(identifier)}&limit=1`});
      if(!libraryRows.length)return bad('CBT Library not found.',404);
      const library=libraryRows[0];
      if(library.access_mode==='private'&&!(await isDeviceAuthorizedForLibrary(context,library.id,deviceId)))return privateLibraryDenied(library,deviceId,await getAdministratorWhatsAppNumber(context));
      const items=await sbAll(context,'cbt_library_items',`select=quiz_id,position&library_id=eq.${enc(library.id)}&order=position.asc,created_at.asc`,500,5000);
      if(!items.length)return json({library:{...library,quizzes:[]}});
      const quizIds=[...new Set(items.map(x=>String(x.quiz_id)))];
      const filter=`(${quizIds.map(enc).join(',')})`;
      const quizzes=await sb(context,'quizzes',{query:`select=id,slug,title,description,duration,status&status=eq.published&id=in.${filter}&order=created_at.desc`});
      const byId=new Map(quizzes.map(q=>[String(q.id),q]));
      const ordered=items.map(item=>{const q=byId.get(String(item.quiz_id));return q?{...q}:null}).filter(Boolean);
      return json({library:{...library,quizzes:ordered}});
    }

    if (action === 'library-device-activate' && request.method === 'POST') {
      const librarySlug=cleanText(body.librarySlug);
      const deviceId=deviceIdForRequest(request,body);
      const activationCode=cleanText(body.activationCode).toUpperCase().replace(/\s+/g,'');
      const studentName=cleanText(body.studentName).slice(0,150);
      if(!librarySlug)return bad('Private library identifier is required.');
      if(deviceId.length<8)return bad('A valid device ID is required.');
      if(!studentName)return bad('Enter your name to activate this device.');
      if(!/^[A-Z2-9-]{10,40}$/.test(activationCode))return bad('Enter the activation code provided by the administrator.');
      const libraryRows=await sb(context,'cbt_libraries',{query:`select=id,slug,name,access_mode&slug=eq.${enc(librarySlug)}&limit=1`});
      if(!libraryRows.length)return bad('CBT Library not found.',404);
      const library=libraryRows[0];
      if(library.access_mode!=='private')return bad('This library is public and does not require activation.');
      const codeHash=await sha256Hex(activationCode);
      const rows=await sb(context,'cbt_library_device_access',{query:`select=id,activation_expires_at&library_id=eq.${enc(library.id)}&device_id=eq.${enc(deviceId)}&activation_code_hash=eq.${enc(codeHash)}&is_active=eq.false&limit=1`});
      if(!rows.length)return bad('The activation code is invalid, expired, or was issued for a different device.',403);
      if(rows[0].activation_expires_at&&Date.parse(rows[0].activation_expires_at)<=Date.now())return bad('This activation code has expired. Ask the administrator to generate a new one.',403);
      const updated=await sb(context,'cbt_library_device_access',{method:'PATCH',query:`id=eq.${enc(rows[0].id)}&select=id`,body:{is_active:true,student_name:studentName,activated_at:new Date().toISOString(),activation_code_hash:null,activation_expires_at:null,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
      if(!updated?.length)return bad('Device activation could not be saved. Please try again.',500);
      return json({ok:true,librarySlug:library.slug,libraryName:library.name,message:'Device activated successfully.'});
    }

    if (action === 'public-pool' && request.method === 'GET') {
      const identifier=cleanText(url.searchParams.get('id'));
      if(!identifier)return bad('Question Pool link is required.');
      const deviceId=deviceIdForRequest(request);
      const poolRows=await sb(context,'question_pools',{query:`select=id,slug,name,description,access_mode&slug=eq.${enc(identifier)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      const pool=poolRows[0];
      if(pool.access_mode==='private'&&!(await isDeviceAuthorizedForPool(context,pool.id,deviceId)))return privatePoolDenied(pool,deviceId,await getAdministratorWhatsAppNumber(context));
      const topics=await sbAll(context,'pool_topics',`select=id,name,position&pool_id=eq.${enc(pool.id)}&order=position.asc,created_at.asc`,200,2000);
      const counts=new Map();
      if(topics.length){
        const rows=await sbAll(context,'questions',`select=topic_id&pool_id=eq.${enc(pool.id)}&topic_id=not.is.null&needs_review=eq.false`,500,50000);
        for(const r of rows){const k=String(r.topic_id);counts.set(k,(counts.get(k)||0)+1);}
      }
      // Progress for this device: how much of each topic it has covered in the current
      // cycle (a "cycle" is one full pass through the pool's questions — see
      // currentPoolCycle/advancePoolCycle), plus a lifetime accuracy-based recommendation.
      const cycle=deviceId?await currentPoolCycle(context,pool.id,deviceId):1;
      let solvedByTopic=new Map();
      let timesSeen=0,timesCorrect=0;
      if(deviceId&&topics.length){
        const exposure=await sbAll(context,'pool_question_exposure',`select=topic_id,cycle,times_seen,times_correct&pool_id=eq.${enc(pool.id)}&device_id=eq.${enc(deviceId)}`,500,50000);
        for(const e of exposure){
          timesSeen+=Number(e.times_seen)||0;timesCorrect+=Number(e.times_correct)||0;
          if(Number(e.cycle)===cycle){const k=String(e.topic_id);solvedByTopic.set(k,(solvedByTopic.get(k)||0)+1);}
        }
      }
      const topicsOut=topics.map(t=>{const total=counts.get(String(t.id))||0;const solved=Math.min(total,solvedByTopic.get(String(t.id))||0);return {id:t.id,name:t.name,questionCount:total,solvedThisCycle:solved,percentSolved:total?Math.round((solved/total)*100):0};});
      const recommendation=poolRecommendation(timesSeen,timesCorrect);
      return json({pool:{id:pool.id,slug:pool.slug,name:pool.name,description:pool.description,accessMode:pool.access_mode,topics:topicsOut,progress:{cycle,timesSeen,timesCorrect,accuracyPercent:timesSeen?Math.round((timesCorrect/timesSeen)*100):null,recommendation}}});
    }

    if (action === 'quiz-device-activate' && request.method === 'POST') {
      const quizSlug=cleanText(body.quizSlug);
      const deviceId=deviceIdForRequest(request,body);
      const activationCode=cleanText(body.activationCode).toUpperCase().replace(/\s+/g,'');
      const studentName=cleanText(body.studentName).slice(0,150);
      if(!quizSlug)return bad('Private quiz identifier is required.');
      if(deviceId.length<8)return bad('A valid device ID is required.');
      if(!studentName)return bad('Enter your name to activate this device.');
      if(!/^[A-Z2-9-]{10,40}$/.test(activationCode))return bad('Enter the activation code provided by the administrator.');
      const quizRows=await sb(context,'quizzes',{query:`select=id,slug,title,access_mode,status&slug=eq.${enc(quizSlug)}&status=eq.published&limit=1`});
      if(!quizRows.length)return bad('Quiz not found or not published.',404);
      const quiz=quizRows[0];
      if(quiz.access_mode!=='private')return bad('This quiz is public and does not require activation.');
      const codeHash=await sha256Hex(activationCode);
      const rows=await sb(context,'quiz_device_access',{query:`select=id,activation_expires_at&quiz_id=eq.${enc(quiz.id)}&device_id=eq.${enc(deviceId)}&activation_code_hash=eq.${enc(codeHash)}&is_active=eq.false&limit=1`});
      if(!rows.length)return bad('The activation code is invalid, expired, or was issued for a different device or quiz.',403);
      if(rows[0].activation_expires_at&&Date.parse(rows[0].activation_expires_at)<=Date.now())return bad('This activation code has expired. Ask the administrator to generate a new one.',403);
      const updated=await sb(context,'quiz_device_access',{method:'PATCH',query:`id=eq.${enc(rows[0].id)}&select=id`,body:{is_active:true,student_name:studentName,activated_at:new Date().toISOString(),activation_code_hash:null,activation_expires_at:null,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
      if(!updated?.length)return bad('Device activation could not be saved. Please try again.',500);
      return json({ok:true,quizSlug:quiz.slug,quizName:quiz.title,message:'Private quiz activated successfully.'});
    }

    if (action === 'pool-device-activate' && request.method === 'POST') {
      const poolSlug=cleanText(body.poolSlug);
      const deviceId=deviceIdForRequest(request,body);
      const activationCode=cleanText(body.activationCode).toUpperCase().replace(/\s+/g,'');
      const studentName=cleanText(body.studentName).slice(0,150);
      if(!poolSlug)return bad('Private Question Pool identifier is required.');
      if(deviceId.length<8)return bad('A valid device ID is required.');
      if(!studentName)return bad('Enter your name to activate this device.');
      if(!/^[A-Z2-9-]{10,40}$/.test(activationCode))return bad('Enter the activation code provided by the administrator.');
      const poolRows=await sb(context,'question_pools',{query:`select=id,slug,name,access_mode&slug=eq.${enc(poolSlug)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      const pool=poolRows[0];
      if(pool.access_mode!=='private')return bad('This Question Pool is public and does not require activation.');
      const codeHash=await sha256Hex(activationCode);
      const rows=await sb(context,'pool_device_access',{query:`select=id,activation_expires_at&pool_id=eq.${enc(pool.id)}&device_id=eq.${enc(deviceId)}&activation_code_hash=eq.${enc(codeHash)}&is_active=eq.false&limit=1`});
      if(!rows.length)return bad('The activation code is invalid, expired, or was issued for a different device.',403);
      if(rows[0].activation_expires_at&&Date.parse(rows[0].activation_expires_at)<=Date.now())return bad('This activation code has expired. Ask the administrator to generate a new one.',403);
      const updated=await sb(context,'pool_device_access',{method:'PATCH',query:`id=eq.${enc(rows[0].id)}&select=id`,body:{is_active:true,student_name:studentName,activated_at:new Date().toISOString(),activation_code_hash:null,activation_expires_at:null,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
      if(!updated?.length)return bad('Device activation could not be saved. Please try again.',500);
      return json({ok:true,poolSlug:pool.slug,poolName:pool.name,message:'Device activated successfully.'});
    }

    if (action === 'pool-session-start' && request.method === 'POST') {
      const poolSlug=cleanText(body.poolSlug);
      const mode=cleanText(body.mode)==='practice'?'practice':'study';
      const topicIds=[...new Set((Array.isArray(body.topicIds)?body.topicIds:[]).map(x=>cleanText(x)).filter(isUuid))].slice(0,100);
      if(!poolSlug)return bad('Question Pool identifier is required.');
      if(!topicIds.length)return bad('Select at least one topic.');
      const deviceId=deviceIdForRequest(request,body);
      if(!deviceId)return bad('A device identifier is required. Please enable browser storage and try again.',400);
      const poolRows=await sb(context,'question_pools',{query:`select=id,slug,name,access_mode&slug=eq.${enc(poolSlug)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      const pool=poolRows[0];
      if(pool.access_mode==='private'&&!(await isDeviceAuthorizedForPool(context,pool.id,deviceId)))return privatePoolDenied(pool,deviceId,await getAdministratorWhatsAppNumber(context));
      const topicRows=await sb(context,'pool_topics',{query:`select=id&pool_id=eq.${enc(pool.id)}&id=in.(${topicIds.map(enc).join(',')})`});
      if(topicRows.length!==topicIds.length)return bad('One or more selected topics were not found in this pool.',400);

      const select='id,topic_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,image_data,passage_id';
      let pool_questions=await sbAll(context,'questions',`select=${select}&pool_id=eq.${enc(pool.id)}&topic_id=in.(${topicIds.map(enc).join(',')})&needs_review=eq.false&order=position.asc,created_at.asc`,200,20000);
      if(!pool_questions.length)return bad('The selected topics have no questions yet.',400);

      if(mode==='study'){
        // Resume existing progress for the same device+pool when the selected topic set matches.
        const existing=await sb(context,'pool_study_progress',{query:`select=*&pool_id=eq.${enc(pool.id)}&device_id=eq.${enc(deviceId)}&limit=1`});
        const sameTopics=existing.length&&Array.isArray(existing[0].topic_ids)&&existing[0].topic_ids.length===topicIds.length&&topicIds.every(t=>existing[0].topic_ids.includes(t));
        let orderedIds;
        if(sameTopics&&Array.isArray(existing[0].question_ids)&&existing[0].question_ids.length){
          const byId=new Map(pool_questions.map(q=>[String(q.id),q]));
          orderedIds=existing[0].question_ids.filter(id=>byId.has(String(id)));
          for(const q of pool_questions)if(!orderedIds.includes(String(q.id)))orderedIds.push(String(q.id));
        }else{
          orderedIds=shuffleArray(pool_questions).map(q=>String(q.id));
          await sb(context,'pool_study_progress',{method:'POST',query:'on_conflict=pool_id,device_id&select=id',body:{pool_id:pool.id,device_id:deviceId,topic_ids:topicIds,question_ids:orderedIds,question_index:0,answers:{},flags:[],updated_at:new Date().toISOString()},headers:{prefer:'resolution=merge-duplicates,return=representation'}});
        }
        const byId=new Map(pool_questions.map(q=>[String(q.id),q]));
        const list=orderedIds.map(id=>byId.get(String(id))).filter(Boolean).map(q=>publicPoolQuestion(q,false));
        const progress=sameTopics?existing[0]:null;
        return json({mode:'study',pool:{id:pool.id,slug:pool.slug,name:pool.name},questions:list,progress:{questionIndex:progress?.question_index||0,answers:progress?.answers||{},flags:progress?.flags||[]}});
      }

      // Practice mode: a fresh timed, scored session every time, but the questions it draws
      // from are not repeated until every eligible question in the selected topics has come
      // up at least once in this cycle (tracked via pool_question_exposure). Once the whole
      // set is exhausted, the device's cycle advances and the next session starts a fresh pass.
      let cycle=await currentPoolCycle(context,pool.id,deviceId);
      const exposureRows=await sbAll(context,'pool_question_exposure',`select=question_id,cycle&pool_id=eq.${enc(pool.id)}&device_id=eq.${enc(deviceId)}&question_id=in.(${pool_questions.map(q=>enc(q.id)).join(',')})`,500,20000);
      const exposedThisCycle=new Set(exposureRows.filter(e=>Number(e.cycle)===cycle).map(e=>String(e.question_id)));
      let unseen=pool_questions.filter(q=>!exposedThisCycle.has(String(q.id)));
      if(!unseen.length){
        cycle+=1;
        await advancePoolCycle(context,pool.id,deviceId,cycle);
        unseen=pool_questions;
      }
      const requestedCount=validInteger(body.count,pool_questions.length,1,Math.min(200,pool_questions.length));
      const duration=validInteger(body.duration,Math.max(5,Math.ceil(requestedCount*1.2)),1,180);
      let sampled;
      if(unseen.length>=requestedCount){
        sampled=shuffleArray(unseen).slice(0,requestedCount);
      }else{
        const alreadySeen=pool_questions.filter(q=>!unseen.includes(q));
        sampled=[...shuffleArray(unseen),...shuffleArray(alreadySeen)].slice(0,requestedCount);
      }
      const questionIds=sampled.map(q=>String(q.id));
      const studentName=cleanText(body.studentName).slice(0,200)||'Student';
      const created=await sb(context,'pool_practice_attempts',{method:'POST',query:'select=id,started_at',body:{pool_id:pool.id,device_id:deviceId,topic_ids:topicIds,question_ids:questionIds,duration,cycle,student_name:studentName,total:sampled.reduce((s,q)=>s+Math.max(0.01,Number(q.marks)||1),0),status:'started',result_token:randomToken(36)},headers:{prefer:'return=representation'}});
      if(!created?.length)return bad('Unable to start the practice session. Please try again.',500);
      const startedAt=Date.parse(created[0].started_at);
      const expiresAt=startedAt+Math.max(60,duration*60)*1000+5*60*1000;
      const token=await issuePoolAttemptToken(context,created[0].id,pool.id,expiresAt);
      const list=sampled.map(q=>publicPoolQuestion(q,false));
      return json({mode:'practice',pool:{id:pool.id,slug:pool.slug,name:pool.name},attempt:{id:created[0].id,token,startedAt:created[0].started_at,duration},questions:list});
    }

    if (action === 'pool-study-answer' && request.method === 'POST') {
      const poolSlug=cleanText(body.poolSlug);
      const questionId=cleanText(body.questionId);
      if(!poolSlug||!isUuid(questionId))return bad('Pool and question identifiers are required.');
      const deviceId=deviceIdForRequest(request,body);
      if(!deviceId)return bad('A device identifier is required.',400);
      const poolRows=await sb(context,'question_pools',{query:`select=id,access_mode&slug=eq.${enc(poolSlug)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      const pool=poolRows[0];
      if(pool.access_mode==='private'&&!(await isDeviceAuthorizedForPool(context,pool.id,deviceId)))return privatePoolDenied(pool,deviceId,await getAdministratorWhatsAppNumber(context));
      const qRows=await sb(context,'questions',{query:`select=id,topic_id,answer,explanation,options&pool_id=eq.${enc(pool.id)}&id=eq.${enc(questionId)}&limit=1`});
      if(!qRows.length)return bad('Question not found in this pool.',404);
      const q=qRows[0];
      const selected=Number.isInteger(body.selected)?body.selected:Number(body.selected);
      const isCorrect=Number.isInteger(selected)&&selected===Number(q.answer);
      const progressRows=await sb(context,'pool_study_progress',{query:`select=id,answers,question_index&pool_id=eq.${enc(pool.id)}&device_id=eq.${enc(deviceId)}&limit=1`});
      if(progressRows.length){
        const answers={...(progressRows[0].answers||{}),[questionId]:selected};
        await sb(context,'pool_study_progress',{method:'PATCH',query:`id=eq.${enc(progressRows[0].id)}`,body:{answers,updated_at:new Date().toISOString()},headers:{prefer:'return=minimal'}});
      }
      if(q.topic_id){
        const cycle=await currentPoolCycle(context,pool.id,deviceId);
        await sbRpc(context,'gb_record_pool_exposure_v1',{p_rows:[{pool_id:pool.id,topic_id:q.topic_id,question_id:q.id,device_id:deviceId,cycle,is_correct:isCorrect,mode:'study'}]}).catch(()=>{});
      }
      return json({ok:true,isCorrect,correctAnswer:Number(q.answer),explanation:q.explanation||''});
    }

    if (action === 'pool-study-position' && request.method === 'POST') {
      const poolSlug=cleanText(body.poolSlug);
      if(!poolSlug)return bad('Question Pool identifier is required.');
      const deviceId=deviceIdForRequest(request,body);
      if(!deviceId)return bad('A device identifier is required.',400);
      const poolRows=await sb(context,'question_pools',{query:`select=id&slug=eq.${enc(poolSlug)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      const index=validInteger(body.questionIndex,0,0,100000);
      const flags=Array.isArray(body.flags)?body.flags.map(cleanText).filter(isUuid).slice(0,2000):[];
      await sb(context,'pool_study_progress',{method:'PATCH',query:`pool_id=eq.${enc(poolRows[0].id)}&device_id=eq.${enc(deviceId)}`,body:{question_index:index,flags,updated_at:new Date().toISOString()},headers:{prefer:'return=minimal'}});
      return json({ok:true});
    }

    if (action === 'pool-study-reset' && request.method === 'POST') {
      const poolSlug=cleanText(body.poolSlug);
      if(!poolSlug)return bad('Question Pool identifier is required.');
      const deviceId=deviceIdForRequest(request,body);
      if(!deviceId)return bad('A device identifier is required.',400);
      const poolRows=await sb(context,'question_pools',{query:`select=id&slug=eq.${enc(poolSlug)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      await sb(context,'pool_study_progress',{method:'DELETE',query:`pool_id=eq.${enc(poolRows[0].id)}&device_id=eq.${enc(deviceId)}`});
      return json({ok:true});
    }

    if (action === 'pool-practice-submit' && request.method === 'POST') {
      const attemptId=cleanText(body.attemptId);
      const poolId=cleanText(body.poolId);
      if(!isUuid(attemptId)||!isUuid(poolId))return bad('Attempt and pool identifiers are required.');
      if(!(await verifyPoolAttemptToken(context,body.attemptToken,attemptId,poolId)))return bad('This practice session is invalid or has expired. Please restart.',401);
      const attemptRows=await sb(context,'pool_practice_attempts',{query:`select=*&id=eq.${enc(attemptId)}&pool_id=eq.${enc(poolId)}&limit=1`});
      if(!attemptRows.length)return bad('Practice attempt not found.',404);
      const attempt=attemptRows[0];
      const questionIds=(Array.isArray(attempt.question_ids)?attempt.question_ids:[]).map(String);
      if(attempt.status==='submitted'){
        const questions=await sb(context,'questions',{query:`select=id,text,options,answer,explanation,marks&id=in.(${questionIds.map(enc).join(',')})`});
        const storedAnswers=await sbAll(context,'pool_practice_answers',`select=question_id,selected_answer,is_correct&attempt_id=eq.${enc(attemptId)}`,100,2000);
        const byAnswer=new Map(storedAnswers.map(a=>[String(a.question_id),a]));
        const review=questionIds.map(id=>{const q=questions.find(x=>String(x.id)===id);const a=byAnswer.get(id);return q?{id,text:q.text,options:q.options,correctAnswer:Number(q.answer),explanation:q.explanation||'',selected:a?.selected_answer??null,isCorrect:Boolean(a?.is_correct)}:null;}).filter(Boolean);
        return json({ok:true,score:Math.round(Number(attempt.score)||0),total:Math.round(Number(attempt.total)||0),percent:Number(attempt.percent)||0,timeUsed:Number(attempt.time_used)||0,review});
      }
      const answersIn=body.answers&&typeof body.answers==='object'?body.answers:{};
      const questions=await sb(context,'questions',{query:`select=id,topic_id,text,options,answer,explanation,marks&id=in.(${questionIds.map(enc).join(',')})`});
      let score=0,total=0;
      const rowsToInsert=[];
      const review=[];
      const exposureRows=[];
      for(const id of questionIds){
        const q=questions.find(x=>String(x.id)===id);
        if(!q)continue;
        const marks=Math.max(0.01,Number(q.marks)||1);
        total+=marks;
        const raw=answersIn[id];
        const selected=Number.isInteger(raw)?raw:(Number.isFinite(Number(raw))?Number(raw):null);
        const isCorrect=selected!==null&&selected===Number(q.answer);
        if(isCorrect)score+=marks;
        rowsToInsert.push({attempt_id:attemptId,question_id:id,selected_answer:selected,is_correct:isCorrect});
        review.push({id,text:q.text,options:q.options,correctAnswer:Number(q.answer),explanation:q.explanation||'',selected,isCorrect});
        if(q.topic_id)exposureRows.push({pool_id:poolId,topic_id:q.topic_id,question_id:q.id,device_id:attempt.device_id,cycle:Math.max(1,Number(attempt.cycle)||1),is_correct:isCorrect,mode:'practice'});
      }
      if(rowsToInsert.length)await sb(context,'pool_practice_answers',{method:'POST',query:'select=id',body:rowsToInsert,headers:{prefer:'return=minimal'}});
      if(exposureRows.length)await sbRpc(context,'gb_record_pool_exposure_v1',{p_rows:exposureRows}).catch(()=>{});
      const percent=total>0?Math.round((score/total)*100):0;
      const timeUsed=validInteger(body.timeUsed,0,0,100000);
      const autoSubmitted=Boolean(body.autoSubmitted);
      await sb(context,'pool_practice_attempts',{method:'PATCH',query:`id=eq.${enc(attemptId)}`,body:{score,total,percent,time_used:timeUsed,auto_submitted:autoSubmitted,status:'submitted',submitted_at:new Date().toISOString()},headers:{prefer:'return=minimal'}});
      return json({ok:true,score:Math.round(score),total:Math.round(total),percent,timeUsed,review});
    }

    if (action === 'public-quiz' && request.method === 'GET') {
      const identifier = url.searchParams.get('id') || '';
      if (!identifier) return bad('Quiz link is required.');
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      const rows = await sb(context, 'quizzes', { query: `select=id,slug,title,description,instructions,duration,pass_mark,settings,student_fields,status,result_slug,result_released,access_mode,created_at,updated_at&${isUuid ? `id=eq.${enc(identifier)}` : `slug=eq.${enc(identifier)}`}&status=eq.published&limit=1` });
      if (!rows.length) return bad('Quiz not found or not published.', 404);
      const deviceId=deviceIdForRequest(request);
      const quiz=rows[0];
      const biltzSlug=cleanText(url.searchParams.get('biltz'));
      const biltzAttemptId=cleanText(url.searchParams.get('attemptId'));
      const biltzAccess=await validateBiltzQuizAccess(context,{quizId:quiz.id,challengeSlug:biltzSlug,deviceId,attemptId:biltzSlug?biltzAttemptId:''});
      if(!biltzAccess.ok)return bad(biltzAccess.message,biltzAccess.status);
      if(!biltzAccess.challenge){
        if(quiz.access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quiz.id,deviceId)))return privateQuizDenied(quiz,deviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary=await privateLibraryForQuiz(context,quiz.id,deviceId);
        if(restrictedLibrary)return privateLibraryDenied(restrictedLibrary,deviceId,await getAdministratorWhatsAppNumber(context));
      }
      if(biltzAccess.challenge&&biltzAttemptId){
        const attemptToken=cleanText(url.searchParams.get('attemptToken'));
        if(!attemptToken||!(await verifyAttemptToken(context,attemptToken,biltzAttemptId,quiz.id)))return bad('This Brainz Biltz examination session could not be verified.',401);
      }
      const bundle = await loadQuizBundle(context, rows[0].id, { includeImages: false });
      const out=publicQuiz(bundle.quiz, bundle.sections, bundle.questions);
      if(biltzAccess.challenge){
        out.duration=Number(biltzAccess.challenge.duration_minutes)||out.duration;
        out.description=biltzAccess.challenge.description||out.description;
        out.settings={...(out.settings||{}),reviewEnabled: biltzAccess.challenge.review_enabled!==false, leaderboardEnabled: biltzAccess.challenge.leaderboard_enabled!==false};
        out.question_count=bundle.questions.length;
        if(!biltzAttemptId)out.questions=[];
      }
      return json({ quiz: out });
    }

    if (action === 'feedback-submit' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      if (!isUuid(quizId)) return bad('This feedback form is not linked to a valid CBT.', 400);
      const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,status,access_mode&status=eq.published&id=eq.${enc(quizId)}&limit=1` });
      if (!quizRows.length) return bad('This CBT is not available for feedback.', 404);
      const feedbackDeviceId=deviceIdForRequest(request,body);
      const feedbackAttemptId=cleanText(body.attemptId);
      const feedbackBiltz=await validateBiltzQuizAccess(context,{quizId,challengeSlug:cleanText(body.challengeSlug),deviceId:feedbackDeviceId,attemptId:cleanText(body.challengeSlug)?feedbackAttemptId:''});
      if(!feedbackBiltz.ok)return bad(feedbackBiltz.message,feedbackBiltz.status);
      if(!feedbackBiltz.challenge){
        if(quizRows[0].access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quizId,feedbackDeviceId)))return privateQuizDenied(quizRows[0],feedbackDeviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedFeedbackLibrary=await privateLibraryForQuiz(context,quizId,feedbackDeviceId);
        if(restrictedFeedbackLibrary)return privateLibraryDenied(restrictedFeedbackLibrary,feedbackDeviceId,await getAdministratorWhatsAppNumber(context));
      }
      const categoryMap = { general:'General feedback', question_issue:'Question or answer issue', technical:'Technical problem', timing:'Timing or submission issue', accessibility:'Accessibility or readability', complaint:'Complaint', suggestion:'Suggestion' };
      const category = cleanText(body.category).toLowerCase();
      if (!categoryMap[category]) return bad('Please select a valid feedback category.', 400);
      const message = cleanText(body.message);
      if (message.length < 8) return bad('Please provide at least a little detail in your feedback.', 400);
      if (message.length > 1800) return bad('Feedback is limited to 1,800 characters.', 400);
      const studentName = cleanText(body.studentName).slice(0, 200) || 'Student';
      const contact = cleanText(body.contact).slice(0, 160);
      const attemptId = body.attemptId ? cleanText(body.attemptId) : null;
      const attemptToken = body.attemptToken ? cleanText(body.attemptToken) : '';
      let resolvedAttemptId = null;
      if (attemptId) {
        if (!isUuid(attemptId)) return bad('Invalid attempt identifier.', 400);
        if (!attemptToken || !(await verifyAttemptToken(context, attemptToken, attemptId, quizId))) return bad('The CBT feedback session could not be verified. Refresh the result page and try again.', 401);
        const attemptRows = await sb(context, 'attempts', { query: `select=id,student_name,status&quiz_id=eq.${enc(quizId)}&id=eq.${enc(attemptId)}&limit=1` });
        if (!attemptRows.length) return bad('The submitted CBT attempt could not be found.', 404);
        resolvedAttemptId = attemptRows[0].id;
      }
      await sb(context, 'student_feedback', {
        method: 'POST', query: 'select=id,created_at',
        body: { quiz_id: quizId, attempt_id: resolvedAttemptId, student_name: studentName, category, message, contact, status: 'new' },
        headers: { prefer: 'return=representation' }
      });
      return json({ ok: true, message: 'Feedback received.' });
    }

    if (action === 'feedback-list' && request.method === 'GET') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const status = cleanText(url.searchParams.get('status')).toLowerCase();
      const limit = validInteger(url.searchParams.get('limit'), 200, 1, 500);
      const statusFilter = ['new','reviewed','resolved'].includes(status) ? `&status=eq.${enc(status)}` : '';
      const rows = await sbAll(context, 'student_feedback', `select=id,quiz_id,attempt_id,student_name,category,message,contact,status,created_at,updated_at&order=created_at.desc${statusFilter}`, 100, limit);
      const quizIds = [...new Set(rows.map(x => String(x.quiz_id)).filter(Boolean))];
      const quizMap = new Map();
      if (quizIds.length) {
        const filter = `(${quizIds.map(enc).join(',')})`;
        const quizRows = await sb(context, 'quizzes', { query: `select=id,title&id=in.${filter}` });
        quizRows.forEach(q => quizMap.set(String(q.id), q.title));
      }
      const categoryLabels = { general:'General feedback', question_issue:'Question or answer issue', technical:'Technical problem', timing:'Timing or submission issue', accessibility:'Accessibility or readability', complaint:'Complaint', suggestion:'Suggestion' };
      return json({ feedback: rows.map(x => ({ ...x, quiz_title: quizMap.get(String(x.quiz_id)) || 'Unknown CBT', category_label: categoryLabels[x.category] || 'General feedback' })) });
    }

    if (action === 'feedback-status' && request.method === 'PUT') {
      if (!(await isAdmin(context, request))) return bad('Administrator authentication required.', 401);
      const id = cleanText(body.id);
      const status = cleanText(body.status).toLowerCase();
      if (!isUuid(id)) return bad('Invalid feedback identifier.', 400);
      if (!['new','reviewed','resolved'].includes(status)) return bad('Invalid feedback status.', 400);
      const rows = await sb(context, 'student_feedback', { method: 'PATCH', query: `id=eq.${enc(id)}`, body: { status, updated_at: new Date().toISOString() }, headers: { prefer: 'return=representation' } });
      if (!Array.isArray(rows) || !rows.length) return bad('Feedback item not found.', 404);
      return json({ ok: true, feedback: rows[0] });
    }

    if (action === 'question-media' && request.method === 'GET') {
      const quizId = cleanText(url.searchParams.get('quizId'));
      const questionId = cleanText(url.searchParams.get('questionId'));
      if (!isUuid(quizId) || !isUuid(questionId)) return bad('Quiz and question identifiers are required.', 400);
      const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,access_mode&status=eq.published&id=eq.${enc(quizId)}&limit=1` });
      if (!quizRows.length) return bad('Quiz not found or not published.', 404);
      const deviceId=deviceIdForRequest(request);
      const biltzAccess=await validateBiltzQuizAccess(context,{quizId,challengeSlug:cleanText(url.searchParams.get('biltz')),deviceId,attemptId:cleanText(url.searchParams.get('attemptId'))});
      if(!biltzAccess.ok)return bad(biltzAccess.message,biltzAccess.status);
      if(!biltzAccess.challenge){
        if(quizRows[0].access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quizId,deviceId)))return privateQuizDenied(quizRows[0],deviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary=await privateLibraryForQuiz(context,quizId,deviceId);
        if(restrictedLibrary)return privateLibraryDenied(restrictedLibrary,deviceId,await getAdministratorWhatsAppNumber(context));
      }
      const rows = await sb(context, 'questions', { query: `select=id,image_data&quiz_id=eq.${enc(quizId)}&id=eq.${enc(questionId)}&limit=1` });
      if (!rows.length) return bad('Question not found.', 404);
      return json({ image_data: boundedImageData(rows[0].image_data, STUDENT_MEDIA_MAX_CHARS) });
    }

    if (action === 'attempt-start' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,duration,pass_mark,student_fields,settings,status,access_mode&status=eq.published&id=eq.${enc(quizId)}&limit=1` });
      if (!quizRows.length) return bad('Quiz not found or not published.', 404);
      const quiz = quizRows[0];
      const settings = normalizeSettings(quiz.settings);
      const deviceId = deviceIdForRequest(request,body);
      if (!deviceId) return bad('A device identifier is required to track CBT attempts. Please enable browser storage and try again.', 400);
      const biltzAccess=await validateBiltzQuizAccess(context,{quizId,challengeSlug:cleanText(body.challengeSlug),deviceId,starting:true});
      if(!biltzAccess.ok)return bad(biltzAccess.message,biltzAccess.status);
      if(!biltzAccess.challenge){
        if(quiz.access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quizId,deviceId)))return privateQuizDenied(quiz,deviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary=await privateLibraryForQuiz(context,quizId,deviceId);
        if(restrictedLibrary)return privateLibraryDenied(restrictedLibrary,deviceId,await getAdministratorWhatsAppNumber(context));
      }
      const effectiveDuration=Number(biltzAccess.challenge?.duration_minutes)||Number(quiz.duration);
      if(biltzAccess.challenge){
        const priorBiltzAttempts=await sb(context,'brainz_biltz_attempts',{query:`select=id&challenge_id=eq.${enc(biltzAccess.challenge.id)}&participant_id=eq.${enc(biltzAccess.participant.id)}&limit=${Number(biltzAccess.challenge.attempt_limit)+1}`});
        if(priorBiltzAttempts.length>=Number(biltzAccess.challenge.attempt_limit))return bad(`This Brainz Biltz challenge allows ${Number(biltzAccess.challenge.attempt_limit)} attempt${Number(biltzAccess.challenge.attempt_limit)===1?'':'s'} only.`,409);
      }

      const fields = normalizeFields(quiz.student_fields);
      const supplied = body.studentData && typeof body.studentData === 'object' ? body.studentData : {};
      const studentData = {};
      for (const field of fields) {
        const value = cleanText(supplied[field.key]).slice(0, 500);
        if (field.required && !value) return bad(`${field.label} is required.`);
        if (field.key !== 'full_name') studentData[field.key] = value;
      }
      const studentName = cleanText(supplied.full_name || body.studentName).slice(0, 200) || 'Student';
      const questionRows = await sbAll(context, 'questions', `select=id,marks&quiz_id=eq.${enc(quizId)}&order=position.asc,created_at.asc`, 100, 20000);
      if (!questionRows.length) return bad('Quiz has no questions.', 400);
      const sectionRowsForStart = await sbAll(context, 'quiz_sections', `select=id,marks&quiz_id=eq.${enc(quizId)}`, 100, 5000);
      if (!sectionRowsForStart.length) return bad('Quiz has no sections.', 400);
      const attemptTotal = effectiveQuizTotal(settings, questionRows, sectionRowsForStart);

      // The maximum-attempts setting is the only attempt restriction. It is evaluated
      // per CBT and per device, so changing one CBT's setting does not affect another.
      // A value of 1 allows one active attempt at a time; an administrator's
      // removal of a leaderboard entry deliberately frees that slot for a retake.
      let created;
      for (let retry = 0; retry < 2; retry++) {
        const history = await sbAll(context, 'attempts', `select=attempt_no,status,started_at&quiz_id=eq.${enc(quizId)}&device_id=eq.${enc(deviceId)}`, 100, 5000);
        // A 'started' attempt that was never submitted (e.g. the browser was closed or lost
        // connectivity while submitting) should not permanently lock the device out. Once its
        // time window plus grace period has elapsed it is treated as abandoned and no longer
        // counts against the attempt limit; a genuinely in-progress attempt still counts.
        const activeAttempts = history.filter(x => {
          if (x.status === 'removed') return false;
          if (x.status !== 'started') return true;
          const startedAt = Date.parse(x.started_at || '') || 0;
          const expiresAt = startedAt + Math.max(60, effectiveDuration * 60) * 1000 + 5 * 60 * 1000;
          return Date.now() < expiresAt;
        }).length;
        const highestAttemptNo = history.reduce((max, x) => Math.max(max, Number(x.attempt_no) || 0), 0);
        const nextAttemptNo = highestAttemptNo + 1;
        const effectiveMaxAttempts = biltzAccess.challenge ? null : settings.maxAttempts;
        if (effectiveMaxAttempts !== null && activeAttempts >= effectiveMaxAttempts) {
          const message = effectiveMaxAttempts === 1
            ? 'This CBT allows one active attempt only. This device has already used its attempt.'
            : `This device has reached the maximum of ${effectiveMaxAttempts} active attempts for this CBT.`;
          return bad(message, 409);
        }
        try {
          created = await sb(context, 'attempts', {
            method: 'POST', query: 'select=id,started_at,attempt_no,result_token',
            body: { quiz_id: quizId, device_id: deviceId, attempt_no: nextAttemptNo, result_token: randomToken(36), student_name: studentName, student_data: studentData, score: 0, total: attemptTotal, percent: 0, pass_mark: quiz.pass_mark, time_used: 0, auto_submitted: false, violations: 0, status: 'started', started_at: new Date().toISOString() },
            headers: { prefer: 'return=representation' }
          });
          break;
        } catch (error) {
          if (retry === 1 || !/duplicate key|unique constraint|attempts_quiz_device_attempt_no_idx/i.test(String(error?.message || ''))) throw error;
        }
      }
      if (!created?.length) return bad('Unable to start the CBT attempt. Please try again.', 409);
      if(biltzAccess.challenge){
        try{
          await sb(context,'brainz_biltz_attempts',{method:'POST',query:'select=id',body:{challenge_id:biltzAccess.challenge.id,participant_id:biltzAccess.participant.id,attempt_id:created[0].id,device_id:deviceId,duration_minutes:effectiveDuration,started_at:created[0].started_at},headers:{prefer:'return=representation'}});
        }catch(error){
          await sb(context,'attempts',{method:'PATCH',query:`id=eq.${enc(created[0].id)}`,body:{status:'removed'},headers:{prefer:'return=minimal'}}).catch(()=>{});
          return bad('The Brainz Biltz attempt could not be registered safely. Please try again.',500);
        }
      }
      const startedAt = Date.parse(created[0].started_at);
      const expiresAt = startedAt + Math.max(60, effectiveDuration * 60) * 1000 + 5 * 60 * 1000;
      const token = await issueAttemptToken(context, created[0].id, quizId, expiresAt);
      let challengeQuiz = null;
      if(biltzAccess.challenge){
        try{
          const bundle = await loadQuizBundle(context, quizId, { includeImages: false });
          challengeQuiz = publicQuiz(bundle.quiz, bundle.sections, bundle.questions);
          challengeQuiz.duration = effectiveDuration;
          challengeQuiz.description = biltzAccess.challenge.description || challengeQuiz.description;
          challengeQuiz.settings = { ...(challengeQuiz.settings || {}), reviewEnabled: biltzAccess.challenge.review_enabled !== false, leaderboardEnabled: biltzAccess.challenge.leaderboard_enabled !== false };
          challengeQuiz.question_count = bundle.questions.length;
        }catch(error){
          await sb(context,'brainz_biltz_attempts',{method:'DELETE',query:`attempt_id=eq.${enc(created[0].id)}`}).catch(()=>{});
          await sb(context,'attempts',{method:'PATCH',query:`id=eq.${enc(created[0].id)}`,body:{status:'removed'},headers:{prefer:'return=minimal'}}).catch(()=>{});
          return bad('The challenge questions could not be loaded safely. Please start again.',503);
        }
      }
      return json({ attempt: { id: created[0].id, startedAt: created[0].started_at, duration: effectiveDuration, token, resultToken: created[0].result_token || null, attemptNumber: Number(created[0].attempt_no), maxAttempts: biltzAccess.challenge ? Number(biltzAccess.challenge.attempt_limit) : settings.maxAttempts }, ...(challengeQuiz ? { quiz: challengeQuiz } : {}) });
    }

    if (action === 'attempt' && request.method === 'POST') {
      const attemptId = cleanText(body.attemptId);
      const quizId = cleanText(body.quizId);
      if (!attemptId || !quizId) return bad('Attempt and quiz identifiers are required.');
      if (!(await verifyAttemptToken(context, body.attemptToken, attemptId, quizId))) return bad('This CBT session is invalid or has expired. Please restart the test.', 401);
      const attemptRows = await sb(context, 'attempts', { query: `select=id,quiz_id,device_id,attempt_no,result_token,student_name,student_data,score,total,percent,pass_mark,time_used,auto_submitted,violations,status,started_at,submitted_at&id=eq.${enc(attemptId)}&quiz_id=eq.${enc(quizId)}&limit=1` });
      if (!attemptRows.length) return bad('Attempt not found.', 404);
      const existingAttempt = attemptRows[0];
      if (existingAttempt.status === 'removed') return bad('This attempt has been removed from the leaderboard.', 409);

      const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,settings,pass_mark,duration,status,access_mode&status=eq.published&id=eq.${enc(quizId)}&limit=1` });
      if (!quizRows.length) return bad('Quiz not found.', 404);
      const quiz = quizRows[0];
      const settingsForScoring = normalizeSettings(quiz.settings);
      const submissionDeviceId = deviceIdForRequest(request, body);
      const biltzAccess=await validateBiltzQuizAccess(context,{quizId,challengeSlug:cleanText(body.challengeSlug),deviceId:submissionDeviceId,attemptId});
      if(!biltzAccess.ok)return bad(biltzAccess.message,biltzAccess.status);
      if (biltzAccess.challenge) {
        settingsForScoring.reviewEnabled = biltzAccess.challenge.review_enabled !== false;
        settingsForScoring.leaderboardEnabled = biltzAccess.challenge.leaderboard_enabled !== false;
        settingsForScoring.maxAttempts = Number(biltzAccess.challenge.attempt_limit) || 1;
      }
      if(!biltzAccess.challenge){
        if(quiz.access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quizId,submissionDeviceId)))return privateQuizDenied(quiz,submissionDeviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary = await privateLibraryForQuiz(context, quizId, submissionDeviceId);
        if (restrictedLibrary) return privateLibraryDenied(restrictedLibrary, submissionDeviceId, await getAdministratorWhatsAppNumber(context));
      }

      // Network-safe idempotency: a submit request can reach Supabase, commit,
      // and still time out before the browser receives the response. A retry for
      // an already-submitted attempt must return the stored result instead of
      // producing a false 409 or re-scoring against changed question data.
      if (existingAttempt.status === 'submitted') {
        const questions = await sbAll(context, 'questions', `select=id,section_id,subject,answer,marks,text,options,explanation,passage_id&quiz_id=eq.${enc(quizId)}&order=position.asc,created_at.asc`, 100, 5000);
        if (!questions.length) return bad('Quiz has no questions.', 400);
        const sectionRows = await sbAll(context, 'quiz_sections', `select=id,title,marks&quiz_id=eq.${enc(quizId)}`, 100, 5000);
        const storedAnswers = await sbAll(context, 'attempt_answers', `select=question_id,selected_answer,is_correct,marks&attempt_id=eq.${enc(attemptId)}`, 100, 10000);
        const subjectScores = buildSubjectScores(questions, storedAnswers, sectionRows);
        const output = {
          id: existingAttempt.id,
          resultToken: await ensureAttemptResultToken(context, existingAttempt),
          studentName: existingAttempt.student_name,
          quizId,
          total: Math.round(Number(existingAttempt.total) || 0),
          timeUsed: Number(existingAttempt.time_used) || 0,
          submittedAt: existingAttempt.submitted_at,
          resultEnabled: settingsForScoring.resultEnabled,
          leaderboardEnabled: settingsForScoring.leaderboardEnabled,
          reviewEnabled: settingsForScoring.reviewEnabled !== false,
          maxAttempts: settingsForScoring.maxAttempts
        };
        const history = await sb(context, 'attempts', { query: `select=id,attempt_no,status&quiz_id=eq.${enc(quizId)}&device_id=eq.${enc(existingAttempt.device_id || '')}&status=in.(started,submitted)` });
        output.attemptsUsed = history.length;
        if (biltzAccess.challenge && biltzAccess.participant) {
          const challengeHistory = await sb(context, 'brainz_biltz_attempts', { query: `select=id&challenge_id=eq.${enc(biltzAccess.challenge.id)}&participant_id=eq.${enc(biltzAccess.participant.id)}&limit=${Number(biltzAccess.challenge.attempt_limit) + 1}` });
          output.attemptsUsed = challengeHistory.length;
        }
        output.attemptsRemaining = settingsForScoring.maxAttempts === null ? null : Math.max(0, settingsForScoring.maxAttempts - output.attemptsUsed);
        if (settingsForScoring.resultEnabled) {
          output.score = Math.round(Number(existingAttempt.score) || 0);
          output.percent = Number(existingAttempt.percent) || 0;
          output.passMark = Number(existingAttempt.pass_mark ?? quiz.pass_mark) || 0;
          output.subjectScores = subjectScores;
        }
        if (settingsForScoring.resultEnabled && settingsForScoring.reviewEnabled !== false) {
          let imageIds = new Set();
          let imageLookupUnavailable = false;
          try {
            const imageRows = await sbAll(context, 'questions', `select=id&quiz_id=eq.${enc(quizId)}&image_data=not.is.null`, 250, 20000);
            imageIds = new Set(imageRows.map(row => String(row.id)));
          } catch {
            imageLookupUnavailable = true;
          }
          let passageMap = new Map();
          if (questions.some(q => q.passage_id)) {
            const passageRows = await sbAll(context, 'passages', `select=id,title,content&quiz_id=eq.${enc(quizId)}`, 100, 5000);
            passageMap = new Map(passageRows.map(p => [String(p.id), p]));
          }
          const ansMap = new Map(storedAnswers.map(x => [String(x.question_id), x]));
          output.corrections = questions.map(q => {
            const a = ansMap.get(String(q.id));
            return {
              questionId: q.id,
              text: q.text,
              options: Array.isArray(q.options) ? q.options : [],
              selectedAnswer: a ? a.selected_answer : null,
              correctAnswer: Number(q.answer),
              isCorrect: !!(a && a.is_correct),
              explanation: q.explanation || '',
              marks: Math.round((Number(a?.marks ?? q.marks) || 0) * 100) / 100,
              image_available: imageLookupUnavailable || imageIds.has(String(q.id)),
              passage: q.passage_id && passageMap.has(String(q.passage_id)) ? { title: passageMap.get(String(q.passage_id)).title, content: passageMap.get(String(q.passage_id)).content } : null
            };
          });
        }
        return json({ attempt: output });
      }

      const questions = await sbAll(context, 'questions', `select=id,section_id,answer,marks,text,options,explanation,passage_id&quiz_id=eq.${enc(quizId)}&order=position.asc,created_at.asc`, 100, 5000);
      if (!questions.length) return bad('Quiz has no questions.', 400);
      let imageIds = new Set();
      let imageLookupUnavailable = false;
      try {
        const imageRows = await sbAll(context, 'questions', `select=id&quiz_id=eq.${enc(quizId)}&image_data=not.is.null`, 250, 20000);
        imageIds = new Set(imageRows.map(row => String(row.id)));
      } catch {
        imageLookupUnavailable = true;
      }
      let passageMap = new Map();
      if (questions.some(q => q.passage_id)) {
        const passageRows = await sbAll(context, 'passages', `select=id,title,content&quiz_id=eq.${enc(quizId)}`, 100, 5000);
        passageMap = new Map(passageRows.map(p => [String(p.id), p]));
      }

      const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      const sectionRows = await sbAll(context, 'quiz_sections', `select=id,title,marks&quiz_id=eq.${enc(quizId)}`, 100, 5000);
      const sectionMap = new Map(sectionRows.map(x=>[String(x.id), x]));
      const allocatedSections = sectionRows.filter(x=>x.marks!==null && Number(x.marks)>=0);
      const hasSectionAllocation = allocatedSections.length>0;
      const rawBySection = new Map();
      const sectionBaseTotals = new Map();
      const baseMarksByQuestion = new Map();
      for(const q of questions){ const eq=settingsForScoring.equalMarks&&settingsForScoring.totalMarks ? settingsForScoring.totalMarks/questions.length : null; const bm=eq!=null?eq:Math.max(0.01,Number(q.marks)||1); baseMarksByQuestion.set(String(q.id),bm); const key=String(q.section_id||''); sectionBaseTotals.set(key,(sectionBaseTotals.get(key)||0)+bm); }
      let score = 0;
      let totalMarks = 0;
      const answerRows = [];
      const corrections = [];
      for (const question of questions) {
        const raw = answers[question.id];
        const selected = raw === undefined || raw === null || raw === '' ? null : Number(raw);
        const validSelected = Number.isInteger(selected) && selected >= 0 && selected <= 3 ? selected : null;
        const equalWeight = settingsForScoring.equalMarks && settingsForScoring.totalMarks ? settingsForScoring.totalMarks / questions.length : null;
        const baseMarks = equalWeight != null ? equalWeight : Math.max(0.01, Number(question.marks) || 1);
        const correct = validSelected !== null && validSelected === Number(question.answer);
        const secKey=String(question.section_id||'');
        if(!rawBySection.has(secKey)) rawBySection.set(secKey,{raw:0,total:0,allocated:sectionMap.get(secKey)?.marks});
        const bucket=rawBySection.get(secKey);
        bucket.total += baseMarks;
        if(correct) bucket.raw += baseMarks;
        const sectionAllocated=sectionMap.get(secKey)?.marks;
        const effectiveMarks=hasSectionAllocation && sectionAllocated!==null && sectionAllocated!==undefined ? (sectionBaseTotals.get(secKey)>0 ? baseMarks * (Number(sectionAllocated)||0) / sectionBaseTotals.get(secKey) : 0) : baseMarks;
        const marks = effectiveMarks;
        if(!hasSectionAllocation) { totalMarks += marks; if(correct) score += marks; }
        corrections.push({questionId:question.id,text:question.text,options:Array.isArray(question.options)?question.options:[],selectedAnswer:validSelected,correctAnswer:Number(question.answer),isCorrect:correct,explanation:question.explanation||'',marks:Number(marks.toFixed(2)),image_available:imageLookupUnavailable || imageIds.has(String(question.id)),passage:question.passage_id&&passageMap.has(String(question.passage_id))?{title:passageMap.get(String(question.passage_id)).title,content:passageMap.get(String(question.passage_id)).content}:null});
        answerRows.push({ attempt_id: attemptId, question_id: question.id, selected_answer: validSelected, is_correct: correct, marks: Number(marks.toFixed(4)) });
      }

      if(hasSectionAllocation){
        score=0; totalMarks=0;
        for(const bucket of rawBySection.values()){ const alloc=bucket.allocated===null||bucket.allocated===undefined?bucket.total:Number(bucket.allocated)||0; totalMarks+=alloc; score += bucket.total>0 ? (bucket.raw/bucket.total)*alloc : 0; }
      }
      const startedAt = Date.parse(existingAttempt.started_at || '');
      const elapsed = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
      const allowed = Math.max(60, Number(biltzAccess.link?.duration_minutes || quiz.duration) * 60);
      const timeUsed = Math.min(elapsed, allowed);
      const autoSubmitted = Boolean(body.autoSubmitted) || elapsed >= allowed;
      const total = totalMarks;
      const percent = totalMarks ? Math.round(score / totalMarks * 100) : 0;
      const scoreDisplay = Math.round(score);
      const totalDisplay = Math.round(total);
      const subjectScores = buildSubjectScores(questions, answerRows, sectionRows);

      const violations = validInteger(body.violations, 0, 0, 100);
      const submitResult = await sbRpc(context, 'submit_attempt_atomic', {
        p_attempt_id: attemptId,
        p_quiz_id: quizId,
        p_score: Number(score.toFixed(4)),
        p_total: Number(total.toFixed(4)),
        p_percent: percent,
        p_pass_mark: quiz.pass_mark,
        p_time_used: timeUsed,
        p_auto_submitted: autoSubmitted,
        p_violations: violations,
        p_answer_rows: answerRows
      });
      const attempt = submitResult;
      if (!attempt?.id || attempt.status !== 'submitted') return bad('The CBT submission could not be completed. Please try again.', 409);
      const resultToken = await ensureAttemptResultToken(context, attempt);
      const settings = normalizeSettings(quiz.settings);
      const attemptHistory = await sb(context, 'attempts', { query: `select=id,attempt_no,status&quiz_id=eq.${enc(quizId)}&device_id=eq.${enc(attempt.device_id || '')}&status=in.(started,submitted)` });
      let attemptsUsed = attemptHistory.length;
      if (biltzAccess.challenge && biltzAccess.participant) {
        const challengeHistory = await sb(context, 'brainz_biltz_attempts', { query: `select=id&challenge_id=eq.${enc(biltzAccess.challenge.id)}&participant_id=eq.${enc(biltzAccess.participant.id)}&limit=${Number(biltzAccess.challenge.attempt_limit) + 1}` });
        attemptsUsed = challengeHistory.length;
      }
      const attemptsRemaining = settingsForScoring.maxAttempts === null ? null : Math.max(0, settingsForScoring.maxAttempts - attemptsUsed);
      const output = { id: attempt.id, resultToken, studentName: attempt.student_name, quizId, total: totalDisplay, timeUsed: attempt.time_used, submittedAt: attempt.submitted_at, resultEnabled: settingsForScoring.resultEnabled, leaderboardEnabled: settingsForScoring.leaderboardEnabled, reviewEnabled: settingsForScoring.reviewEnabled !== false, attemptsUsed, maxAttempts: settingsForScoring.maxAttempts, attemptsRemaining };
      if (settingsForScoring.resultEnabled) Object.assign(output, { score: scoreDisplay, percent, passMark: quiz.pass_mark, subjectScores });
      if (settingsForScoring.resultEnabled && settingsForScoring.reviewEnabled !== false) output.corrections = corrections;
      return json({ attempt: output });
    }

    if (action === 'leaderboard' && request.method === 'GET') {
      const quizId = url.searchParams.get('id');
      if (!quizId) return bad('Quiz id is required.');
      const quizzes = await sb(context, 'quizzes', { query: `select=id,slug,title,settings,access_mode&id=eq.${enc(quizId)}&status=eq.published&limit=1` });
      if (!quizzes.length) return bad('Quiz not found.', 404);
      const deviceId = deviceIdForRequest(request);
      const biltzAccess=await validateBiltzQuizAccess(context,{quizId,challengeSlug:cleanText(url.searchParams.get('biltz')),deviceId});
      if(!biltzAccess.ok)return bad(biltzAccess.message,biltzAccess.status);
      if(!biltzAccess.challenge){
        if(quizzes[0].access_mode==='private'&&!(await isDeviceAuthorizedForQuiz(context,quizId,deviceId)))return privateQuizDenied(quizzes[0],deviceId,await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary = await privateLibraryForQuiz(context, quizId, deviceId);
        if (restrictedLibrary) return privateLibraryDenied(restrictedLibrary, deviceId, await getAdministratorWhatsAppNumber(context));
      }
      if (biltzAccess.challenge) {
        const challenge = biltzAccess.challenge;
        if (challenge.leaderboard_enabled === false) return bad('The leaderboard is disabled for this challenge.', 403);
        const ended = Date.now() > Date.parse(challenge.end_at || '') || ['cancelled','archived'].includes(challenge.status);
        if (challenge.leaderboard_release === 'after_end' && !ended) return bad('The leaderboard will be available after the challenge closes.', 403);
        if (challenge.leaderboard_release === 'manual' && !challenge.results_published) return bad('Challenge results have not been published yet.', 403);
        const links = await sbAll(context, 'brainz_biltz_attempts', `select=attempt_id,participant_id&challenge_id=eq.${enc(challenge.id)}`, 100, 50000);
        const ids = [...new Set(links.map(x => String(x.attempt_id)))];
        if (!ids.length) return json({ leaderboard: [] });
        const attempts = await sbAll(context, 'attempts', `select=id,student_name,score,total,percent,time_used,submitted_at,status&status=eq.submitted&id=in.(${ids.map(enc).join(',')})`, 100, 50000);
        const byId = new Map(attempts.map(a => [String(a.id), a]));
        const participants = await sbAll(context, 'brainz_biltz_participants', `select=id,status&challenge_id=eq.${enc(challenge.id)}`, 100, 50000);
        const approved = new Set(participants.filter(x => x.status === 'approved').map(x => String(x.id)));
        const best = new Map();
        for (const link of links) {
          if (!approved.has(String(link.participant_id))) continue;
          const row = byId.get(String(link.attempt_id)); if (!row) continue;
          const key = String(link.participant_id), prior = best.get(key);
          if (!prior || Number(row.percent) > Number(prior.percent) || (Number(row.percent) === Number(prior.percent) && Number(row.time_used) < Number(prior.time_used))) best.set(key, { ...row, participant_id: key });
        }
        const requestedLimit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit')) || 1000));
        const rows = [...best.values()].sort((a,b) => Number(b.percent)-Number(a.percent) || Number(a.time_used)-Number(b.time_used) || String(a.id).localeCompare(String(b.id))).slice(0,requestedLimit);
        return json({ leaderboard: rows.map((row,index) => ({ rank:index+1, name:row.student_name || 'Participant', score:Math.round(Number(row.score)||0), total:Math.round(Number(row.total)||0), percent:Number(row.percent)||0 })) });
      }
      if (!normalizeSettings(quizzes[0].settings).leaderboardEnabled) return bad('Leaderboard is disabled for this CBT.', 403);
      const requestedLimit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit')) || 1000));
      const allRows = await sbAll(context, 'attempts', `select=student_name,score,total,percent,time_used,submitted_at,id,device_id,attempt_no&quiz_id=eq.${enc(quizId)}&status=eq.submitted&order=percent.desc,time_used.asc,submitted_at.asc,id.asc`, 100, Math.max(requestedLimit * 4, 50000));
      const first = new Map();
      for(const row of allRows){ const key=String(row.device_id||row.id); const cur=first.get(key); const rowNo=Number(row.attempt_no||0), curNo=Number(cur?.attempt_no||0); const rowDate=Date.parse(row.submitted_at||'')||0, curDate=Date.parse(cur?.submitted_at||'')||0; if(!cur||(rowNo>0&&(!curNo||rowNo<curNo))||((!rowNo||!curNo||rowNo===curNo)&&rowDate>0&&(!curDate||rowDate<curDate))) first.set(key,row); }
      const rows = [...first.values()].sort((a,b)=>Number(b.percent)-Number(a.percent)||Number(a.time_used)-Number(b.time_used)||((Date.parse(a.submitted_at)||0)-(Date.parse(b.submitted_at)||0))||String(a.id).localeCompare(String(b.id))).slice(0,requestedLimit);
      return json({ leaderboard: rows.map((row, index) => ({ rank: index + 1, name: row.student_name, score: Math.round(Number(row.score||0)), total: Math.round(Number(row.total||0)), percent: row.percent })) });
    }

    if (action === 'result-access' && request.method === 'GET') {
      const resultSlug = cleanText(url.searchParams.get('slug') || url.searchParams.get('result'));
      const resultToken = cleanText(url.searchParams.get('token') || url.searchParams.get('resultToken'));
      const deviceId = cleanText(request.headers.get('x-device-id')).slice(0, 200);
      if (!resultSlug && !resultToken) return bad('Result link is required.');
      let quiz = null;
      let tokenAttempt = null;
      let linkedBiltzChallenge = null;
      let linkedBiltzLink = null;
      let linkedBiltzParticipant = null;

      if (resultToken) {
        const tokenAttempts = await sb(context, 'attempts', { query: `select=id,quiz_id,device_id,attempt_no,result_token,student_name,student_data,score,total,percent,pass_mark,time_used,auto_submitted,violations,status,started_at,submitted_at&result_token=eq.${enc(resultToken)}&status=eq.submitted&limit=1` });
        if (!tokenAttempts.length) return bad('Personal result link is invalid or has expired.', 404);
        tokenAttempt = tokenAttempts[0];
        const mappedLinks = await sb(context, 'brainz_biltz_attempts', { query: `select=id,challenge_id,participant_id,attempt_id,device_id&attempt_id=eq.${enc(tokenAttempt.id)}&limit=1` });
        if (mappedLinks.length) {
          linkedBiltzLink = mappedLinks[0];
          const challengeRows = await sb(context, 'brainz_biltz_challenges', { query: `select=${BILTZ_CHALLENGE_SELECT}&id=eq.${enc(linkedBiltzLink.challenge_id)}&limit=1` });
          linkedBiltzChallenge = challengeRows[0] || null;
          if (!linkedBiltzChallenge) return bad('The Brainz Biltz challenge for this result no longer exists.', 404);
          const participantRows = await sb(context, 'brainz_biltz_participants', { query: `select=id,status,participant_name,device_id&challenge_id=eq.${enc(linkedBiltzChallenge.id)}&id=eq.${enc(linkedBiltzLink.participant_id)}&limit=1` });
          linkedBiltzParticipant = participantRows[0] || null;
          if (!linkedBiltzParticipant || linkedBiltzParticipant.status !== 'approved') return bad('This challenge result is no longer available to this participant.', 403);
          if (linkedBiltzChallenge.access_mode === 'private' && (!deviceId || String(deviceId) !== String(linkedBiltzLink.device_id))) return bad('This private challenge result must be opened on the registered device.', 403);
        }
        const qRows = await sb(context, 'quizzes', { query: `select=id,slug,title,settings,pass_mark,duration,result_released,access_mode&status=eq.published&id=eq.${enc(tokenAttempt.quiz_id)}&limit=1` });
        if (!qRows.length) return bad('Result link is invalid.', 404);
        quiz = qRows[0];
      } else {
        if (!deviceId) return bad('This result link must be opened on the device/browser that completed the CBT.', 400);
        const quizRows = await sb(context, 'quizzes', { query: `select=id,slug,title,settings,pass_mark,duration,result_released,access_mode&result_slug=eq.${enc(resultSlug)}&status=eq.published&limit=1` });
        if (!quizRows.length) return bad('Result link is invalid.', 404);
        quiz = quizRows[0];
      }

      // For a Brainz Biltz attempt, access and release are controlled by the challenge,
      // not by the underlying CBT's ordinary public result/leaderboard settings.
      if (!linkedBiltzChallenge) {
        // Personal result tokens for ordinary CBTs must obey the same challenge-only
        // gate as shared result slugs; a token cannot bypass Brainz Biltz entry rules.
        const biltzGate = await validateBiltzQuizAccess(context, { quizId: quiz.id, deviceId });
        if (!biltzGate.ok) return bad(biltzGate.message, biltzGate.status);
        if (quiz.access_mode === 'private' && !(await isDeviceAuthorizedForQuiz(context, quiz.id, deviceId))) return privateQuizDenied(quiz, deviceId, await getAdministratorWhatsAppNumber(context));
        const restrictedLibrary = await privateLibraryForQuiz(context, quiz.id, deviceId);
        if (restrictedLibrary) return privateLibraryDenied(restrictedLibrary, deviceId, await getAdministratorWhatsAppNumber(context));
        if (!quiz.result_released) return bad('Results have not been released yet.', 403);
      } else {
        const challenge = linkedBiltzChallenge;
        const ended = Date.now() > Date.parse(challenge.end_at || '') || ['cancelled', 'archived'].includes(challenge.status);
        if (challenge.leaderboard_release === 'after_end' && !ended) return bad('Challenge results will be available after the challenge closes.', 403);
        if (challenge.leaderboard_release === 'manual' && !challenge.results_published) return bad('Challenge results have not been published yet.', 403);
      }

      const settings = normalizeSettings(quiz.settings);
      if (linkedBiltzChallenge) {
        settings.reviewEnabled = linkedBiltzChallenge.review_enabled !== false;
        settings.leaderboardEnabled = linkedBiltzChallenge.leaderboard_enabled !== false;
        settings.maxAttempts = Number(linkedBiltzChallenge.attempt_limit) || 1;
      }
      if (settings.resultEnabled === false) return bad('Results are not enabled for this CBT.', 403);

      const attemptRows = resultToken
        ? await sb(context, 'attempts', { query: `select=id,quiz_id,device_id,attempt_no,result_token,student_name,student_data,score,total,percent,pass_mark,time_used,auto_submitted,violations,status,started_at,submitted_at&quiz_id=eq.${enc(quiz.id)}&result_token=eq.${enc(resultToken)}&status=eq.submitted&limit=1` })
        : await sb(context, 'attempts', { query: `select=id,quiz_id,device_id,attempt_no,result_token,student_name,student_data,score,total,percent,pass_mark,time_used,auto_submitted,violations,status,started_at,submitted_at&quiz_id=eq.${enc(quiz.id)}&device_id=eq.${enc(deviceId)}&status=eq.submitted&order=attempt_no.desc,submitted_at.desc&limit=1` });

      const buildLeaderboard = async () => {
        if (settings.leaderboardEnabled === false) return [];
        if (linkedBiltzChallenge) {
          const links = await sbAll(context, 'brainz_biltz_attempts', `select=attempt_id,participant_id&challenge_id=eq.${enc(linkedBiltzChallenge.id)}`, 100, 50000);
          const ids = [...new Set(links.map(x => String(x.attempt_id)))];
          if (!ids.length) return [];
          const attempts = await sbAll(context, 'attempts', `select=id,student_name,score,total,percent,time_used,submitted_at,status&status=eq.submitted&id=in.(${ids.map(enc).join(',')})`, 100, 50000);
          const participants = await sbAll(context, 'brainz_biltz_participants', `select=id,status&challenge_id=eq.${enc(linkedBiltzChallenge.id)}`, 100, 50000);
          const approved = new Set(participants.filter(x => x.status === 'approved').map(x => String(x.id)));
          const byId = new Map(attempts.map(x => [String(x.id), x]));
          const best = new Map();
          for (const link of links) {
            if (!approved.has(String(link.participant_id))) continue;
            const row = byId.get(String(link.attempt_id)); if (!row) continue;
            const key = String(link.participant_id), previous = best.get(key);
            if (!previous || Number(row.percent) > Number(previous.percent) || (Number(row.percent) === Number(previous.percent) && Number(row.time_used) < Number(previous.time_used))) best.set(key, { ...row, participantId: key });
          }
          const sorted = [...best.values()].sort((a, b) => Number(b.percent) - Number(a.percent) || Number(a.time_used) - Number(b.time_used) || String(a.id).localeCompare(String(b.id)));
          return sorted.map((row, index) => ({ id: row.id, participantId: row.participantId, deviceId: '', rank: index + 1, name: row.student_name || 'Participant', score: Math.round(Number(row.score || 0)), total: Math.round(Number(row.total || 0)), percent: Number(row.percent) || 0 }));
        }
        const lb = await sbAll(context, 'attempts', `select=id,student_name,score,total,percent,time_used,submitted_at,device_id,attempt_no&quiz_id=eq.${enc(quiz.id)}&status=eq.submitted`, 100, 50000);
        const first = new Map();
        for (const row of lb) { const key = String(row.device_id || row.id); const cur = first.get(key); const rowNo = Number(row.attempt_no || 0), curNo = Number(cur?.attempt_no || 0); const rowDate = Date.parse(row.submitted_at || '') || 0, curDate = Date.parse(cur?.submitted_at || '') || 0; if (!cur || (rowNo > 0 && (!curNo || rowNo < curNo)) || ((!rowNo || !curNo || rowNo === curNo) && rowDate > 0 && (!curDate || rowDate < curDate))) first.set(key, row); }
        const sorted = [...first.values()].sort((a, b) => Number(b.percent) - Number(a.percent) || Number(a.time_used) - Number(b.time_used) || String(a.id).localeCompare(String(b.id)));
        return sorted.map((row, index) => ({ id: row.id, deviceId: String(row.device_id || ''), rank: index + 1, name: row.student_name, score: Math.round(Number(row.score || 0)), total: Math.round(Number(row.total || 0)), percent: row.percent }));
      };

      if (!attemptRows.length) {
        return json({ result: {
          noAttempted: true, quizId: quiz.id, quizSlug: quiz.slug, quizTitle: quiz.title || '', pass_mark: quiz.pass_mark,
          leaderboard: (await buildLeaderboard()).map(({ id, deviceId, participantId, ...row }) => row),
          settings: { resultEnabled: settings.resultEnabled, reviewEnabled: settings.reviewEnabled, leaderboardEnabled: settings.leaderboardEnabled }
        } });
      }

      const attempt = attemptRows[0];
      const questions = await sbAll(context, 'questions', `select=id,section_id,subject,text,options,answer,explanation,marks,passage_id&quiz_id=eq.${enc(attempt.quiz_id)}&order=position.asc,created_at.asc`, 100, 20000);
      let imageIds = new Set();
      let imageLookupUnavailable = false;
      try { const imageRows = await sbAll(context, 'questions', `select=id&quiz_id=eq.${enc(attempt.quiz_id)}&image_data=not.is.null`, 250, 20000); imageIds = new Set(imageRows.map(row => String(row.id))); }
      catch { imageLookupUnavailable = true; }
      const passages = await sbAll(context, 'passages', `select=id,title,content&quiz_id=eq.${enc(attempt.quiz_id)}`, 100, 5000);
      const passageMap = new Map(passages.map(p => [p.id, p]));
      const answers = await sbAll(context, 'attempt_answers', `select=question_id,selected_answer,is_correct,marks&attempt_id=eq.${enc(attempt.id)}`);
      const sectionRows = await sbAll(context, 'quiz_sections', `select=id,title,marks&quiz_id=eq.${enc(attempt.quiz_id)}`, 100, 5000);
      const ansMap = new Map(answers.map(x => [x.question_id, x]));
      const equalWeight = settings.equalMarks && settings.totalMarks && questions.length ? settings.totalMarks / questions.length : null;
      const corrections = settings.reviewEnabled === false ? [] : questions.map(q => {
        const a = ansMap.get(q.id);
        const marks = (a && Object.prototype.hasOwnProperty.call(a, 'marks')) ? Number(a.marks || 0) : (equalWeight != null ? equalWeight : (Number(q.marks) || 1));
        const passage = q.passage_id ? passageMap.get(q.passage_id) : null;
        return { questionId: q.id, text: q.text, options: Array.isArray(q.options) ? q.options : [], selectedAnswer: a ? a.selected_answer : null, correctAnswer: Number(q.answer), isCorrect: !!(a && a.is_correct), explanation: q.explanation || '', marks, image_data: null, image_available: imageLookupUnavailable || imageIds.has(String(q.id)), passage: passage ? { title: passage.title, content: passage.content } : null };
      });
      const subjectScores = buildSubjectScores(questions, answers, sectionRows);
      const leaderboardInternal = await buildLeaderboard();
      let rank = null;
      if (leaderboardInternal.length) {
        if (linkedBiltzChallenge && linkedBiltzParticipant) {
          const idx = leaderboardInternal.findIndex(x => String(x.participantId || '') === String(linkedBiltzParticipant.id));
          if (idx >= 0) rank = leaderboardInternal[idx].rank;
        } else {
          const participantDeviceId = String(attempt.device_id || '');
          const idx = leaderboardInternal.findIndex(x => participantDeviceId && String(x.deviceId || '') === participantDeviceId);
          if (idx >= 0) rank = leaderboardInternal[idx].rank;
        }
      }
      let attemptsUsed = Number(attempt.attempt_no || 1);
      if (linkedBiltzChallenge && linkedBiltzParticipant) {
        const challengeHistory = await sb(context, 'brainz_biltz_attempts', { query: `select=id&challenge_id=eq.${enc(linkedBiltzChallenge.id)}&participant_id=eq.${enc(linkedBiltzParticipant.id)}&limit=${Number(linkedBiltzChallenge.attempt_limit) + 1}` });
        attemptsUsed = challengeHistory.length;
      }
      const attemptsRemaining = settings.maxAttempts === null ? null : Math.max(0, Number(settings.maxAttempts || 1) - attemptsUsed);
      const result = {
        quizId: attempt.quiz_id, quizSlug: quiz.slug, quizTitle: quiz.title || '', pass_mark: attempt.pass_mark,
        resultToken: await ensureAttemptResultToken(context, attempt), score: Math.round(Number(attempt.score || 0)), total: Math.round(Number(attempt.total || 0)),
        percent: attempt.percent, timeUsed: attempt.time_used, submittedAt: attempt.submitted_at, attempt_no: attempt.attempt_no,
        attemptsUsed, maxAttempts: settings.maxAttempts, attemptsRemaining, rank,
        leaderboard: leaderboardInternal.map(({ id, deviceId, participantId, ...row }) => row), subjectScores,
        settings: { resultEnabled: settings.resultEnabled, reviewEnabled: settings.reviewEnabled, leaderboardEnabled: settings.leaderboardEnabled }
      };
      if (linkedBiltzChallenge) { result.challengeTitle = linkedBiltzChallenge.title; if (!['draft', 'archived'].includes(linkedBiltzChallenge.status)) result.challengeSlug = linkedBiltzChallenge.slug; }
      if (settings.resultEnabled !== false && settings.reviewEnabled !== false) result.corrections = corrections;
      return json({ result });
    }

    if (!await isAdmin(context, request)) return bad('Admin authentication required.', 401);

    if (action === 'platform-settings' && request.method === 'GET') {
      const rows=await sb(context,'app_settings',{query:'select=key,value&key=eq.administrator_whatsapp&limit=1'});
      return json({settings:{administratorWhatsAppNumber:normalizeWhatsAppNumber(rows?.[0]?.value||'')}});
    }

    if (action === 'platform-settings' && request.method === 'PUT') {
      const number=normalizeWhatsAppNumber(body.administratorWhatsAppNumber);
      if(!number)return bad('Enter a valid WhatsApp number in international format, including country code.');
      const now=new Date().toISOString();
      const rows=await sb(context,'app_settings',{method:'POST',query:'on_conflict=key&select=key,value',body:{key:'administrator_whatsapp',value:number,updated_at:now},headers:{prefer:'resolution=merge-duplicates,return=representation'}});
      if(!rows?.length)return bad('The administrator contact number could not be saved.',500);
      return json({ok:true,settings:{administratorWhatsAppNumber:normalizeWhatsAppNumber(rows[0].value)}});
    }

    if (action === 'quiz-device-code' && request.method === 'POST') {
      const quizId=cleanText(body.quizId);
      const deviceId=cleanText(body.deviceId).slice(0,200);
      if(!isUuid(quizId))return bad('Valid quiz id is required.');
      if(deviceId.length<8)return bad('Enter a valid device ID.');
      const quizRows=await sb(context,'quizzes',{query:`select=id,slug,title,access_mode&id=eq.${enc(quizId)}&limit=1`});
      if(!quizRows.length)return bad('Quiz not found.',404);
      if(quizRows[0].access_mode!=='private')return bad('Change this quiz to Private before generating device activation codes.');
      const activationCode=generatedActivationCode();
      const activationCodeHash=await sha256Hex(activationCode);
      const now=new Date();
      const expiresAt=new Date(now.getTime()+7*24*60*60*1000).toISOString();
      const saved=await sb(context,'quiz_device_access',{method:'POST',query:'on_conflict=quiz_id,device_id&select=id,device_id,is_active,activation_expires_at',body:{quiz_id:quizId,device_id:deviceId,activation_code_hash:activationCodeHash,activation_expires_at:expiresAt,is_active:false,activated_at:null,updated_at:now.toISOString()},headers:{prefer:'resolution=merge-duplicates,return=representation'}});
      if(!saved?.length)return bad('The activation code could not be registered. Please try again.',500);
      return json({ok:true,activationCode,deviceId,expiresAt,quizName:quizRows[0].title,message:'Activation code generated. It expires in seven days and is valid only for this device and quiz.'});
    }

    if (action === 'quiz-device-list' && request.method === 'GET') {
      const quizId=cleanText(url.searchParams.get('quizId'));
      if(!isUuid(quizId))return bad('Valid quiz id is required.');
      const devices=await sbAll(context,'quiz_device_access',`select=id,device_id,student_name,activated_at&quiz_id=eq.${enc(quizId)}&is_active=eq.true&order=activated_at.desc`,200,2000);
      return json({devices});
    }

    if (action === 'quiz-device-deactivate' && request.method === 'POST') {
      const id=cleanText(body.id);
      if(!isUuid(id))return bad('Valid device record id is required.');
      await sb(context,'quiz_device_access',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'quiz-device-clear' && request.method === 'POST') {
      const quizId=cleanText(body.quizId);
      if(!isUuid(quizId))return bad('Valid quiz id is required.');
      await sb(context,'quiz_device_access',{method:'DELETE',query:`quiz_id=eq.${enc(quizId)}&is_active=eq.true`});
      return json({ok:true});
    }

    if (action === 'bootstrap' && request.method === 'GET') {
      const warnings = [];
      const read = async (label, task, fallback = []) => {
        try { return await task(); }
        catch (error) {
          warnings.push(`${label}: ${error?.message || 'temporary database error'}`);
          return fallback;
        }
      };

      // The old bootstrap loaded every CBT separately (N+1 requests) and included
      // large question images. That made the dashboard vulnerable to gateway 502s
      // as the platform grew. Bootstrap now fetches lightweight metadata in a
      // small number of bounded reads; full question images are loaded only when
      // an administrator edits a specific question.
      const quizzes = await read('CBT list', () => sb(context, 'quizzes', {
        query: 'select=id,slug,result_slug,result_released,title,description,instructions,duration,pass_mark,status,settings,student_fields,access_mode,created_at,updated_at&order=created_at.desc'
      }), []);
      const sections = await read('CBT sections', () => sbAll(context, 'quiz_sections',
        'select=id,quiz_id,title,description,marks,position,created_at&order=quiz_id.asc,position.asc,created_at.asc', 500, 20000), []);
      const quizQuestions = await read('CBT questions', () => sbAll(context, 'questions',
        'select=id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,source_page,needs_review,position,created_at&quiz_id=not.is.null&order=quiz_id.asc,position.asc,created_at.asc', 500, 30000), []);
      const questionBank = await read('question bank', () => sbAll(context, 'questions',
        'select=id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,source_page,needs_review,position,created_at&quiz_id=is.null&pool_id=is.null&order=created_at.desc', 500, 20000), []);
      const attempts = await read('submitted attempts', () => sbAll(context, 'attempts',
        'select=id,quiz_id,device_id,student_name,score,total,percent,pass_mark,time_used,submitted_at,status,attempt_no&status=eq.submitted&order=submitted_at.desc', 500, 20000), []);
      const libraries = await read('CBT libraries', () => sbAll(context, 'cbt_libraries',
        'select=id,slug,name,description,access_mode,created_at,updated_at&order=name.asc,created_at.asc', 500, 5000), []);
      const libraryItems = await read('CBT library memberships', () => sbAll(context, 'cbt_library_items',
        'select=id,library_id,quiz_id,position,created_at&order=position.asc,created_at.asc', 500, 20000), []);
      const pools = await read('Question Pools', () => sbAll(context, 'question_pools',
        'select=id,slug,name,description,access_mode,created_at,updated_at&order=name.asc,created_at.asc', 500, 5000), []);
      const appSettingRows = await read('Platform settings', () => sb(context, 'app_settings', { query: 'select=key,value&key=eq.administrator_whatsapp&limit=1' }), []);
      const poolTopics = await read('Question Pool topics', () => sbAll(context, 'pool_topics',
        'select=id,pool_id,name,position,created_at&order=pool_id.asc,position.asc,created_at.asc', 500, 20000), []);
      const poolQuestionTopics = await read('Question Pool question counts', () => sbAll(context, 'questions',
        'select=topic_id,needs_review&pool_id=not.is.null&topic_id=not.is.null', 500, 50000), []);

      const sectionsByQuiz = new Map();
      for (const section of sections) {
        if (!sectionsByQuiz.has(section.quiz_id)) sectionsByQuiz.set(section.quiz_id, []);
        sectionsByQuiz.get(section.quiz_id).push(section);
      }
      const questionsByQuiz = new Map();
      for (const question of quizQuestions) {
        if (!questionsByQuiz.has(question.quiz_id)) questionsByQuiz.set(question.quiz_id, []);
        questionsByQuiz.get(question.quiz_id).push(question);
      }

      const bundles = quizzes.map(quiz => ({
        ...quiz,
        sections: sectionsByQuiz.get(quiz.id) || [],
        questions: questionsByQuiz.get(quiz.id) || [],
        dataUnavailable: false
      }));
      const degraded = warnings.length > 0;
      const quizMeta=new Map(quizzes.map(q=>[String(q.id),q]));
      const libraryBundles=libraries.map(lib=>({...lib,items:libraryItems.filter(item=>String(item.library_id)===String(lib.id)).map(item=>({...item,title:quizMeta.get(String(item.quiz_id))?.title||'CBT',slug:quizMeta.get(String(item.quiz_id))?.slug||'',status:quizMeta.get(String(item.quiz_id))?.status||'draft'}))}));
      const topicCounts=new Map();
      for(const row of poolQuestionTopics){if(row.needs_review)continue;const k=String(row.topic_id);topicCounts.set(k,(topicCounts.get(k)||0)+1);}
      const topicsByPool=new Map();
      for(const t of poolTopics){if(!topicsByPool.has(t.pool_id))topicsByPool.set(t.pool_id,[]);topicsByPool.get(t.pool_id).push({...t,questionCount:topicCounts.get(String(t.id))||0});}
      const poolBundles=pools.map(pool=>({...pool,topics:topicsByPool.get(pool.id)||[],link:pool.slug}));
      return json({ quizzes: bundles, questions: questionBank, attempts, libraries: libraryBundles, pools: poolBundles, settings: { administratorWhatsAppNumber: normalizeWhatsAppNumber(appSettingRows?.[0]?.value || '') }, warnings, degraded, build: 'v50.0.0-brainz-biltz-auditfix-20261029' });
    }

    if (action === 'quiz-create' && request.method === 'POST') {
      const title = cleanText(body.title);
      if (!title) return bad('Quiz title is required.');
      const row = {
        title,
        slug: await uniqueSlug(context),
        result_slug: await uniqueResultSlug(context),
        description: cleanText(body.description),
        instructions: cleanText(body.instructions),
        duration: validInteger(body.duration, 60, 1, 100000),
        pass_mark: validInteger(body.passMark, 50, 0, 100),
        status: 'draft',
        access_mode: cleanText(body.accessMode).toLowerCase()==='private'?'private':'public',
        settings: normalizeSettings(body.settings),
        student_fields: normalizeFields(body.studentFields)
      };
      const created = await sb(context, 'quizzes', { method: 'POST', query: 'select=*', body: row, headers: { prefer: 'return=representation' } });
      return json({ quiz: created[0] });
    }

    if (action === 'quiz-update' && request.method === 'PUT') {
      const id = cleanText(body.id);
      if (!id) return bad('Quiz id is required.');
      const existingQuiz = await sb(context, 'quizzes', { query: `select=id,status,access_mode&id=eq.${enc(id)}&limit=1` });
      if (!existingQuiz.length) return bad('CBT not found.', 404);
      const title = cleanText(body.title);
      if (!title) return bad('Quiz title is required.');
      const patch = {
        title,
        description: cleanText(body.description),
        instructions: cleanText(body.instructions),
        duration: validInteger(body.duration, 60, 1, 100000),
        pass_mark: validInteger(body.passMark, 50, 0, 100),
        status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : (existingQuiz[0].status || 'draft'),
        access_mode: cleanText(body.accessMode).toLowerCase()==='private'?'private':'public',
        settings: normalizeSettings(body.settings),
        student_fields: normalizeFields(body.studentFields)
      };
      const updated = await sb(context, 'quizzes', { method: 'PATCH', query: `id=eq.${enc(id)}&select=*`, body: patch, headers: { prefer: 'return=representation' } });
      return json({ quiz: updated[0] });
    }

    if (action === 'quiz-delete' && request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return bad('Quiz id is required.');
      if (!isUuid(id)) return bad('Invalid CBT identifier.');
      const existingQuiz = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(id)}&limit=1` });
      if (!existingQuiz.length) return bad('CBT not found.', 404);
      const result = await sbRpc(context, 'delete_quiz_cascade', { p_quiz_id:id });
      return json({ ok:true, removed:Number(result?.removed||0) });
    }

    if (action === 'quiz-duplicate' && request.method === 'POST') {
      const id=cleanText(body.id); if(!id||!isUuid(id)) return bad('Invalid CBT identifier.');
      const source=await sb(context,'quizzes',{query:`select=id,title,status&id=eq.${enc(id)}&limit=1`});
      if(!source.length)return bad('CBT not found.',404);
      const cloned=await sbRpc(context,'clone_quiz_cascade',{p_quiz_id:id});
      return json({ok:true,quizId:cloned?.quiz_id||cloned?.id});
    }

    if (action === 'attempt-delete' && request.method === 'DELETE') {
      const id=url.searchParams.get('id'); if(!id||!isUuid(id))return bad('Invalid attempt identifier.');
      const existing=await sb(context,'attempts',{query:`select=id,quiz_id,status&id=eq.${enc(id)}&limit=1`});
      if(!existing.length)return bad('Student attempt not found.',404);
      const removed=await sbRpc(context,'delete_attempt_cascade',{p_attempt_id:id});
      return json({ok:true,quizId:removed?.quiz_id||existing[0].quiz_id});
    }

    if (action === 'section-save' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      const title = cleanText(body.title);
      if (!quizId || !title) return bad('Quiz id and section title are required.');
      const quizExists = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(quizId)}&limit=1` });
      if (!quizExists.length) return bad('CBT not found.', 404);
      const rawMarks=body.marks===null||body.marks===undefined||body.marks===''?null:Number(body.marks); if(rawMarks!==null && (!Number.isFinite(rawMarks)||rawMarks<0)) return bad('Section marks must be 0 or greater.'); const row = { quiz_id: quizId, title, description: cleanText(body.description), marks: rawMarks, position: Math.max(0, Number(body.position) || 0) };
      if (body.id) {
        const existing = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(body.id)}&limit=1` });
        if (!existing.length) return bad('Section not found.', 404);
        if (existing[0].quiz_id !== quizId) return bad('Section does not belong to this CBT.');
      }
      const output = body.id
        ? await sb(context, 'quiz_sections', { method: 'PATCH', query: `id=eq.${enc(body.id)}&select=*`, body: row, headers: { prefer: 'return=representation' } })
        : await sb(context, 'quiz_sections', { method: 'POST', query: 'select=*', body: row, headers: { prefer: 'return=representation' } });
      return json({ section: output[0] });
    }

    if (action === 'section-delete' && request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return bad('Section id is required.');
      const existing = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(id)}&limit=1` });
      if (!existing.length) return bad('Section not found.', 404);
      const quizId = existing[0].quiz_id;
      // Reassign this section's questions to the first remaining section so a
      // deletion never leaves questions with no section (which would then block publishing).
      const remaining = await sb(context, 'quiz_sections', { query: `select=id&quiz_id=eq.${enc(quizId)}&id=neq.${enc(id)}&order=position.asc,created_at.asc&limit=1` });
      if (!remaining.length) return bad('A CBT must keep at least one section. Add another section before deleting this one.', 400);
      const destinationId = remaining[0].id;
      await sb(context, 'questions', { method: 'PATCH', query: `section_id=eq.${enc(id)}`, body: { section_id: destinationId }, headers: { prefer: 'return=minimal' } });
      await sb(context, 'quiz_sections', { method: 'DELETE', query: `id=eq.${enc(id)}` });
      return json({ ok: true, movedTo: destinationId });
    }

    if (action === 'passage-save' && request.method === 'POST') {
      const content = cleanText(body.content);
      if (!content) return bad('Passage content is required.');
      const quizId = cleanText(body.quizId) || null;
      if (quizId) {
        const quizExists = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(quizId)}&limit=1` });
        if (!quizExists.length) return bad('CBT not found.', 404);
      }
      const row = { quiz_id: quizId, title: cleanText(body.title) || 'Passage', content };
      if (body.id) {
        const existing = await sb(context, 'passages', { query: `select=id,quiz_id&id=eq.${enc(body.id)}&limit=1` });
        if (!existing.length) return bad('Passage not found.', 404);
        if (existing[0].quiz_id && existing[0].quiz_id !== quizId) return bad('Passage does not belong to this CBT.');
        if (existing[0].quiz_id && !quizId) return bad('A CBT passage cannot be moved to the question bank during editing.');
      }
      const output = body.id
        ? await sb(context, 'passages', { method: 'PATCH', query: `id=eq.${enc(body.id)}&select=*`, body: row, headers: { prefer: 'return=representation' } })
        : await sb(context, 'passages', { method: 'POST', query: 'select=*', body: row, headers: { prefer: 'return=representation' } });
      return json({ passage: output[0] });
    }

    if (action === 'question-get' && request.method === 'GET') {
      const id = cleanText(url.searchParams.get('id'));
      if (!id || !isUuid(id)) return bad('Question id is required.');
      const rows = await sb(context, 'questions', { query: `select=id,quiz_id,section_id,passage_id,pool_id,topic_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,image_data,source_page,needs_review,position,created_at&id=eq.${enc(id)}&limit=1` });
      if (!rows.length) return bad('Question not found.', 404);
      let question = { ...rows[0], image_data: boundedImageData(rows[0].image_data, STUDENT_MEDIA_MAX_CHARS), image_omitted: typeof rows[0].image_data === 'string' && rows[0].image_data.length > STUDENT_MEDIA_MAX_CHARS };
      if (question.passage_id) {
        const passages = await sb(context, 'passages', { query: `select=id,title,content&id=eq.${enc(question.passage_id)}&limit=1` });
        if (passages.length) question = { ...question, passage_title: passages[0].title, passage_content: passages[0].content };
      }
      return json({ question });
    }

    if (action === 'question-save' && request.method === 'POST') {
      const imageWasProvided = Object.prototype.hasOwnProperty.call(body, 'image_data');
      if (imageWasProvided && typeof body.image_data === 'string' && body.image_data.trim().length > DEFAULT_IMAGE_DATA_MAX_CHARS) return bad('This diagram is too large to save. Please compress it or choose a smaller image.');
      const question = normalizeQuestion(body);
      const pendingOptions = body.needsReview === true;
      const validationError = validateQuestion(question);
      if (validationError && !pendingOptions) return bad(validationError);

      const targetQuizId = cleanText(body.quizId);
      const targetSectionId = cleanText(body.sectionId);
      if (targetQuizId) {
        const quizExists = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(targetQuizId)}&limit=1` });
        if (!quizExists.length) return bad('CBT not found.', 404);
      }
      if (targetSectionId) {
        const sectionRows = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(targetSectionId)}&limit=1` });
        if (!sectionRows.length) return bad('Selected section was not found.', 404);
        if (targetQuizId && sectionRows[0].quiz_id !== targetQuizId) return bad('Selected section does not belong to this CBT.');
        if (!targetQuizId) return bad('A section can only be used with a CBT.');
      }
      if (targetQuizId && !targetSectionId) return bad('Every question in a CBT must belong to a section. Please select a section.', 400);

      const targetPoolId = cleanText(body.poolId);
      const targetTopicId = cleanText(body.topicId);
      if (targetPoolId) {
        const poolExists = await sb(context, 'question_pools', { query: `select=id&id=eq.${enc(targetPoolId)}&limit=1` });
        if (!poolExists.length) return bad('Question Pool not found.', 404);
      }
      if (targetTopicId) {
        const topicRows = await sb(context, 'pool_topics', { query: `select=id,pool_id&id=eq.${enc(targetTopicId)}&limit=1` });
        if (!topicRows.length) return bad('Selected topic was not found.', 404);
        if (targetPoolId && topicRows[0].pool_id !== targetPoolId) return bad('Selected topic does not belong to this Question Pool.');
        if (!targetPoolId) return bad('A topic can only be used with a Question Pool.');
      }
      if (targetPoolId && !targetTopicId) return bad('Every question in a Question Pool must belong to a topic. Please select a topic.', 400);
      if (body.image_data !== undefined && body.image_data !== null && String(body.image_data).trim() && !boundedImageData(body.image_data, DEFAULT_IMAGE_DATA_MAX_CHARS)) return bad('The diagram must be a valid HTTPS image URL or supported base64 image up to 1.2 MB.');

      let passageId = null;
      if (question.type === 'passage') {
        if (body.passageId) {
          const existing = await sb(context, 'passages', { query: `select=id,quiz_id&id=eq.${enc(body.passageId)}&limit=1` });
          if (!existing.length) return bad('Selected passage was not found.', 404);
          if (targetQuizId && existing[0].quiz_id && existing[0].quiz_id !== targetQuizId) return bad('Selected passage does not belong to this CBT.');
          passageId = existing[0].id;
          if (body.passageContent) {
            await sb(context, 'passages', { method: 'PATCH', query: `id=eq.${enc(passageId)}`, body: { title: cleanText(body.passageTitle) || 'Passage', content: cleanText(body.passageContent) }, headers: { prefer: 'return=minimal' } });
          }
        } else if (body.passageContent) {
          const createdPassage = await sb(context, 'passages', {
            method: 'POST', query: 'select=*',
            body: { quiz_id: body.quizId || null, title: cleanText(body.passageTitle) || 'Passage', content: cleanText(body.passageContent) },
            headers: { prefer: 'return=representation' }
          });
          passageId = createdPassage[0]?.id || null;
        } else {
          return bad('A passage question requires passage content.');
        }
      }

      const optsFilled = Array.isArray(question.options) && question.options.length === 4 && question.options.every(o => o && String(o).trim());
      const needs_review = !optsFilled;
      const row = { ...question, needs_review, quiz_id: targetQuizId || null, section_id: targetSectionId || null, passage_id: passageId, pool_id: targetPoolId || null, topic_id: targetTopicId || null };
      let previousPassageId = null;
      let previousAnswer = null;
      let previousMarks = null;
      if (body.id) {
        const existing = await sb(context, 'questions', { query: `select=id,quiz_id,passage_id,image_data,answer,marks&id=eq.${enc(body.id)}&limit=1` });
        if (!existing.length) return bad('Question not found.', 404);
        if (existing[0].quiz_id && targetQuizId && existing[0].quiz_id !== targetQuizId) return bad('Question does not belong to the selected CBT.');
        previousPassageId = existing[0].passage_id || null;
        previousAnswer = existing[0].answer;
        previousMarks = existing[0].marks;
        if (!imageWasProvided) row.image_data = existing[0].image_data ?? null;
      }
      const output = body.id
        ? await sb(context, 'questions', { method: 'PATCH', query: `id=eq.${enc(body.id)}&select=*`, body: row, headers: { prefer: 'return=representation' } })
        : await sb(context, 'questions', { method: 'POST', query: 'select=*', body: row, headers: { prefer: 'return=representation' } });
      if (body.id && previousPassageId && previousPassageId !== passageId) {
        const stillUsed = await sb(context, 'questions', { query: `select=id&passage_id=eq.${enc(previousPassageId)}&limit=1` });
        if (!stillUsed.length) await sb(context, 'passages', { method: 'DELETE', query: `id=eq.${enc(previousPassageId)}` });
      }
      // If the correct answer key or the mark value changed on a question that
      // already belongs to a CBT, any student who already submitted an attempt
      // with the old (wrong) data is now mis-scored. Regrade every submitted
      // attempt for this CBT against the corrected question so scores, pass/fail
      // status and the leaderboard immediately reflect the correction.
      let regraded = null;
      const savedQuizId = output[0]?.quiz_id || null;
      if (body.id && savedQuizId) {
        const answerChanged = previousAnswer !== null && Number(previousAnswer) !== Number(output[0].answer);
        const marksChanged = previousMarks !== null && Number(previousMarks) !== Number(output[0].marks);
        if (answerChanged || marksChanged) {
          try { regraded = await regradeQuizAttempts(context, savedQuizId); }
          catch (e) { regraded = { regraded: 0, error: e?.message || 'Regrade failed' }; }
        }
      }
      return json({ question: output[0], regraded });
    }

    if (action === 'question-bulk-delete' && request.method === 'POST') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(x => cleanText(x)).filter(Boolean))].slice(0, 500);
      if (!ids.length) return bad('Select at least one question to delete.');
      if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return bad('One or more selected question IDs are invalid. Refresh the Question Bank and try again.');
      const result = await sbRpc(context, 'delete_question_bank_bulk', { p_question_ids: ids });
      return json({ ok: true, removed: Number(result?.removed || 0), ids: Array.isArray(result?.deleted_ids) ? result.deleted_ids.map(String) : [] });
    }

    if (action === 'question-delete' && request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return bad('Question id is required.');
      const existing = await sb(context, 'questions', { query: `select=id&quiz_id=is.null&id=eq.${enc(id)}&limit=1` });
      const attached = existing.length ? null : await sb(context, 'questions', { query: `select=id,quiz_id&id=eq.${enc(id)}&limit=1` });
      if (!existing.length && !attached.length) return bad('Question not found.', 404);
      await sb(context, 'questions', { method: 'DELETE', query: `id=eq.${enc(id)}` });
      return json({ ok: true });
    }

    if (action === 'question-add' && request.method === 'POST') {
      const questionId = cleanText(body.questionId);
      const quizId = cleanText(body.quizId);
      const sectionId = cleanText(body.sectionId);
      if (!questionId || !quizId) return bad('Question and CBT identifiers are required.');
      const quizExists = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(quizId)}&limit=1` });
      if (!quizExists.length) return bad('CBT not found.', 404);
      if (sectionId) {
        const sectionRows = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(sectionId)}&limit=1` });
        if (!sectionRows.length) return bad('Selected section was not found.', 404);
        if (sectionRows[0].quiz_id !== quizId) return bad('Selected section does not belong to this CBT.');
      }
      if (!sectionId) return bad('Select a section for this CBT before adding the question.', 400);
      const sourceRows = await sb(context, 'questions', { query: `select=*&id=eq.${enc(questionId)}&limit=1` });
      if (!sourceRows.length) return bad('Question not found.', 404);
      const source = sourceRows[0];
      let passageId = null;
      if (source.passage_id) {
        const passages = await sb(context, 'passages', { query: `select=*&id=eq.${enc(source.passage_id)}&limit=1` });
        if (passages.length) {
          const sourcePassage = passages[0];
          const candidatePassages = await sb(context, 'passages', { query: `select=id,title,content&quiz_id=eq.${enc(quizId)}&title=eq.${enc(sourcePassage.title)}&limit=25` });
          const existingPassage = candidatePassages.find(passageItem => passageItem.title === sourcePassage.title && passageItem.content === sourcePassage.content);
          if (existingPassage) passageId = existingPassage.id;
          else {
            const copy = await sb(context, 'passages', { method: 'POST', query: 'select=*', body: { quiz_id: quizId, title: sourcePassage.title, content: sourcePassage.content }, headers: { prefer: 'return=representation' } });
            passageId = copy[0]?.id || null;
          }
        }
      }
      const row = {
        quiz_id: quizId,
        section_id: sectionId || null,
        passage_id: passageId,
        type: source.type || 'multiple_choice',
        text: source.text,
        options: source.options,
        answer: source.answer,
        explanation: source.explanation,
        subject: source.subject,
        topic: source.topic,
        difficulty: source.difficulty,
        marks: Number(source.marks)||1,
        image_data: source.image_data||null,
        source_page: source.source_page||null,
        position: Math.max(0, Number(body.position) || 0)
      };
      const output = await sb(context, 'questions', { method: 'POST', query: 'select=*', body: row, headers: { prefer: 'return=representation' } });
      return json({ question: output[0] });
    }

        if (action === 'builder-bulk-delete' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(x => cleanText(x)).filter(Boolean))].slice(0, 500);
      if (!quizId) return bad('Quiz id is required.');
      if (!ids.length) return bad('Select at least one question to delete.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quizId) || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return bad('One or more selected identifiers are invalid. Refresh the Question Builder and try again.');
      const quizExists = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(quizId)}&limit=1` });
      if (!quizExists.length) return bad('CBT not found.', 404);
      const result = await sbRpc(context, 'delete_quiz_questions_bulk', { p_quiz_id: quizId, p_question_ids: ids });
      const deletedIds = Array.isArray(result?.deleted_ids) ? result.deleted_ids.map(String) : [];
      return json({ ok: true, removed: Number(result?.removed || deletedIds.length), ids: deletedIds });
    }

    if (action === 'pool-bulk-delete' && request.method === 'POST') {
      const topicId = cleanText(body.topicId);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(x => cleanText(x)).filter(Boolean))].slice(0, 500);
      if (!topicId) return bad('Topic id is required.');
      if (!ids.length) return bad('Select at least one question to delete.');
      if (!isUuid(topicId) || ids.some(id => !isUuid(id))) return bad('One or more selected identifiers are invalid. Refresh the Question Pool and try again.');
      const topicExists = await sb(context, 'pool_topics', { query: `select=id&id=eq.${enc(topicId)}&limit=1` });
      if (!topicExists.length) return bad('Topic not found.', 404);
      const result = await sbRpc(context, 'delete_pool_topic_questions_bulk', { p_topic_id: topicId, p_question_ids: ids });
      const deletedIds = Array.isArray(result?.deleted_ids) ? result.deleted_ids.map(String) : [];
      return json({ ok: true, removed: Number(result?.removed || deletedIds.length), ids: deletedIds });
    }

    if (action === 'builder-bulk-move' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      const sectionId = cleanText(body.sectionId);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(x => cleanText(x)).filter(Boolean))].slice(0, 500) : [];
      if (!quizId || !sectionId) return bad('Quiz and destination section are required.');
      if (!ids.length) return bad('Select at least one question to move.');
      const sectionRows = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(sectionId)}&limit=1` });
      if (!sectionRows.length) return bad('Selected section was not found.', 404);
      if (sectionRows[0].quiz_id !== quizId) return bad('Selected section does not belong to this CBT.');
      const idFilter = `(${ids.map(enc).join(',')})`;
      const existing = await sb(context, 'questions', { query: `select=id&quiz_id=eq.${enc(quizId)}&id=in.${idFilter}` });
      if (!existing.length) return bad('None of the selected questions belong to this CBT. Refresh the Question Builder and try again.', 400);
      const movedRows = await sb(context, 'questions', {
        method: 'PATCH',
        query: `quiz_id=eq.${enc(quizId)}&id=in.${idFilter}&select=id`,
        body: { section_id: sectionId },
        headers: { prefer: 'return=representation' }
      });
      const movedIds = Array.isArray(movedRows) ? movedRows.map(row => String(row.id)) : [];
      if (movedIds.length !== existing.length) return bad('Not all selected questions could be moved. Refresh the Question Builder and try again.', 500);
      return json({ ok: true, moved: movedIds.length, ids: movedIds });
    }

    if (action === 'quiz-publish' && request.method === 'POST') {
      const id = cleanText(body.id);
      if (!id) return bad('Quiz id is required.');
      const quizRows = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(id)}&limit=1` });
      if (!quizRows.length) return bad('CBT not found.', 404);
      const sections = await sb(context, 'quiz_sections', { query: `select=id&quiz_id=eq.${enc(id)}&limit=1` });
      if (!sections.length) return bad('You have not completed this. Please add at least one section before continuing.', 400);
      const rows = await sb(context, 'questions', { query: `select=id&quiz_id=eq.${enc(id)}&limit=1` });
      if (!rows.length) return bad('Add at least one question before publishing.');
      const optionRows = await sbAll(context, 'questions', `select=id,options,answer,needs_review&quiz_id=eq.${enc(id)}`);
      if (optionRows.some(r => !Array.isArray(r.options) || r.options.length !== 4 || r.options.some(o => !o || !String(o).trim()) || !Number.isInteger(Number(r.answer)) || Number(r.answer) < 0 || Number(r.answer) > 3 || r.needs_review)) return bad('Some questions are incomplete or still marked for review. Complete every question and correct answer before publishing.', 400);
      const unsectioned = await sb(context, 'questions', { query: `select=id&quiz_id=eq.${enc(id)}&section_id=is.null&limit=1` });
      if (unsectioned.length) return bad('Every question must belong to a section before publishing. Move any unsectioned questions into a section and try again.', 400);
      const updated = await sb(context, 'quizzes', { method: 'PATCH', query: `id=eq.${enc(id)}&select=*`, body: { status: 'published' }, headers: { prefer: 'return=representation' } });
      const libraryIds=Array.isArray(body.libraryIds)?[...new Set(body.libraryIds.map(x=>cleanText(x)).filter(Boolean))].slice(0,100):[];
      // Synchronize this CBT's memberships with the current checkbox selection:
      // unchecked libraries are removed, checked libraries are added.
      const validLibraries=libraryIds.length
        ? await sb(context,'cbt_libraries',{query:`select=id&id=in.(${libraryIds.map(enc).join(',')})`})
        : [];
      await sb(context,'cbt_library_items',{method:'DELETE',query:`quiz_id=eq.${enc(id)}`});
      for(let i=0;i<validLibraries.length;i++){
        await sb(context,'cbt_library_items',{method:'POST',query:'select=id',body:{library_id:validLibraries[i].id,quiz_id:id,position:i},headers:{prefer:'return=minimal'}});
      }
      return json({ quiz: updated[0] });
    }


    if (action === 'library-create' && request.method === 'POST') {
      const name=cleanText(body.name);if(!name)return bad('Library name is required.');
      const accessMode=cleanText(body.accessMode).toLowerCase()==='private'?'private':'public';
      const library=await sb(context,'cbt_libraries',{method:'POST',query:'select=*',body:{name,slug:await uniqueLibrarySlug(context),description:cleanText(body.description),access_mode:accessMode},headers:{prefer:'return=representation'}});
      return json({library:library[0]});
    }

    if (action === 'library-update' && request.method === 'PUT') {
      const id=cleanText(body.id);const name=cleanText(body.name);if(!id)return bad('Library id is required.');if(!name)return bad('Library name is required.');
      const found=await sb(context,'cbt_libraries',{query:`select=id&${isUuid(id)?`id=eq.${enc(id)}`:`slug=eq.${enc(id)}`}&limit=1`});if(!found.length)return bad('CBT Library not found.',404);
      const accessMode=cleanText(body.accessMode).toLowerCase()==='private'?'private':'public';
      const updated=await sb(context,'cbt_libraries',{method:'PATCH',query:`id=eq.${enc(found[0].id)}&select=*`,body:{name,description:cleanText(body.description),access_mode:accessMode,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
      return json({library:updated[0]});
    }

    if (action === 'library-device-code' && request.method === 'POST') {
      const libraryId=cleanText(body.libraryId);
      const deviceId=cleanText(body.deviceId).slice(0,200);
      if(!isUuid(libraryId))return bad('Valid library id is required.');
      if(deviceId.length<8)return bad('Enter a valid device ID.');
      const libraryRows=await sb(context,'cbt_libraries',{query:`select=id,slug,name,access_mode&id=eq.${enc(libraryId)}&limit=1`});
      if(!libraryRows.length)return bad('CBT Library not found.',404);
      if(libraryRows[0].access_mode!=='private')return bad('Change this library to Private before generating device activation codes.');
      const activationCode=generatedActivationCode();
      const activationCodeHash=await sha256Hex(activationCode);
      const now=new Date();
      const expiresAt=new Date(now.getTime()+7*24*60*60*1000).toISOString();
      const saved=await sb(context,'cbt_library_device_access',{
        method:'POST',query:'on_conflict=library_id,device_id&select=id,device_id,is_active,activation_expires_at',
        body:{library_id:libraryId,device_id:deviceId,activation_code_hash:activationCodeHash,activation_expires_at:expiresAt,is_active:false,activated_at:null,updated_at:now.toISOString()},
        headers:{prefer:'resolution=merge-duplicates,return=representation'}
      });
      if(!saved?.length)return bad('The activation code could not be registered. Please try again.',500);
      return json({ok:true,activationCode,deviceId,expiresAt,libraryName:libraryRows[0].name,message:'Activation code generated. It expires in seven days and is valid only for the registered device.'});
    }

    if (action === 'library-device-list' && request.method === 'GET') {
      const libraryId=cleanText(url.searchParams.get('libraryId'));
      if(!isUuid(libraryId))return bad('Valid library id is required.');
      const devices=await sbAll(context,'cbt_library_device_access',`select=id,device_id,student_name,activated_at&library_id=eq.${enc(libraryId)}&is_active=eq.true&order=activated_at.desc`,200,2000);
      return json({devices});
    }

    if (action === 'library-device-deactivate' && request.method === 'POST') {
      const id=cleanText(body.id);
      if(!isUuid(id))return bad('Valid device record id is required.');
      await sb(context,'cbt_library_device_access',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'library-device-clear' && request.method === 'POST') {
      const libraryId=cleanText(body.libraryId);
      if(!isUuid(libraryId))return bad('Valid library id is required.');
      await sb(context,'cbt_library_device_access',{method:'DELETE',query:`library_id=eq.${enc(libraryId)}&is_active=eq.true`});
      return json({ok:true});
    }

    if (action === 'library-sync' && request.method === 'POST') {
      const libraryId=cleanText(body.libraryId);if(!isUuid(libraryId))return bad('Valid library id is required.');
      const libraryRows=await sb(context,'cbt_libraries',{query:`select=id&id=eq.${enc(libraryId)}&limit=1`});if(!libraryRows.length)return bad('CBT Library not found.',404);
      const quizIds=Array.isArray(body.quizIds)?[...new Set(body.quizIds.map(x=>cleanText(x)).filter(Boolean))].slice(0,500):[];
      const published=quizIds.length?await sb(context,'quizzes',{query:`select=id&status=eq.published&id=in.(${quizIds.map(enc).join(',')})`}):[];
      await sb(context,'cbt_library_items',{method:'DELETE',query:`library_id=eq.${enc(libraryId)}`});
      for(let i=0;i<published.length;i++){await sb(context,'cbt_library_items',{method:'POST',query:'select=id',body:{library_id:libraryId,quiz_id:published[i].id,position:i},headers:{prefer:'return=minimal'}});}
      return json({ok:true,count:published.length});
    }

    if (action === 'library-delete' && request.method === 'DELETE') {
      const id=cleanText(url.searchParams.get('id'));if(!isUuid(id))return bad('Valid library id is required.');
      const found=await sb(context,'cbt_libraries',{query:`select=id&id=eq.${enc(id)}&limit=1`});if(!found.length)return bad('CBT Library not found.',404);
      await sb(context,'cbt_libraries',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'pool-create' && request.method === 'POST') {
      const name=cleanText(body.name);if(!name)return bad('Question Pool name is required.');
      const accessMode=cleanText(body.accessMode).toLowerCase()==='private'?'private':'public';
      const pool=await sb(context,'question_pools',{method:'POST',query:'select=*',body:{name,slug:await uniquePoolSlug(context),description:cleanText(body.description),access_mode:accessMode},headers:{prefer:'return=representation'}});
      return json({pool:{...pool[0],topics:[]}});
    }

    if (action === 'pool-update' && request.method === 'PUT') {
      const id=cleanText(body.id);const name=cleanText(body.name);if(!id)return bad('Question Pool id is required.');if(!name)return bad('Question Pool name is required.');
      const found=await sb(context,'question_pools',{query:`select=id&${isUuid(id)?`id=eq.${enc(id)}`:`slug=eq.${enc(id)}`}&limit=1`});if(!found.length)return bad('Question Pool not found.',404);
      const accessMode=cleanText(body.accessMode).toLowerCase()==='private'?'private':'public';
      const updated=await sb(context,'question_pools',{method:'PATCH',query:`id=eq.${enc(found[0].id)}&select=*`,body:{name,description:cleanText(body.description),access_mode:accessMode,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
      return json({pool:updated[0]});
    }

    if (action === 'pool-delete' && request.method === 'DELETE') {
      const id=cleanText(url.searchParams.get('id'));if(!isUuid(id))return bad('Valid Question Pool id is required.');
      const found=await sb(context,'question_pools',{query:`select=id&id=eq.${enc(id)}&limit=1`});if(!found.length)return bad('Question Pool not found.',404);
      await sb(context,'question_pools',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'pool-device-code' && request.method === 'POST') {
      const poolId=cleanText(body.poolId);
      const deviceId=cleanText(body.deviceId).slice(0,200);
      if(!isUuid(poolId))return bad('Valid Question Pool id is required.');
      if(deviceId.length<8)return bad('Enter a valid device ID.');
      const poolRows=await sb(context,'question_pools',{query:`select=id,slug,name,access_mode&id=eq.${enc(poolId)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      if(poolRows[0].access_mode!=='private')return bad('Change this Question Pool to Private before generating device activation codes.');
      const activationCode=generatedActivationCode();
      const activationCodeHash=await sha256Hex(activationCode);
      const now=new Date();
      const expiresAt=new Date(now.getTime()+7*24*60*60*1000).toISOString();
      const saved=await sb(context,'pool_device_access',{
        method:'POST',query:'on_conflict=pool_id,device_id&select=id,device_id,is_active,activation_expires_at',
        body:{pool_id:poolId,device_id:deviceId,activation_code_hash:activationCodeHash,activation_expires_at:expiresAt,is_active:false,activated_at:null,updated_at:now.toISOString()},
        headers:{prefer:'resolution=merge-duplicates,return=representation'}
      });
      if(!saved?.length)return bad('The activation code could not be registered. Please try again.',500);
      return json({ok:true,activationCode,deviceId,expiresAt,poolName:poolRows[0].name,message:'Activation code generated. It expires in seven days and is valid only for the registered device.'});
    }

    if (action === 'pool-device-list' && request.method === 'GET') {
      const poolId=cleanText(url.searchParams.get('poolId'));
      if(!isUuid(poolId))return bad('Valid Question Pool id is required.');
      const devices=await sbAll(context,'pool_device_access',`select=id,device_id,student_name,activated_at&pool_id=eq.${enc(poolId)}&is_active=eq.true&order=activated_at.desc`,200,2000);
      return json({devices});
    }

    if (action === 'pool-device-deactivate' && request.method === 'POST') {
      const id=cleanText(body.id);
      if(!isUuid(id))return bad('Valid device record id is required.');
      await sb(context,'pool_device_access',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'pool-device-clear' && request.method === 'POST') {
      const poolId=cleanText(body.poolId);
      if(!isUuid(poolId))return bad('Valid Question Pool id is required.');
      await sb(context,'pool_device_access',{method:'DELETE',query:`pool_id=eq.${enc(poolId)}&is_active=eq.true`});
      return json({ok:true});
    }

    if (action === 'pool-topic-save' && request.method === 'POST') {
      const poolId=cleanText(body.poolId);
      const name=cleanText(body.name);
      const id=cleanText(body.id);
      if(!isUuid(poolId))return bad('Valid Question Pool id is required.');
      if(!name)return bad('Topic name is required.');
      const poolRows=await sb(context,'question_pools',{query:`select=id&id=eq.${enc(poolId)}&limit=1`});
      if(!poolRows.length)return bad('Question Pool not found.',404);
      if(id){
        const existing=await sb(context,'pool_topics',{query:`select=id,pool_id&id=eq.${enc(id)}&limit=1`});
        if(!existing.length)return bad('Topic not found.',404);
        if(existing[0].pool_id!==poolId)return bad('Topic does not belong to this Question Pool.');
        const updated=await sb(context,'pool_topics',{method:'PATCH',query:`id=eq.${enc(id)}&select=*`,body:{name,updated_at:new Date().toISOString()},headers:{prefer:'return=representation'}});
        return json({topic:updated[0]});
      }
      const countRows=await sb(context,'pool_topics',{query:`select=id&pool_id=eq.${enc(poolId)}`});
      const created=await sb(context,'pool_topics',{method:'POST',query:'select=*',body:{pool_id:poolId,name,position:countRows.length},headers:{prefer:'return=representation'}});
      return json({topic:{...created[0],questionCount:0}});
    }

    if (action === 'pool-topic-delete' && request.method === 'DELETE') {
      const id=cleanText(url.searchParams.get('id'));if(!isUuid(id))return bad('Valid topic id is required.');
      const found=await sb(context,'pool_topics',{query:`select=id&id=eq.${enc(id)}&limit=1`});if(!found.length)return bad('Topic not found.',404);
      // Questions in this topic are not deleted; they are orphaned (topic_id set null) by the
      // database foreign key and remain visible as unassigned questions under the pool.
      await sb(context,'pool_topics',{method:'DELETE',query:`id=eq.${enc(id)}`});
      return json({ok:true});
    }

    if (action === 'pool-topic-questions' && request.method === 'GET') {
      const topicId=cleanText(url.searchParams.get('topicId'));
      if(!isUuid(topicId))return bad('Valid topic id is required.');
      const found=await sb(context,'pool_topics',{query:`select=id,pool_id&id=eq.${enc(topicId)}&limit=1`});
      if(!found.length)return bad('Topic not found.',404);
      const rows=await sbAll(context,'questions',`select=id,pool_id,topic_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,source_page,needs_review,position,created_at&topic_id=eq.${enc(topicId)}&order=position.asc,created_at.asc`,100,20000);
      return json({topicId,poolId:found[0].pool_id,questions:rows});
    }

    if (action === 'pool-questions-move' && request.method === 'POST') {
      const questionIds=[...new Set((Array.isArray(body.questionIds)?body.questionIds:[]).map(x=>cleanText(x)).filter(isUuid))].slice(0,500);
      const topicId=cleanText(body.topicId);
      if(!questionIds.length)return bad('Select at least one question to move.');
      if(!isUuid(topicId))return bad('Valid destination topic id is required.');
      const topicRows=await sb(context,'pool_topics',{query:`select=id,pool_id,name&id=eq.${enc(topicId)}&limit=1`});
      if(!topicRows.length)return bad('Destination topic not found.',404);
      const topic=topicRows[0];
      // Only within the same pool: a cross-pool move would silently detach a question from
      // the pool it was generated/imported for, which is never what "move to another topic
      // in this pool" means from the admin UI.
      const owned=await sb(context,'questions',{query:`select=id&pool_id=eq.${enc(topic.pool_id)}&id=in.(${questionIds.map(enc).join(',')})`});
      if(owned.length!==questionIds.length)return bad('One or more selected questions do not belong to this Question Pool.',400);
      const updated=await sb(context,'questions',{method:'PATCH',query:`id=in.(${questionIds.map(enc).join(',')})&select=id`,body:{topic_id:topicId,topic:topic.name},headers:{prefer:'return=representation'}});
      return json({ok:true,moved:Array.isArray(updated)?updated.length:0,topicId,topicName:topic.name});
    }

    if (action === 'admin-leaderboard' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) return bad('Quiz id is required.');
      const quizzes = await sb(context, 'quizzes', { query: `select=id,title,settings&id=eq.${enc(id)}&limit=1` });
      if (!quizzes.length) return bad('Quiz not found.', 404);
      const requestedLimit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit')) || 1000));
      const allRows = await sbAll(context, 'attempts', `select=id,student_name,score,total,percent,time_used,submitted_at,device_id,attempt_no&quiz_id=eq.${enc(id)}&status=eq.submitted`, 100, Math.max(requestedLimit * 4, 50000));
      const first = new Map();
      for(const row of allRows){ const key=String(row.device_id||row.id); const cur=first.get(key); const rowNo=Number(row.attempt_no||0), curNo=Number(cur?.attempt_no||0); const rowDate=Date.parse(row.submitted_at||'')||0, curDate=Date.parse(cur?.submitted_at||'')||0; if(!cur||(rowNo>0&&(!curNo||rowNo<curNo))||((!rowNo||!curNo||rowNo===curNo)&&rowDate>0&&(!curDate||rowDate<curDate))) first.set(key,row); }
      const rows = [...first.values()].sort((a,b)=>Number(b.percent)-Number(a.percent)||Number(a.time_used)-Number(b.time_used)||String(a.id).localeCompare(String(b.id))).slice(0,requestedLimit);
      return json({ leaderboard: rows.map((row, index) => ({ id: row.id, rank: index + 1, name: row.student_name, score: Math.round(Number(row.score||0)), total: Math.round(Number(row.total||0)), percent: row.percent, timeUsed: row.time_used, submittedAt: row.submitted_at })) });
    }

    if (action === 'result-release' && request.method === 'POST') {
      const quizId = cleanText(body.quizId);
      if (!quizId) return bad('CBT id is required.');
      const quizzes = await sb(context, 'quizzes', { query: `select=id,result_slug,status&status=eq.published&id=eq.${enc(quizId)}&limit=1` });
      if (!quizzes.length) return bad('Published CBT not found.', 404);
      const resultSlug = quizzes[0].result_slug || await uniqueResultSlug(context);
      if (!quizzes[0].result_slug) {
        await sb(context, 'quizzes', { method: 'PATCH', query: `id=eq.${enc(quizId)}`, body: { result_slug: resultSlug }, headers: { prefer: 'return=minimal' } });
      }
      await sb(context, 'quizzes', { method: 'PATCH', query: `id=eq.${enc(quizId)}`, body: { result_released: true }, headers: { prefer: 'return=minimal' } });
      return json({ released: true, resultSlug });
    }

    if (action === 'clear-leaderboard' && request.method === 'POST') {
      const id = cleanText(body.id);
      if (!id) return bad('Quiz id is required.');
      if (!isUuid(id)) return bad('Invalid CBT identifier.');
      const quizzes = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(id)}&limit=1` });
      if (!quizzes.length) return bad('CBT not found.', 404);
      const result = await sbRpc(context, 'clear_quiz_attempts_atomic', { p_quiz_id: id });
      return json({ ok: true, removed: Number(result?.removed || 0) });
    }

    if (action === 'ai-generate' && request.method === 'POST') {
      const count = validInteger(body.count, 10, 1, 200);
      const subject = cleanText(body.subject) || 'General';
      const topic = cleanText(body.topic) || 'General';
      const difficulty = cleanText(body.difficulty) || 'Mixed';
      const type = cleanText(body.type) || 'auto';
      const exam = cleanText(body.exam) || 'UTME';
      const instructions = cleanText(body.instructions) || 'None';
      const prompt = `Subject: ${subject}. Topic: ${topic}. Difficulty: ${difficulty}. Exam style: ${exam}. Requested question type: ${type}. Extra instruction: ${instructions}. If the requested type is auto, infer it from the instruction. If passage-based is requested, create a passage and several related questions when appropriate.`;
      return json(await generateWithGroq(context, { prompt, count }));
    }

    if (action === 'ai-save-batch' && request.method === 'POST') {
      const quizId = body.quizId ? cleanText(body.quizId) : null;
      const sectionId = body.sectionId ? cleanText(body.sectionId) : null;
      const poolId = body.poolId ? cleanText(body.poolId) : null;
      const topicId = body.topicId ? cleanText(body.topicId) : null;
      const questions = Array.isArray(body.questions) ? body.questions : [];
      if (!questions.length) return bad('No questions supplied.');
      if (questions.length > 500) return bad('A maximum of 500 questions can be saved at once.');
      if (quizId && !isUuid(quizId)) return bad('Invalid CBT identifier.');
      if (sectionId && !isUuid(sectionId)) return bad('Invalid section identifier.');
      if (quizId && !sectionId) return bad('Every question in a CBT must belong to a section.');
      if (poolId && !isUuid(poolId)) return bad('Invalid Question Pool identifier.');
      if (topicId && !isUuid(topicId)) return bad('Invalid topic identifier.');
      if (poolId && !topicId) return bad('Every question in a Question Pool must belong to a topic.');
      for (const q of questions) {
        if (typeof q?.image_data === 'string' && q.image_data.trim().length > DEFAULT_IMAGE_DATA_MAX_CHARS) return bad('At least one imported diagram is too large to save. Compress the diagram and try again.');
        if (q?.image_data !== undefined && q?.image_data !== null && String(q.image_data).trim() && !boundedImageData(q.image_data, DEFAULT_IMAGE_DATA_MAX_CHARS)) return bad('One or more imported diagrams are invalid. Use an HTTPS image or supported base64 image.');
      }
      const normalized = questions.map(q => ({ ...normalizeQuestion(q), passage: q?.passage && typeof q.passage === 'object' ? { title: cleanText(q.passage.title) || 'Passage', content: cleanText(q.passage.content) } : null }));
      for (const q of normalized) {
        const err = validateQuestion(q);
        if (err) return bad(err);
        if (q.answer === null) return bad('Every question must have a correct answer before saving.');
        if (q.type === 'passage' && !q.passage?.content) return bad('A passage question requires passage content.');
      }
      if (quizId) {
        const qRows = await sb(context, 'quizzes', { query: `select=id&id=eq.${enc(quizId)}&limit=1` });
        if (!qRows.length) return bad('CBT not found.', 404);
        const secRows = await sb(context, 'quiz_sections', { query: `select=id,quiz_id&id=eq.${enc(sectionId)}&limit=1` });
        if (!secRows.length || secRows[0].quiz_id !== quizId) return bad('Selected section does not belong to this CBT.', 400);
      }
      if (poolId) {
        const poolRows = await sb(context, 'question_pools', { query: `select=id&id=eq.${enc(poolId)}&limit=1` });
        if (!poolRows.length) return bad('Question Pool not found.', 404);
        const topicRows = await sb(context, 'pool_topics', { query: `select=id,pool_id&id=eq.${enc(topicId)}&limit=1` });
        if (!topicRows.length || topicRows[0].pool_id !== poolId) return bad('Selected topic does not belong to this Question Pool.', 400);
      }

      if (poolId) {
        // Pool questions are saved through a single atomic bulk-insert RPC
        // (gb_save_pool_questions_v1), the same pattern used for CBT
        // questions below, rather than one POST per question. Looping one
        // row at a time here used to mean up to 500 sequential round trips
        // to Supabase for a single "Save to Question Pool" click, which was
        // slow enough to routinely hit a gateway timeout (surfaced to the
        // admin as an HTTP 502) and left a partial batch behind on failure.
        const result = await sbRpc(context, 'gb_save_pool_questions_v1', { p_pool_id: poolId, p_topic_id: topicId, p_questions: normalized });
        return json({ ok: true, inserted: Number(result?.inserted || 0), ids: Array.isArray(result?.ids) ? result.ids : [] });
      }
      const result = await sbRpc(context, 'gb_save_ai_questions_v3', { p_quiz_id: quizId, p_section_id: sectionId, p_questions: normalized });
      return json({ ok: true, inserted: Number(result?.inserted || 0), ids: Array.isArray(result?.ids) ? result.ids : [] });
    }

    if (action === 'ai-extract' && request.method === 'POST') {
      const text = cleanText(body.text);
      if (!text) return bad('No document text was supplied.');
      if (text.length > 180000) return bad('Document text is too large for one extraction. Split the document into smaller parts.');
      const instructions = cleanText(body.instructions) || 'Extract the full question: stem, four A-D options, correct answer and explanation/reason when present. Preserve maths and associate embedded images with the correct question. Never guess a missing answer; flag it for review.';
      return json(await generateWithGroq(context, { prompt: `${instructions}\n\nSOURCE DOCUMENT:\n${text}`, count: validInteger(body.count, 50, 1, 200), extract: true }));
    }

    return bad('Unknown API action.', 404);
  } catch (error) {
    const candidateStatus = Number(error?.status || error?.supabaseStatus || 500);
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
    return bad(error?.message || 'Server error.', status);
  }
}

export default handler;
export const onRequest = handler;function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }


