import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../eduspace-ui.css',import.meta.url),'utf8');
assert.doesNotMatch(app,/eduspace-crown\.png|gb-eduspace-link-logo/);
assert.match(app,/btn btn-light" onclick="returnToEduSpace\(\)"/);
assert.match(css,/\.gb-eduspace-link\{[^}]*background:#fff/);
console.log('Assessment Hub link form has no team logo, white result action and white surface.');
