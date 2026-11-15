import assert from 'node:assert/strict';import {resolveSlot} from '../dist/media-slots.js';
assert.deepEqual(resolveSlot('t','walker.json'),{kind:'lottie',name:'t',src:'assets/media/walker.json'});
assert.equal(resolveSlot('t','a.PNG').kind,'image');assert.equal(resolveSlot('t','a.svg').kind,'image');
for(const bad of [undefined,null,'','x.exe','../secret.json','/etc/passwd','http://evil/x.json','a\\b.json',42])assert.equal(resolveSlot('t',bad).kind,'placeholder','rejects '+bad);
console.log('Media slots: lottie/image/placeholder resolution and path safety passed.');
