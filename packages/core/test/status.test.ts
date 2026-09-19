import assert from 'node:assert/strict';
import test from 'node:test';
import { mapStatusIoCode, mapStatuspageIndicator, mapStatusText, severityOf, statusRank, worstStatus } from '../src/status.ts';

test('statuspage indicators map onto the unified set', () => {
  assert.equal(mapStatuspageIndicator('none', 'All Systems Operational'), 'OPERATIONAL');
  assert.equal(mapStatuspageIndicator('minor'), 'DEGRADED');
  assert.equal(mapStatuspageIndicator('major'), 'PARTIAL_OUTAGE');
  assert.equal(mapStatuspageIndicator('critical'), 'MAJOR_OUTAGE');
  assert.equal(mapStatuspageIndicator('maintenance'), 'MAINTENANCE');
});

test('status.io codes map onto the unified set', () => {
  assert.equal(mapStatusIoCode(100, 'Operational'), 'OPERATIONAL');
  assert.equal(mapStatusIoCode(200), 'MAINTENANCE');
  assert.equal(mapStatusIoCode(300), 'DEGRADED');
  assert.equal(mapStatusIoCode(400), 'PARTIAL_OUTAGE');
  assert.equal(mapStatusIoCode(500), 'MAJOR_OUTAGE');
  assert.equal(mapStatusIoCode(null, 'Partial Service Outage'), 'PARTIAL_OUTAGE');
});

test('unknown input maps to UNKNOWN and is never upgraded', () => {
  assert.equal(mapStatusText(null), 'UNKNOWN');
  assert.equal(mapStatusText('whatever this is'), 'UNKNOWN');
  assert.equal(mapStatusText(''), 'UNKNOWN');
  assert.equal(severityOf('UNKNOWN'), 'unknown');
});

test('worstStatus ranks outages above operational and unknown above everything', () => {
  assert.equal(worstStatus(['OPERATIONAL', 'DEGRADED']), 'DEGRADED');
  assert.equal(worstStatus(['DEGRADED', 'MAJOR_OUTAGE']), 'MAJOR_OUTAGE');
  assert.equal(worstStatus(['MAJOR_OUTAGE', 'UNKNOWN']), 'UNKNOWN');
  assert.equal(worstStatus([]), 'UNKNOWN');
  assert.ok(statusRank('MAJOR_OUTAGE') > statusRank('DEGRADED'));
});

test('free-text provider statuses are normalised', () => {
  assert.equal(mapStatusText('Degraded Performance'), 'DEGRADED');
  assert.equal(mapStatusText('Partial Service Outage'), 'PARTIAL_OUTAGE');
  assert.equal(mapStatusText('Under Maintenance'), 'MAINTENANCE');
  assert.equal(mapStatusText('Investigating'), 'DEGRADED');
  assert.equal(mapStatusText('Resolved'), 'OPERATIONAL');
});
