'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recentDiagnostics, statusSnapshot, durationText, formatStatus } = require('../src/hermes/status');

const now = Date.parse('2026-07-31T12:00:00.000Z');
const snapshot = statusSnapshot({
  version: '8.9.0',
  pid: 123,
  status: 'running',
  updatedAt: '2026-07-31T11:59:30.000Z',
  attempt: 2,
  restartCount: 1,
  state: {
    phase: 'card',
    message: '等待培训卡',
    publicEarned: 5,
    otherEarned: 14,
    publicProjected: 5,
    otherProjected: 20,
    blockedApplications: ['a', 'b'],
    blockedApplicationRetryAt: now + 120000
  }
}, { now, alive: true, diagnostics: [{ name: 'one.json' }] });
assert.equal(snapshot.alive, true);
assert.equal(snapshot.totalEarned, 19);
assert.equal(snapshot.totalProjected, 25);
assert.equal(snapshot.pendingApplications, 2);
assert.equal(snapshot.nextCardRetryInMs, 120000);
assert.equal(snapshot.ageMs, 30000);
assert.equal(durationText(120000), '2分钟');
assert.match(formatStatus(snapshot), /其他 14\/20/);
assert.match(formatStatus(snapshot), /待申请：2/);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-status-'));
try {
  fs.writeFileSync(path.join(directory, 'one.json'), '{}');
  fs.writeFileSync(path.join(directory, 'two.json'), '{}');
  fs.writeFileSync(path.join(directory, 'ignore.txt'), 'x');
  assert.equal(recentDiagnostics(directory, 1).length, 1);
  assert.equal(recentDiagnostics(path.join(directory, 'missing'), 5).length, 0);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Hermes 状态看板测试通过');
