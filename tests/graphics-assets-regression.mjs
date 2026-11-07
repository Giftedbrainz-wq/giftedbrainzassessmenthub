import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p,root));
const png = Buffer.from([137,80,78,71,13,10,26,10]);
for(const name of ['icon.png','icon-light.png','logo-full.png','superbiz-doodle-bg.png']) {
  const img=read('assets/'+name);
  assert.deepEqual(img.subarray(0,8),png,`Corrupt Hub brand asset: ${name}`);
}
for(const folder of ['avatars','battle','subject-cover']) {
  assert.equal(fs.existsSync(new URL('assets/'+folder+'/',root)),false,`EduSpace-only asset folder ${folder} leaked into Assessment Hub`);
}
const js=read('app.js').toString();
assert.doesNotMatch(js,/assets\/(avatars|battle|subject-cover)\//);
assert.doesNotMatch(js,/class="admin-avatar"/);
assert.doesNotMatch(js,/brand-assessment-illustration/);
assert.match(js,/BRAINZ BILTZ/);
console.log('Assessment Hub corporate branding assets verified; EduSpace-only avatars, team crests and subject covers absent.');
