import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES, SERVICES } from '../../../packages/core/src/index.ts';
import { getRecentEvents, openDatabase, seedCatalog } from '../../../packages/db/src/index.ts';
import { emitIncidentEvent, emitStatusTransition } from '../src/events.ts';

function db() {
  const database = openDatabase(':memory:');
  seedCatalog(database, CATEGORIES, SERVICES, 60);
  return database;
}

test('status transitions produce events only when the status really changes', () => {
  const database = db();
  assert.equal(emitStatusTransition(database, 'github', 'OPERATIONAL', 'OPERATIONAL', 'official'), false);
  assert.equal(emitStatusTransition(database, 'github', null, 'OPERATIONAL', 'official'), false);
  assert.equal(emitStatusTransition(database, 'github', 'OPERATIONAL', 'DEGRADED', 'official'), true);

  const events = getRecentEvents(database, 10);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.from_status, 'OPERATIONAL');
  assert.equal(events[0]?.to_status, 'DEGRADED');
  assert.equal(events[0]?.type, 'status_changed:official');
  database.close();
});

test('connectivity transitions are tracked separately from official transitions', () => {
  const database = db();
  emitStatusTransition(database, 'github', 'OPERATIONAL', 'MAJOR_OUTAGE', 'connectivity');
  const events = getRecentEvents(database, 10);
  assert.equal(events[0]?.type, 'status_changed:connectivity');
  database.close();
});

test('active incidents generate an event and zero incidents do not', () => {
  const database = db();
  emitIncidentEvent(database, 'github', 0);
  assert.equal(getRecentEvents(database, 10).length, 0);
  emitIncidentEvent(database, 'github', 2);
  const events = getRecentEvents(database, 10);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'incidents_active');
  database.close();
});
