import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../',import.meta.url);
const read = name=>readFileSync(new URL(name,root));
const text = name=>read(name).toString('utf8');
const hash = name=>createHash('sha256').update(read(name)).digest('hex');
const fixtures=JSON.parse(text('EDUSPACE_ASSET_HASHES.json'));
for(const [asset,digest] of Object.entries(fixtures)){
  assert.ok(existsSync(new URL(asset,root)),asset+' missing');
  assert.equal(hash(asset),digest,asset+' does not match EduSpace original');
}
const html=text('index.html'), css=text('eduspace-ui.css'), js=text('app.js');
assert.match(html,/eduspace-ui\.css\?v=50\.6\.3-restored-main-layout/);
assert.match(html,/assets\/icon\.png/);
assert.match(css,/\.app-shell\s*\.sidebar/);
assert.match(css,/\.gb-assessment-preview/);
assert.match(css,/\.biltz-page/);
assert.match(css,/@media\(max-width:380px\)/);
assert.match(css,/\.biltz-entry-card>h1\s*\{animation:none!important/);
assert.match(js,/hubMenuScrim/);
assert.match(js,/BRAINZ BILTZ/);
assert.doesNotMatch(js,/subjectArtwork|assets\/subject-cover|brand-assessment-illustration/);
console.log(`${Object.keys(fixtures).length} genuine brand graphics hashes, shared style loading, app and mobile CBT/Biltz guards: PASS`);
