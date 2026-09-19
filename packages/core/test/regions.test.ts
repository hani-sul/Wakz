import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRegions, isArabRegion, isSaudiRegion, regionRank, sortRegions } from '../src/regions.ts';

test('Saudi Arabia ranks first and the rest of the Arab world next', () => {
  assert.equal(regionRank('Saudi Arabia'), 0);
  assert.equal(regionRank('Riyadh'), 0);
  assert.equal(regionRank('UAE'), 1);
  assert.equal(regionRank('Bahrain'), 1);
  assert.equal(regionRank('Egypt'), 1);
  assert.equal(regionRank('Ireland'), 2);
  assert.equal(regionRank('N. Virginia'), 2);
  assert.equal(regionRank('Global'), 3);
});

test('regions sort Saudi first, then Arab countries, then the rest', () => {
  const sorted = sortRegions(
    ['Ireland', 'UAE', 'N. Virginia', 'Saudi Arabia', 'Bahrain', 'Japan'],
    (value) => value,
  );
  assert.deepEqual(sorted.slice(0, 4), ['Saudi Arabia', 'Bahrain', 'UAE', 'Ireland']);
  assert.deepEqual(sorted.slice(4), ['Japan', 'N. Virginia']);
});

test('helpers recognise Saudi and Arab values in both languages', () => {
  assert.ok(isSaudiRegion('me-central-1'));
  assert.ok(isSaudiRegion('السعودية'));
  assert.ok(isArabRegion('Dubai'));
  assert.ok(isArabRegion('مصر'));
  assert.equal(isSaudiRegion('Frankfurt'), false);
  assert.ok(compareRegions('Saudi Arabia', 'UAE') < 0);
});
