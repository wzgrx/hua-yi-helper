#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, numberSetting } = require('./config');
const { recentDiagnostics, statusSnapshot, formatStatus } = require('./status');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(String(args['data-dir'] || process.env.HUAYI_DATA_DIR || '.huayi-hermes'));
  const statusFile = path.resolve(String(args['status-file'] || path.join(dataDir, 'status.json')));
  const diagnosticsDir = path.resolve(String(args['diagnostics-dir'] || path.join(dataDir, 'diagnostics')));
  const watchSeconds = numberSetting(args['watch-seconds'], 0, {
    name: '状态刷新秒数', integer: true, min: 0, max: 24 * 60 * 60
  });
  const asJson = /^(1|true|yes|on)$/i.test(String(args.json || ''));
  const render = () => {
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    const snapshot = statusSnapshot(status, { diagnostics: recentDiagnostics(diagnosticsDir, 5) });
    if (watchSeconds && process.stdout.isTTY) process.stdout.write('\x1Bc');
    process.stdout.write(`${asJson ? JSON.stringify(snapshot, null, 2) : formatStatus(snapshot)}\n`);
  };
  render();
  if (!watchSeconds) return;
  const timer = setInterval(render, watchSeconds * 1000);
  const stop = () => { clearInterval(timer); process.exitCode = 0; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error('[Hermes Status]', error.message);
  process.exitCode = 1;
});
