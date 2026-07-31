#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const START_OPTIONS = [
  'year',
  'public-target',
  'other-target',
  'card-retry-minutes',
  'browser',
  'browser-url',
  'url',
  'headless',
  'captcha-auto',
  'captcha-max-attempts',
  'captcha-length',
  'captcha-port',
  'captcha-provider-url',
  'max-runtime-ms',
  'captcha-timeout-ms',
  'once',
  'restart-limit',
  'restart-delay-ms',
  'event-log-max-bytes',
  'event-log-backups',
  'diagnostics',
  'diagnostics-dir',
  'diagnostic-limit',
  'keep-awake'
];

function parseArgs(argv) {
  const values = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      values._.push(item);
      continue;
    }
    const split = item.indexOf('=');
    const name = item.slice(2, split > 0 ? split : undefined);
    const value = split > 0 ? item.slice(split + 1) :
      (argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true);
    values[name] = value;
  }
  return values;
}

function usage() {
  return `HuaYi Helper OpenClaw bridge

Usage:
  bridge.js check  [--repo PATH] [--data-dir PATH]
  bridge.js status [--repo PATH] [--data-dir PATH]
  bridge.js start  [--repo PATH] [--data-dir PATH] [Hermes options]
  bridge.js stop   [--repo PATH] [--data-dir PATH]
  bridge.js help`;
}

function resolveRepo(args, environment) {
  const env = environment || process.env;
  const configured = args.repo || env.HUAYI_REPO;
  const pathFile = path.join(__dirname, '..', 'repo-path.txt');
  const candidate = configured || (fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : '');
  if (!candidate) throw new Error('HUAYI_REPO/repo-path.txt 未配置');
  const repo = path.resolve(candidate);
  const packageFile = path.join(repo, 'package.json');
  const cliFile = path.join(repo, 'src', 'hermes', 'cli.js');
  if (!fs.existsSync(packageFile) || !fs.existsSync(cliFile)) {
    throw new Error(`HuaYi Helper 仓库路径无效：${repo}`);
  }
  return repo;
}

function resolveDataDir(repo, args, environment) {
  const env = environment || process.env;
  return path.resolve(String(args['data-dir'] || env.HUAYI_DATA_DIR || path.join(repo, '.huayi-hermes')));
}

function processExists(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function runtimeState(repo, dataDir) {
  const statusFile = path.join(dataDir, 'status.json');
  const diagnosticsDir = path.join(dataDir, 'diagnostics');
  const status = readJson(statusFile);
  if (!status) return null;
  const { recentDiagnostics, statusSnapshot } = require(path.join(repo, 'src', 'hermes', 'status.js'));
  return statusSnapshot(status, { diagnostics: recentDiagnostics(diagnosticsDir, 5) });
}

function selectedBrowser(repo, args, environment) {
  const env = environment || process.env;
  const browserUrl = String(args['browser-url'] || env.HUAYI_BROWSER_URL || '');
  if (browserUrl) return { mode: 'devtools', value: browserUrl };
  const explicit = String(args.browser || env.HUAYI_BROWSER || '');
  if (explicit) return { mode: 'executable', value: explicit, exists: fs.existsSync(explicit) };
  const { browserCandidates } = require(path.join(repo, 'src', 'hermes', 'config.js'));
  const detected = browserCandidates(env, process.platform, os.release()).find(file => fs.existsSync(file));
  return { mode: 'executable', value: detected || '', exists: Boolean(detected) };
}

function lockState(dataDir) {
  const lockFile = path.join(dataDir, 'supervisor.lock');
  const lock = readJson(lockFile);
  const pid = lock && Number(lock.pid);
  return {
    file: lockFile,
    present: Boolean(lock),
    pid: Number.isInteger(pid) ? pid : null,
    alive: processExists(pid),
    startedAt: lock && lock.startedAt || null
  };
}

function preflight(repo, dataDir, args, environment) {
  const env = environment || process.env;
  const pkg = readJson(path.join(repo, 'package.json')) || {};
  const lock = lockState(dataDir);
  const status = runtimeState(repo, dataDir);
  return {
    ok: true,
    integration: 'openclaw-hermes',
    version: pkg.version || null,
    node: process.version,
    repo,
    dataDir,
    dependenciesInstalled: fs.existsSync(path.join(repo, 'node_modules', 'puppeteer-core')),
    browser: selectedBrowser(repo, args, env),
    credentials: {
      usernameConfigured: Boolean(env.HUAYI_USERNAME),
      passwordConfigured: Boolean(env.HUAYI_PASSWORD)
    },
    lock,
    status
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function startArguments(args, dataDir) {
  const result = ['--data-dir', dataDir, '--supervise', 'true'];
  START_OPTIONS.forEach(name => {
    if (args[name] === undefined) return;
    result.push(`--${name}`, String(args[name]));
  });
  return result;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function start(repo, dataDir, args) {
  fs.mkdirSync(dataDir, { recursive: true });
  const lock = lockState(dataDir);
  if (lock.alive) {
    return { ok: true, status: 'already_running', pid: lock.pid, dataDir, runtime: runtimeState(repo, dataDir) };
  }
  if (lock.present) fs.rmSync(lock.file, { force: true });
  const stdoutFile = path.join(dataDir, 'openclaw-hermes.stdout.log');
  const stderrFile = path.join(dataDir, 'openclaw-hermes.stderr.log');
  const stdout = fs.openSync(stdoutFile, 'a');
  const stderr = fs.openSync(stderrFile, 'a');
  let child;
  try {
    child = childProcess.spawn(
      process.execPath,
      [path.join(repo, 'src', 'hermes', 'cli.js'), ...startArguments(args, dataDir)],
      {
        cwd: repo,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', stdout, stderr],
        env: process.env
      }
    );
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  child.unref();
  for (let attempt = 0; attempt < 50; attempt++) {
    await delay(100);
    const current = lockState(dataDir);
    if (current.alive) {
      return {
        ok: true,
        status: 'started',
        pid: current.pid,
        dataDir,
        stdoutFile,
        stderrFile,
        runtime: runtimeState(repo, dataDir)
      };
    }
    if (!processExists(child.pid)) break;
  }
  const stderrTail = fs.existsSync(stderrFile) ?
    fs.readFileSync(stderrFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-5) : [];
  throw new Error(`Hermes 启动后未取得监督锁；stderr: ${stderrTail.join(' | ') || 'empty'}`);
}

async function stop(dataDir) {
  const lock = lockState(dataDir);
  if (!lock.alive) {
    if (lock.present) fs.rmSync(lock.file, { force: true });
    return { ok: true, status: 'not_running', pid: lock.pid, dataDir };
  }
  if (process.platform === 'win32') {
    childProcess.spawnSync('taskkill', ['/PID', String(lock.pid), '/T'], {
      encoding: 'utf8', windowsHide: true
    });
  } else {
    process.kill(lock.pid, 'SIGTERM');
  }
  for (let attempt = 0; attempt < 50 && processExists(lock.pid); attempt++) await delay(100);
  if (processExists(lock.pid) && process.platform === 'win32') {
    childProcess.spawnSync('taskkill', ['/PID', String(lock.pid), '/T', '/F'], {
      encoding: 'utf8', windowsHide: true
    });
  }
  return { ok: true, status: processExists(lock.pid) ? 'stop_pending' : 'stopped', pid: lock.pid, dataDir };
}

async function main(argv) {
  const cliArgs = argv || process.argv.slice(2);
  const args = parseArgs(cliArgs);
  const command = String(args._[0] || 'help').toLowerCase();
  if (command === 'help' || args.help === true) {
    console.log(usage());
    return;
  }
  const repo = resolveRepo(args);
  const dataDir = resolveDataDir(repo, args);
  if (command === 'check') {
    print(preflight(repo, dataDir, args));
    return;
  }
  if (command === 'status') {
    const status = runtimeState(repo, dataDir);
    if (!status) throw new Error(`状态文件不存在：${path.join(dataDir, 'status.json')}`);
    print(status);
    return;
  }
  if (command === 'start') {
    print(await start(repo, dataDir, args));
    return;
  }
  if (command === 'stop') {
    print(await stop(dataDir));
    return;
  }
  throw new Error(`未知命令：${command}`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`[OpenClaw Bridge] ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  START_OPTIONS,
  parseArgs,
  usage,
  resolveRepo,
  resolveDataDir,
  processExists,
  runtimeState,
  selectedBrowser,
  lockState,
  preflight,
  startArguments,
  start,
  stop,
  main
};

