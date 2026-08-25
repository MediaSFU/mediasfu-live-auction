import test from 'node:test';
import assert from 'node:assert/strict';
import { localValidationMediaRequested } from '../src/validationMedia.js';

test('synthetic camera requires localhost and an explicit request', () => {
  const original = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: { hostname: '127.0.0.1', search: '' }, configurable: true });
  assert.equal(localValidationMediaRequested('?fakeMedia=camera'), true);
  assert.equal(localValidationMediaRequested(''), false);
  Object.defineProperty(globalThis, 'location', { value: { hostname: 'example.com', search: '' }, configurable: true });
  assert.equal(localValidationMediaRequested('?fakeMedia=camera'), false);
  Object.defineProperty(globalThis, 'location', { value: original, configurable: true });
});
