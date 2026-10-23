import test from 'node:test';
import assert from 'node:assert/strict';
import { nextReleaseVersion } from '../tools/release/next-version.mjs';

const october = new Date('2026-10-23T23:30:00Z');
test('the third number counts releases within the same UTC month, not calendar day', () => {
  assert.equal(nextReleaseVersion({ currentVersion: '2026.10.12', now: october }), '2026.10.13');
});
test('a new UTC month resets the update count to one', () => {
  assert.equal(nextReleaseVersion({ currentVersion: '2026.10.12', now: new Date('2026-11-01T00:00:00Z') }), '2026.11.1');
});
test('npm versions and repository tags prevent reuse of an existing release number', () => {
  assert.equal(nextReleaseVersion({
    currentVersion: '2026.10.12', tags: ['v2026.10.15', 'v2026.9.8'],
    publishedVersions: ['2026.10.14', '2026.10.16'], now: october
  }), '2026.10.17');
});
test('older months do not change the count for the current month', () => {
  assert.equal(nextReleaseVersion({
    currentVersion: '2026.9.8', tags: ['v2026.9.9'], publishedVersions: ['2026.9.10'], now: october
  }), '2026.10.1');
});
test('reject unsupported manifests and future-month versions', () => {
  assert.throws(() => nextReleaseVersion({ currentVersion: '2026.10.0', now: october }), /YYYY/);
  assert.throws(() => nextReleaseVersion({
    currentVersion: '2026.10.12', publishedVersions: ['2026.11.1'], now: october
  }), /future-month/);
});
