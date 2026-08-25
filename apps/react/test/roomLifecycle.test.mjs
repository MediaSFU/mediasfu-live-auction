import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ROOM_CONNECTION_GRACE_MS, createOneShotCleanup, roomConnectionPresentation } from '../src/roomLifecycle.js';

test('connection presentation leaves securing state after failure, timeout, or a dropped live room', () => {
  assert.equal(roomConnectionPresentation({ ready: false, readinessReason: 'Connecting.', elapsedMs: 10 }).state, 'connecting');
  assert.equal(roomConnectionPresentation({ ready: true }).state, 'live');
  assert.equal(roomConnectionPresentation({ ready: false, failure: 'Room not found.', elapsedMs: 10 }).state, 'unavailable');
  assert.equal(roomConnectionPresentation({ ready: false, wasReady: true, elapsedMs: 10 }).state, 'unavailable');
  assert.equal(roomConnectionPresentation({ ready: false, elapsedMs: ROOM_CONNECTION_GRACE_MS }).state, 'unavailable');
});

test('host lifecycle cleanup is one-shot and swallows a best-effort rejection', async () => {
  let calls = 0;
  const cleanup = createOneShotCleanup(async () => { calls += 1; throw new Error('page is closing'); });
  assert.equal(cleanup.run(), true);
  assert.equal(cleanup.run(), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test('media capture remains user initiated', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /parameters\?\.validated[\s\S]{0,240}toggleMic/);
  assert.match(source, /onClick=\{\(\) => action\(room\.controls\.toggleMic\)\}/);
  assert.match(source, /onClick=\{\(\) => action\(room\.controls\.toggleCamera\)\}/);
});
