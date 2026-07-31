'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  atomicWriteJson,
  appendEvent,
  compactStateForEvent,
  compactEventEnvelope,
  acquireLock,
  buildKeepAwakeScript,
  startKeepAwake,
  restartDelayFor,
  superviseHermes
} = require('../src/hermes/supervisor');
const { closeRuntimeResources } = require('../src/hermes/runner');

(async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-supervisor-'));
  try {
    const statusFile = path.join(workspace, 'status.json');
    const eventLogFile = path.join(workspace, 'events.ndjson');
    const lockFile = path.join(workspace, 'supervisor.lock');
    atomicWriteJson(statusFile, { generation: 1 });
    atomicWriteJson(statusFile, { generation: 2 });
    assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).generation, 2);
    assert.equal(fs.readdirSync(workspace).filter(name => name.endsWith('.tmp')).length, 0);

    const release = acquireLock(lockFile);
    assert.throws(() => acquireLock(lockFile), /已有 Hermes 监督器/);
    release();
    assert.equal(fs.existsSync(lockFile), false);

    const keepAwakeScript = buildKeepAwakeScript();
    assert(keepAwakeScript.includes("$ErrorActionPreference = 'Stop'"));
    assert(keepAwakeScript.includes('SetThreadExecutionState(1)'));
    assert(!keepAwakeScript.includes('80000000'));
    assert(!keepAwakeScript.includes('SetThreadExecutionState(0x80000001)'));
    if (process.platform === 'win32') {
      const awake = startKeepAwake(true);
      const deadline = Date.now() + 15000;
      while (awake.getLastExitCode() === null && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.equal(awake.isRunning(), true);
      assert.equal(awake.getLastExitCode(), 0);
      assert(awake.getPulseCount() >= 1);
      awake.close();
      assert.equal(awake.isRunning(), false);
    }
    assert.equal(restartDelayFor({ restartDelayMs: 60000 }, new Error('页面状态读取超过 10000ms 无响应')), 5000);
    assert.equal(restartDelayFor({ restartDelayMs: 60000 }, new Error('fixture transient error')), 60000);
    assert.equal(restartDelayFor({ restartDelayMs: 1000 }, new Error('Protocol error: Target closed')), 1000);

    const largeState = {
      running: true,
      phase: 'card',
      message: 'fixture',
      blockedApplications: ['a', 'b'],
      cardRetryQueue: ['c'],
      studyRecords: Array.from({ length: 8 }, (_, id) => ({ id, text: 'x'.repeat(1000) })),
      catalogRecords: [{ id: 1 }],
      planTasks: [{ type: 'apply' }, { type: 'study' }],
      logs: ['one', 'two', 'three']
    };
    const compactState = compactStateForEvent(largeState);
    assert.equal(compactState.running, true);
    assert.equal(compactState.studyRecordCount, 8);
    assert.equal(compactState.catalogRecordCount, 1);
    assert.equal(compactState.planTaskCount, 2);
    assert.equal(compactState.blockedApplicationCount, 2);
    assert.deepEqual(compactState.logTail, ['two', 'three']);
    assert.equal(compactState.studyRecords, undefined);
    assert.equal(compactState.planTasks, undefined);
    const compactEnvelope = compactEventEnvelope({ state: largeState, tasks: [{ type: 'apply', name: 'A', url: 'secret' }] });
    assert.equal(compactEnvelope.tasks[0].url, undefined);
    assert(JSON.stringify(compactEnvelope).length < JSON.stringify({ state: largeState }).length / 2);

    const rotatingLog = path.join(workspace, 'rotating.ndjson');
    for (let index = 0; index < 20; index++) {
      appendEvent(rotatingLog, { index, text: 'x'.repeat(80) }, { maxBytes: 300, backups: 2 });
    }
    assert.equal(fs.existsSync(`${rotatingLog}.1`), true);
    assert.equal(fs.existsSync(`${rotatingLog}.2`), true);
    assert.equal(fs.existsSync(`${rotatingLog}.3`), false);
    assert(fs.statSync(rotatingLog).size <= 300);

    let runs = 0;
    let delays = 0;
    const result = await superviseHermes({
      version: 'fixture-version',
      stateDir: workspace,
      statusFile,
      eventLogFile,
      lockFile,
      restartLimit: 3,
      restartDelayMs: 1,
      eventLogMaxBytes: 1024 * 1024,
      eventLogBackups: 2,
      keepAwake: false
    }, { report() {} }, {
      async delay() { delays++; },
      async runHermes(_config, callbacks) {
        runs++;
        callbacks.report({
          type: 'state',
          state: { phase: `run-${runs}`, running: runs < 3, message: `fixture-${runs}` }
        });
        if (runs === 1) return { status: 'attention', state: { phase: 'fixture-attention' } };
        if (runs === 2) throw new Error('fixture transient error');
        return { status: 'done', state: { phase: 'done', publicEarned: 5, otherEarned: 20 } };
      }
    });
    assert.equal(result.status, 'done');
    assert.equal(runs, 3);
    assert.equal(delays, 2);
    assert.equal(fs.existsSync(lockFile), false);
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    assert.equal(status.status, 'done');
    assert.equal(status.version, 'fixture-version');
    assert.equal(status.attempt, 3);
    assert.equal(status.state.otherEarned, 20);
    const events = fs.readFileSync(eventLogFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert(events.some(event => event.type === 'error'));
    assert(events.some(event => event.type === 'restart_wait'));
    assert(events.some(event => event.status === 'done'));
    assert(events.every(event => event.version === 'fixture-version'));

    let disconnected = 0;
    let closed = 0;
    let serviceClosed = 0;
    await closeRuntimeResources({
      disconnect() { disconnected++; }
    }, { async close() { serviceClosed++; } }, true);
    assert.equal(disconnected, 1);
    assert.equal(serviceClosed, 1);
    await closeRuntimeResources({
      process() { return null; },
      async close() { closed++; }
    }, null, false);
    assert.equal(closed, 1);

    console.log('Hermes 长时监督、原子状态、单实例锁与资源回收测试通过');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
