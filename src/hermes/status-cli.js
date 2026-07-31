#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, numberSetting } = require('./config');
const { recentDiagnostics, statusSnapshot, formatStatus } = require('./status');
const packageVersion = require('../../package.json').version;

function usage() {
  return `华医网学习助手状态看板 v${packageVersion}

用法：
  huayi-status [--data-dir PATH] [--json true] [--watch-seconds N]

选项：
  --data-dir PATH          Hermes 数据目录（默认 .huayi-hermes）
  --status-file PATH       自定义 status.json 路径
  --diagnostics-dir PATH   自定义异常现场目录
  --json BOOL              输出机器可读 JSON
  --watch-seconds N        持续刷新间隔；0 表示只读取一次
  -h, --help               显示帮助
  -v, --version            显示版本`;
}

async function main(argv) {
  const cliArgs = argv || process.argv.slice(2);
  if (cliArgs.includes('-h') || cliArgs.includes('--help')) {
    console.log(usage());
    return;
  }
  if (cliArgs.includes('-v') || cliArgs.includes('--version')) {
    console.log(packageVersion);
    return;
  }
  const args = parseArgs(cliArgs);
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

if (require.main === module) {
  main().catch(error => {
    console.error('[Hermes Status]', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, usage };
