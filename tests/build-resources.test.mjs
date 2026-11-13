import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendConcurrency } from '../src/concurrency.js';

test('build concurrency stays within available CPUs and memory headroom', () => {
  const mib = 1024 * 1024;
  assert.equal(recommendConcurrency({ cpuCount: 1, memoryBytes: 1024 * mib }), 1);
  assert.equal(recommendConcurrency({ cpuCount: 8, memoryBytes: 1024 * mib }), 2);
  assert.equal(recommendConcurrency({ cpuCount: 2, memoryBytes: 8 * 1024 * mib }), 2);
  assert.equal(recommendConcurrency({ cpuCount: 64, memoryBytes: 64 * 1024 * mib }), 8);
});

test('build concurrency rejects invalid host resource measurements', () => {
  assert.throws(() => recommendConcurrency({ cpuCount: 0, memoryBytes: 1024 }), /positive numbers/);
  assert.throws(() => recommendConcurrency({ cpuCount: 2, memoryBytes: NaN }), /positive numbers/);
});
