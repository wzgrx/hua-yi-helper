'use strict';

const assert = require('assert');
const path = require('path');
const {
  parseArgs,
  browserCandidates,
  resolveBrowser,
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
  policy: { year: 2025, publicTarget: 5, otherTarget: 20 },
  username: 'secret-user',
  password: 'secret-pass'
});
assert.equal(publicView.username, undefined);
assert.equal(publicView.password, undefined);
assert.equal(publicView.usernameConfigured, true);
assert.equal(publicView.passwordConfigured, true);

console.log('Hermes Win11/WSL 配置测试通过');
