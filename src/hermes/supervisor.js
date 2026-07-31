'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { runHermes, processExists } = require('./runner');

function isoNow() {
  return new Date().toISOString();
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function atomicWriteJson(file, value) {
  ensureParent(file);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    if (!/EEXIST|EPERM/i.test(String(error && error.code))) throw error;
    fs.rmSync(file, { force: true });
    fs.renameSync(temporary, file);
  }
}

const DEFAULT_EVENT_LOG_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_EVENT_LOG_BACKUPS = 3;

function compactStateForEvent(state) {
  if (!state || typeof state !== 'object') return state;
  const result = {};
  [
    'running',
    'paused',
    'phase',
    'message',
    'credit',
    'publicEarned',
    'otherEarned',
    'publicProjected',
    'otherProjected',
    'currentCourseUrl',
    'currentCourseName',
    'currentCwid',
    'lastRoute',
    'lastActionAt',
    'blockedApplicationYear',
    'blockedApplicationRetryAt',
    'catalogYear'
  ].forEach(key => {
    if (state[key] !== undefined) result[key] = state[key];
  });
  [
    ['blockedApplications', 'blockedApplicationCount'],
    ['cardRetryQueue', 'cardRetryQueueCount'],
    ['catalogVisited', 'catalogVisitedCount'],
    ['catalogSourcesVisited', 'catalogSourceCount'],
    ['studyRecords', 'studyRecordCount'],
    ['catalogRecords', 'catalogRecordCount'],
    ['planTasks', 'planTaskCount']
  ].forEach(([source, target]) => {
    if (Array.isArray(state[source])) result[target] = state[source].length;
  });
  if (Array.isArray(state.logs) && state.logs.length) result.logTail = state.logs.slice(-2);
  return result;
}

function compactEventEnvelope(event) {
  const compact = Object.assign({}, event);
  if (event && event.state) compact.state = compactStateForEvent(event.state);
  if (Array.isArray(compact.tasks)) {
    compact.tasks = compact.tasks.map(task => ({
      type: task && task.type,
      name: task && task.name,
      credit: task && task.credit,
      category: task && task.category
    }));
  }
  return compact;
}

function rotateEventLog(file, backups) {
  const count = Math.max(0, Math.floor(Number(backups) || 0));
  if (!fs.existsSync(file)) return;
  if (count === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  for (let index = count; index >= 2; index--) {
    const destination = `${file}.${index}`;
    const source = `${file}.${index - 1}`;
    fs.rmSync(destination, { force: true });
    if (fs.existsSync(source)) fs.renameSync(source, destination);
  }
  fs.rmSync(`${file}.1`, { force: true });
  fs.renameSync(file, `${file}.1`);
}

function appendEvent(file, event, options) {
  ensureParent(file);
  const settings = options || {};
  const configuredMax = Number(settings.maxBytes);
  const maxBytes = Number.isFinite(configuredMax) && configuredMax > 0 ?
    Math.floor(configuredMax) : DEFAULT_EVENT_LOG_MAX_BYTES;
  const configuredBackups = Number(settings.backups);
  const backups = Number.isFinite(configuredBackups) && configuredBackups >= 0 ?
    Math.floor(configuredBackups) : DEFAULT_EVENT_LOG_BACKUPS;
  const line = `${JSON.stringify(event)}\n`;
  let currentBytes = 0;
  try {
    currentBytes = fs.statSync(file).size;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (currentBytes > 0 && currentBytes + Buffer.byteLength(line, 'utf8') > maxBytes) {
    rotateEventLog(file, backups);
  }
  fs.appendFileSync(file, line, 'utf8');
}

function readLock(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function acquireLock(file) {
  ensureParent(file);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = fs.openSync(file, 'wx');
      const value = { pid: process.pid, startedAt: isoNow() };
      fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
      fs.closeSync(descriptor);
      return () => {
        const current = readLock(file);
        if (!current || Number(current.pid) === process.pid) fs.rmSync(file, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = readLock(file);
      if (current && processExists(Number(current.pid))) {
        throw new Error(`已有 Hermes 监督器在运行（PID ${current.pid}）`);
      }
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error('Hermes 监督器锁创建失败');
}

function buildKeepAwakeScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class AwakePulse { [DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e); }'",
    '$result = [AwakePulse]::SetThreadExecutionState(1)',
    "if ($result -eq 0) { throw 'SetThreadExecutionState failed' }"
  ].join('; ');
}

function startKeepAwake(enabled, report) {
  if (!enabled || process.platform !== 'win32') return { close() {} };
  const script = buildKeepAwakeScript();
  let child = null;
  let closed = false;
  let pulseCount = 0;
  let lastExitCode = null;
  const pulse = () => {
    if (closed || child && child.exitCode === null) return;
    const spawned = childProcess.spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { detached: false, stdio: 'ignore', windowsHide: true }
    );
    child = spawned;
    spawned.once('error', error => {
      if (child === spawned) child = null;
      lastExitCode = -1;
      if (report && !closed) report({
        type: 'keep_awake_error',
        message: `系统唤醒刷新启动失败：${error.message}`
      });
    });
    spawned.once('exit', code => {
      lastExitCode = code;
      if (code === 0) {
        pulseCount++;
        return;
      }
      if (report && !closed) report({
        type: 'keep_awake_error',
        message: `系统唤醒刷新异常退出（code ${code}）`
      });
    });
  };
  pulse();
  const timer = setInterval(pulse, 20000);
  if (typeof timer.unref === 'function') timer.unref();
  if (report) report({ type: 'keep_awake', message: '临时保持系统唤醒已启用（每 20 秒刷新）' });
  return {
    isRunning() {
      return !closed;
    },
    getPulseCount() {
      return pulseCount;
    },
    getLastExitCode() {
      return lastExitCode;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      if (!child || !child.pid || child.exitCode !== null) return;
      childProcess.spawnSync(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true }
      );
    }
  };
}

function delay(ms, signal) {
  return new Promise(resolve => {
    if (!ms || signal && signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', done);
      resolve();
    }
    if (signal) signal.addEventListener('abort', done, { once: true });
  });
}

function restartDelayFor(config, error) {
  const configured = Math.max(0, Number(config && config.restartDelayMs || 0));
  const message = String(error && (error.stack || error.message) || error || '');
  if (/页面状态读取超过|页面操作超过|Protocol error|Target closed|Session closed|Navigation timeout/i.test(message)) {
    return Math.min(configured, 5000);
  }
  return configured;
}

async function superviseHermes(config, callbacks, dependencies) {
  const settings = dependencies || {};
  const run = settings.runHermes || runHermes;
  const sleep = settings.delay || delay;
  const report = callbacks && callbacks.report || (() => {});
  fs.mkdirSync(config.stateDir, { recursive: true });
  const releaseLock = acquireLock(config.lockFile);
  let sequence = 0;
  const startedAt = isoNow();
  let lastState = null;
  let attempt = 0;
  let finalStatus = 'starting';
  const publish = (event, extra) => {
    const envelope = Object.assign({
      version: config.version,
      sequence: ++sequence,
      timestamp: isoNow(),
      pid: process.pid,
      attempt,
      type: event.type || 'message',
      message: event.message || '',
      state: event.state || undefined,
      tasks: event.tasks || undefined
    }, extra || {});
    appendEvent(config.eventLogFile, compactEventEnvelope(envelope), {
      maxBytes: config.eventLogMaxBytes,
      backups: config.eventLogBackups
    });
    atomicWriteJson(config.statusFile, {
      version: config.version,
      pid: process.pid,
      startedAt,
      updatedAt: envelope.timestamp,
      status: envelope.status || finalStatus,
      attempt,
      restartCount: Math.max(0, attempt - 1),
      message: envelope.message,
      state: envelope.state || lastState
    });
    report(event);
  };
  let awake = { close() {} };
  try {
    awake = startKeepAwake(config.keepAwake, event => publish(event));
    const maxAttempts = Math.max(1, Number(config.restartLimit || 0) + 1);
    while (attempt < maxAttempts && !(config.signal && config.signal.aborted)) {
      let attemptError = null;
      attempt++;
      finalStatus = attempt === 1 ? 'running' : 'restarting';
      publish({
        type: 'supervisor',
        message: attempt === 1 ?
          `监督运行已启动（最多 ${maxAttempts} 次）` :
          `开始第 ${attempt}/${maxAttempts} 次运行`
      }, { status: finalStatus });
      try {
        const result = await run(config, {
          report(event) {
            if (event && event.state) lastState = event.state;
            publish(event || { type: 'message', message: '' }, { status: 'running' });
          }
        });
        if (result && result.state) lastState = result.state;
        finalStatus = result && result.status || 'unknown';
        publish({
          type: 'run_end',
          message: `第 ${attempt} 次运行结束：${finalStatus}`,
          state: lastState
        }, { status: finalStatus });
        if (finalStatus === 'done' || finalStatus === 'stopped') return result;
      } catch (error) {
        attemptError = error;
        finalStatus = 'error';
        publish({
          type: 'error',
          message: error && error.stack || String(error),
          state: lastState
        }, { status: finalStatus });
      }
      if (attempt < maxAttempts && !(config.signal && config.signal.aborted)) {
        const restartDelayMs = restartDelayFor(config, attemptError);
        finalStatus = 'waiting_restart';
        publish({
          type: 'restart_wait',
          message: `${restartDelayMs}ms 后重启`
        }, { status: finalStatus });
        await sleep(restartDelayMs, config.signal);
      }
    }
    finalStatus = config.signal && config.signal.aborted ? 'stopped' : 'restart_limit';
    const result = { status: finalStatus, state: lastState };
    publish({
      type: 'supervisor_end',
      message: finalStatus === 'stopped' ? '监督运行已停止' : `已达到重启上限 ${config.restartLimit}`,
      state: lastState
    }, { status: finalStatus });
    return result;
  } finally {
    awake.close();
    releaseLock();
  }
}

module.exports = {
  atomicWriteJson,
  appendEvent,
  compactStateForEvent,
  compactEventEnvelope,
  rotateEventLog,
  readLock,
  acquireLock,
  buildKeepAwakeScript,
  startKeepAwake,
  delay,
  restartDelayFor,
  superviseHermes
};
