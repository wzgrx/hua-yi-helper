'use strict';

const fs = require('fs');
const path = require('path');

function processAlive(pid) {
  if (!Number(pid)) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (_) {
    return false;
  }
}

function recentDiagnostics(directory, limit) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const file = path.join(directory, name);
      return { name, file, updatedAt: fs.statSync(file).mtime.toISOString() };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.max(0, Number(limit) || 5));
}

function statusSnapshot(status, options) {
  const source = status || {};
  const state = source.state || {};
  const settings = options || {};
  const now = Number(settings.now || Date.now());
  const retryAt = Number(state.blockedApplicationRetryAt || 0);
  const publicEarned = Number(state.publicEarned || 0);
  const otherEarned = Number(state.otherEarned || 0);
  const publicProjected = Number(state.publicProjected || publicEarned);
  const otherProjected = Number(state.otherProjected || otherEarned);
  return {
    version: source.version || settings.version || '',
    pid: Number(source.pid || 0),
    alive: settings.alive !== undefined ? Boolean(settings.alive) : processAlive(source.pid),
    status: source.status || 'unknown',
    updatedAt: source.updatedAt || '',
    ageMs: source.updatedAt ? Math.max(0, now - new Date(source.updatedAt).getTime()) : null,
    attempt: Number(source.attempt || 0),
    restartCount: Number(source.restartCount || 0),
    phase: state.phase || '',
    message: state.message || source.message || '',
    currentCourseName: state.currentCourseName || '',
    publicEarned,
    otherEarned,
    totalEarned: publicEarned + otherEarned,
    publicProjected,
    otherProjected,
    totalProjected: publicProjected + otherProjected,
    pendingApplications: Array.isArray(state.blockedApplications) ? state.blockedApplications.length : 0,
    nextCardRetryAt: retryAt ? new Date(retryAt).toISOString() : '',
    nextCardRetryInMs: retryAt ? Math.max(0, retryAt - now) : null,
    diagnostics: settings.diagnostics || []
  };
}

function durationText(value) {
  if (value === null || value === undefined) return '-';
  const seconds = Math.max(0, Math.ceil(Number(value) / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
}

function formatStatus(snapshot) {
  const view = snapshot || {};
  return [
    `Hermes ${view.version || '-'} | ${view.status} | PID ${view.pid || '-'} (${view.alive ? '运行中' : '已停止'})`,
    `更新：${view.updatedAt || '-'}（${durationText(view.ageMs)}前） | 阶段：${view.phase || '-'}`,
    `学分：公需 ${view.publicEarned}/${view.publicProjected}，其他 ${view.otherEarned}/${view.otherProjected}，合计 ${view.totalEarned}/${view.totalProjected}`,
    `待申请：${view.pendingApplications} | 下次培训卡复查：${view.nextCardRetryAt || '-'}（${durationText(view.nextCardRetryInMs)}）`,
    `当前：${view.currentCourseName || '-'} | ${view.message || '-'}`,
    `诊断现场：${Array.isArray(view.diagnostics) ? view.diagnostics.length : 0}`
  ].join('\n');
}

module.exports = {
  processAlive,
  recentDiagnostics,
  statusSnapshot,
  durationText,
  formatStatus
};
