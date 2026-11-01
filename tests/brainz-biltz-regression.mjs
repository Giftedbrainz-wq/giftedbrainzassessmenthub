import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../edge-functions/api/index.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema_brainz_biltz_migration.sql', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('migration creates the challenge, registration, and attempt-link tables', () => {
  for (const table of ['brainz_biltz_challenges', 'brainz_biltz_participants', 'brainz_biltz_attempts']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(migration, /unique \(challenge_id, device_id\)/);
  assert.match(migration, /attempt_id uuid not null unique references public\.attempts\(id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.brainz_biltz_participants from anon, authenticated/);
});

test('challenge schema constrains schedule, duration, entry mode, status, attempts, and finish policy', () => {
  for (const rule of [
    /constraint brainz_biltz_challenge_times check \(end_at > start_at\)/,
    /duration_minutes between 1 and 600/,
    /entry_fee >= 0/,
    /access_mode in \('public','private'\)/,
    /status in \('draft','published','paused','cancelled','archived'\)/,
    /attempt_limit between 1 and 100/,
    /finish_policy in \('full_duration','finish_by_end'\)/
  ]) assert.match(migration, rule);
});

test('public challenge link actions exist, while challenge creation and participant approvals require an administrator', () => {
  for (const action of ['biltz-public', 'biltz-register', 'biltz-list', 'biltz-save', 'biltz-participants', 'biltz-participant-status', 'biltz-publish-results', 'biltz-leaderboard']) {
    assert.ok(api.includes(`action === '${action}'`), `Missing API action ${action}`);
  }
  for (const marker of ["action === 'biltz-list'", "action === 'biltz-save'", "action === 'biltz-participants'", "action === 'biltz-participant-status'", "action === 'biltz-publish-results'"]) {
    const start = api.indexOf(marker);
    const block = api.slice(start, start + 1400);
    assert.match(block, /isAdmin\(context, request\)/, `${marker} must be administrator-gated`);
  }
});

test('challenge schedules, approved-device checks, finish policy and per-challenge attempt limits are server-enforced', () => {
  assert.match(api, /if \(now < startAt\)/);
  assert.match(api, /if \(now > endAt\)/);
  assert.match(api, /challenge\.finish_policy === 'finish_by_end'/);
  assert.match(api, /participant\.status !== 'approved'/);
  assert.match(api, /priorBiltzAttempts\.length\s*>=\s*Number\(biltzAccess\.challenge\.attempt_limit\)/);
  assert.match(api, /The Brainz Biltz entry window has closed/);
});

test('unstarted challenge requests do not reveal questions; a token-bound attempt is required for question delivery', () => {
  assert.match(api, /const biltzAttemptId\s*=\s*cleanText\(url\.searchParams\.get\('attemptId'\)\)/);
  assert.match(api, /verifyAttemptToken\(context,attemptToken,biltzAttemptId,quiz\.id\)/);
  assert.match(api, /if\(!biltzAttemptId\)out\.questions=\[\]/);
  assert.match(api, /challengeQuiz = publicQuiz\(bundle\.quiz, bundle\.sections, bundle\.questions\)/);
  assert.match(api, /brainz_biltz_attempts/);
});

test('the ordinary quiz link can be gated and a challenge cannot change its CBT after attempts exist', () => {
  assert.match(api, /This CBT is available through its Brainz Biltz challenge link only/);
  assert.match(api, /cannot be changed after registration begins/);
  assert.match(api, /select=id,slug,quiz_id,start_at,end_at,duration_minutes,entry_fee,access_mode,attempt_limit,max_participants,finish_policy,challenge_only/);
});

test('ordinary quiz routes are gated when a challenge requires its share link, regardless of challenge status', () => {
  assert.match(api, /select=id&quiz_id=eq\.\$\{enc\(quizId\)\}&challenge_only=eq\.true&limit=1/);
  assert.doesNotMatch(api, /challenge_only=eq\.true&status=in\.\(published,paused,cancelled,archived\)/);
  assert.match(api, /const challengeOnly = body\.challengeOnly !== false \|\| accessMode === 'private' \|\| entryFee > 0/);
});

test('Brainz Biltz result access is challenge-scoped and follows challenge release/review settings', () => {
  assert.match(api, /brainz_biltz_attempts.*attempt_id=eq\.\$\{enc\(tokenAttempt\.id\)\}/s);
  assert.match(api, /Challenge results will be available after the challenge closes/);
  assert.match(api, /Challenge results have not been published yet/);
  assert.match(api, /settings\.reviewEnabled = linkedBiltzChallenge\.review_enabled !== false/);
  assert.match(api, /settings\.leaderboardEnabled = linkedBiltzChallenge\.leaderboard_enabled !== false/);
  assert.match(api, /result\.challengeSlug = linkedBiltzChallenge\.slug/);
  assert.match(app, /result\.challengeSlug\?`<a class="btn btn-primary" href="\$\{location\.pathname\}\?biltz=/);
});

test('submitted challenge result flags come from challenge settings, not the underlying CBT defaults', () => {
  assert.match(api, /resultEnabled: settingsForScoring\.resultEnabled, leaderboardEnabled: settingsForScoring\.leaderboardEnabled, reviewEnabled: settingsForScoring\.reviewEnabled/);
  assert.match(api, /if \(settingsForScoring\.resultEnabled && settingsForScoring\.reviewEnabled !== false\) output\.corrections/);
});

test('private challenge leaderboard requires an approved participant or administrator', () => {
  assert.match(api, /challenge\.access_mode === 'private' && !\(await isAdmin\(context, request\)\)/);
  assert.match(api, /This Brainz Biltz leaderboard is private/);
});

test('client generates a directly shareable Brainz Biltz URL and supports register, enter, status refresh and leaderboard actions', () => {
  assert.match(app, /function biltzPublicLink\(slug\)/);
  assert.match(app, /\?biltz=\$\{encodeURIComponent\(slug\)\}/);
  for (const method of ['loadBiltzChallenge', 'registerForBiltz', 'enterBiltzChallenge', 'refreshBiltzStatus', 'showBiltzLandingLeaderboard', 'beginStudentTest']) {
    assert.ok(app.includes(`function ${method}`) || app.includes(`async function ${method}`), `Missing client method ${method}`);
  }
});

test('the entry experience has aura effects, countdown components, responsive styling, and reduced-motion support', () => {
  for (const className of ['biltz-page', 'biltz-ambient', 'biltz-particles', 'biltz-brand-emblem', 'biltz-entry-orb', 'biltz-enter-btn', 'biltz-countdown-wrap']) assert.ok(css.includes(`.${className}`), `Missing ${className} styles`);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /THE CHALLENGE BEGINS IN/);
  assert.match(app, /BRAINZ <b>BILTZ<\/b>/);
});

test('challenge participation supports payment verification and status updates without pretending to collect payment online', () => {
  assert.match(api, /pending_payment/);
  assert.match(api, /payment_reference/);
  assert.match(app, /Payment is verified by the administrator; no payment is collected on this page/);
  assert.match(app, /Payment verification pending/);
});

test('challenge attempts can recover saved progress after refresh and use the configured duration', () => {
  assert.match(app, /activeProgressKey\(quizId,challengeSlug=''/);
  assert.match(app, /persistStudentProgress\(true\)/);
  assert.match(app, /attemptToken:activeProgress\.attemptToken/);
  assert.match(app, /durationSeconds/);
});

test('new asset cache-busting version is applied without changing the Brainz Biltz API build', () => {
  assert.match(index, /styles\.css\?v=v51\.0-eduspace-bridge-20261101/);
  assert.match(index, /app\.js\?v=v51\.0-eduspace-bridge-20261101/);
  assert.match(api, /v50\.0\.0-brainz-biltz-auditfix-20261029/);
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`PASS  ${t.name}`); }
  catch (error) { failed++; console.error(`FAIL  ${t.name}\n      ${error.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} Brainz Biltz regression checks passed.`);
if (failed) process.exitCode = 1;
