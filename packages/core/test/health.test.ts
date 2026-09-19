import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHealth, availabilityFromHistory, latencySummary } from '../src/health.ts';
import type { CheckResult } from '../src/types.ts';

const thresholds = {
  degradedAfterFailures: 2,
  downAfterFailures: 4,
  majorOutageLatencyMs: 2500,
  degradedLatencyMs: 900,
};

function check(kind: CheckResult['kind'], ok: boolean, latencyMs: number | null, at = new Date().toISOString(), error: string | null = null): CheckResult {
  return { kind, target: `${kind}-target`, ok, latencyMs, statusCode: ok ? 200 : 0, error, region: 'local', checkedAt: at, detail: null };
}

test('a single failed request is never an outage', () => {
  const now = new Date('2026-09-19T10:00:00Z').toISOString();
  const assessment = assessHealth([
    check('https', false, null, now, 'timeout'),
    check('dns', true, 12, now),
    check('tcp', true, 30, now),
  ], thresholds, 'OPERATIONAL');

  assert.equal(assessment.status, 'OPERATIONAL');
  assert.ok(assessment.reasons.some((reason) => reason.includes('single failed check')));
});

test('repeated failures escalate to DEGRADED and then MAJOR_OUTAGE', () => {
  const base = Date.parse('2026-09-19T10:00:00Z');
  const degraded = assessHealth([
    check('https', false, null, new Date(base).toISOString(), 'e'),
    check('dns', false, null, new Date(base + 1000).toISOString(), 'e'),
  ], thresholds, 'OPERATIONAL');
  assert.equal(degraded.status, 'DEGRADED');

  const outage = assessHealth([
    check('https', false, null, new Date(base).toISOString(), 'e'),
    check('https', false, null, new Date(base + 1000).toISOString(), 'e'),
    check('dns', false, null, new Date(base + 2000).toISOString(), 'e'),
    check('tcp', false, null, new Date(base + 3000).toISOString(), 'e'),
  ], thresholds, 'OPERATIONAL');
  assert.equal(outage.status, 'MAJOR_OUTAGE');
  assert.ok(outage.consecutiveFailures >= 4);
});

test('latency above the threshold degrades the status without any failure', () => {
  const assessment = assessHealth([check('https', true, 1200), check('dns', true, 20)], thresholds, 'OPERATIONAL');
  assert.equal(assessment.status, 'DEGRADED');
  assert.ok(assessment.reasons.some((reason) => reason.includes('latency')));
});

test('unknown stays unknown when nothing was checked', () => {
  const assessment = assessHealth([], thresholds, 'UNKNOWN');
  assert.equal(assessment.status, 'UNKNOWN');
  assert.equal(assessment.checksRun, 0);
});

test('latency summary averages per check kind and keeps them separate', () => {
  const summary = latencySummary([check('https', true, 100), check('https', true, 200), check('dns', true, 20)]);
  assert.equal(summary.https, 150);
  assert.equal(summary.dns, 20);
  assert.equal(summary.tcp, null);
});

test('availability uses operational samples only', () => {
  const availability = availabilityFromHistory([
    { status: 'OPERATIONAL' },
    { status: 'OPERATIONAL' },
    { status: 'DEGRADED' },
    { status: 'MAJOR_OUTAGE' },
  ]);
  assert.equal(availability, 50);
});
