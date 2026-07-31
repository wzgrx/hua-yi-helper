'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  browserCandidates,
  resolveBrowser,
  loadConfig,
  publicConfig
} = require('../src/hermes/config');

const args = parseArgs(['--browser=C:\\Edge\\msedge.exe', '--year', '2025', '--headless']);
assert.equal(args.browser, 'C:\\Edge\\msedge.exe');
assert.equal(args.year, '2025');
assert.equal(args.headless, true);

const windows = browserCandidates({
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  PROGRAMFILES: 'C:\\Program Files',
  LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local'
}, 'win32', '');
assert(windows.some(candidate => /Microsoft[\\/]Edge[\\/]Application[\\/]msedge\.exe$/i.test(candidate)));
assert(windows.some(candidate => /Google[\\/]Chrome[\\/]Application[\\/]chrome\.exe$/i.test(candidate)));

const wsl = browserCandidates({}, 'linux', '5.15.0-microsoft-standard-WSL2');
assert(wsl.includes('/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'));

const selected = resolveBrowser('', {
  platform: 'linux',
  release: 'microsoft-standard',
  environment: {},
  exists: candidate => candidate.endsWith('/Microsoft/Edge/Application/msedge.exe')
});
assert.match(selected, /^\/mnt\/c\//);

const publicView = publicConfig({
  browserPath: path.join('C:', 'Edge', 'msedge.exe'),
  userDataDir: 'profile',
  baseUrl: 'https://example.test',
  headless: false,
  maxRuntimeMs: 10,
  captchaAuto: true,
  captchaMaxAttempts: 6,
  captchaExpectedLength: 5,
  captchaProviderUrl: '',
  policy: { year: 2025, publicTarget: 5, otherTarget: 20 },
  username: 'secret-user',
  password: 'secret-pass'
});
assert.equal(publicView.username, undefined);
assert.equal(publicView.password, undefined);
assert.equal(publicView.captchaAuto, true);
assert.equal(publicView.captchaMaxAttempts, 6);
assert.equal(publicView.captchaExpectedLength, 5);
assert.equal(publicView.captchaProviderConfigured, false);
assert.equal(publicView.usernameConfigured, true);
assert.equal(publicView.passwordConfigured, true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-config-'));
const fakeBrowser = path.join(temp, 'browser.exe');
fs.writeFileSync(fakeBrowser, 'fixture');
const supervised = loadConfig([
  '--browser', fakeBrowser,
  '--data-dir', path.join(temp, 'supervised'),
  '--supervise', 'true',
  '--restart-limit', '9',
  '--restart-delay-ms', '1234',
  '--card-retry-minutes', '3',
  '--keep-awake', 'false'
], {});
assert.equal(supervised.supervise, true);
assert.equal(supervised.restartLimit, 9);
assert.equal(supervised.restartDelayMs, 1234);
assert.equal(supervised.keepAwake, false);
assert.equal(supervised.statusFile, path.join(temp, 'supervised', 'status.json'));
assert.equal(supervised.eventLogFile, path.join(temp, 'supervised', 'events.ndjson'));
assert.equal(supervised.lockFile, path.join(temp, 'supervised', 'supervisor.lock'));
assert.equal(supervised.policy.cardRetryMinutes, 3);
const noRestart = loadConfig([
  '--browser', fakeBrowser,
  '--data-dir', path.join(temp, 'no-restart'),
  '--restart-limit', '0',
  '--restart-delay-ms', '0'
], {});
assert.equal(noRestart.restartLimit, 0);
assert.equal(noRestart.restartDelayMs, 0);
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes Win11/WSL 配置测试通过');
