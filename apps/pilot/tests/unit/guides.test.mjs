import assert from 'node:assert/strict';
import test from 'node:test';
import { filterGuides,guideCard,safeImage } from '../../src/lib/guides.ts';

test('guide images reject executable URLs and preserve approved image metadata',()=>{
  assert.equal(safeImage('javascript:alert(1)'),undefined);
  assert.equal(safeImage('//other.test/image.jpg'),undefined);
  assert.equal(safeImage('https://user:password@example.test/a.jpg'),undefined);
  assert.equal(safeImage('/images/tripc-coast.webp'),'/images/tripc-coast.webp');
  assert.equal(guideCard({slug:'a',title:'A',body:'Test',published_at:'2026-11-11',meta:{og_image:'https://example.test/a.jpg'}}).image,'https://example.test/a.jpg');
});

test('guide search supports Vietnamese accents and combines every word with a category',()=>{
  const posts=[guideCard({slug:'nha-o',title:'Thuê nhà tại Đà Nẵng',body:'A guide.',meta:{description:'Căn hộ gần biển'},published_at:'2026-11-01T00:00:00Z'}),
    guideCard({slug:'coworking',title:'Coworking in Da Nang',body:'A guide.',meta:{description:'Places to work'},published_at:'2026-11-01T00:00:00Z'})];
  assert.deepEqual(filterGuides(posts,'da nang bien','housing').map(p=>p.slug),['nha-o']);
  assert.deepEqual(filterGuides(posts,'bien','work'),[]);
  assert.equal(filterGuides(posts,'','all').length,2);
});
