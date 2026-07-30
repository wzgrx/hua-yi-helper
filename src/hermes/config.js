'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const split = item.indexOf('=');
    const name = item.slice(2, split > 0 ? split : undefined);
    const next = split > 0 ? item.slice(split + 1) :
      (argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true);
    values[name] = next;
  }
  return values;
}

function browserCandidates(environment, platform, release) {
  const env = environment || process.env;
  const kind = platform || process.platform;
  const isWsl = kind === 'linux' && /microsoft|wsl/i.test(release || os.release());
  const candidates = [];
  if (kind === 'win32') {
    [
      env['PROGRAMFILES(X86)'] || env['ProgramFiles(x86)'],
      env.PROGRAMFILES || env.ProgramFiles,
      env.LOCALAPPDATA || env.LocalAppData
    ].filter(Boolean).forEach(base => {
      candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    });
  }
  if (isWsl) {
    candidates.push('/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
    candidates.push('/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe');
    candidates.push('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe');
    candidates.push('/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe');
  }
  if (kind === 'darwin') {
    candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }
  candidates.push('/usr/bin/microsoft-edge');
  candidates.push('/usr/bin/microsoft-edge-stable');
  candidates.push('/usr/bin/google-chrome');
  candidates.push('/usr/bin/google-chrome-stable');
  candidates.push('/usr/bin/chromium');
  candidates.push('/usr/bin/chromium-browser');
  return Array.from(new Set(candidates));
}

function resolveBrowser(explicitPath, options) {
  const exists = options && options.exists || fs.existsSync;
  if (explicitPath) {
    if (!exists(explicitPath)) throw new Error(`浏览器路径不存在：${explicitPath}`);
    return explicitPath;
  }
  const candidates = browserCandidates(
    options && options.environment,
    options && options.platform,
    options && options.release
  );
  const detected = candidates.find(candidate => exists(candidate));
  if (!detected) throw new Error('未检测到 Edge/Chrome；请通过 --browser 或 HUAYI_BROWSER 指定可执行文件');
  return detected;
}

function loadConfig(argv, environment) {
  const args = parseArgs(argv || []);
  const env = environment || process.env;
  const year = Number(args.year || env.HUAYI_YEAR || new Date().getFullYear());
  const publicTarget = Number(args['public-target'] || env.HUAYI_PUBLIC_TARGET || 5);
  const otherTarget = Number(args['other-target'] || env.HUAYI_OTHER_TARGET || 20);
  const workspace = path.resolve(args['data-dir'] || env.HUAYI_DATA_DIR || path.join(process.cwd(), '.huayi-hermes'));
  const browserUrl = String(args['browser-url'] || env.HUAYI_BROWSER_URL || '');
  return {
    browserPath: browserUrl ? '' : resolveBrowser(args.browser || env.HUAYI_BROWSER, { environment: env }),
    browserUrl,
    userDataDir: path.join(workspace, 'browser-profile'),
    stateDir: workspace,
    baseUrl: String(args.url || env.HUAYI_URL || 'https://cme28.91huayi.com/pages/study_info_list.aspx'),
    username: String(args.username || env.HUAYI_USERNAME || ''),
    password: String(args.password || env.HUAYI_PASSWORD || ''),
    captchaCode: String(args.captcha || env.HUAYI_CAPTCHA_CODE || ''),
    captchaAuto: parseBoolean(
      args['captcha-auto'] !== undefined ? args['captcha-auto'] : env.HUAYI_CAPTCHA_AUTO,
      true
    ),
    captchaMaxAttempts: Math.max(1, Number(
      args['captcha-max-attempts'] || env.HUAYI_CAPTCHA_MAX_ATTEMPTS || 6
    )),
    captchaExpectedLength: Math.max(1, Number(
      args['captcha-length'] || env.HUAYI_CAPTCHA_LENGTH || 5
    )),
    captchaPort: Math.max(0, Number(args['captcha-port'] || env.HUAYI_CAPTCHA_PORT || 17891)),
    captchaProviderUrl: String(
      args['captcha-provider-url'] || env.HUAYI_CAPTCHA_PROVIDER_URL || ''
    ),
    headless: parseBoolean(args.headless !== undefined ? args.headless : env.HUAYI_HEADLESS, false),
    maxRuntimeMs: Number(args['max-runtime-ms'] || env.HUAYI_MAX_RUNTIME_MS || 8 * 60 * 60 * 1000),
    captchaTimeoutMs: Number(args['captcha-timeout-ms'] || env.HUAYI_CAPTCHA_TIMEOUT_MS || 10 * 60 * 1000),
    once: parseBoolean(args.once, false),
    policy: { year, publicTarget, otherTarget }
  };
}

function publicConfig(config) {
  return {
    browserPath: config.browserPath,
    browserUrl: config.browserUrl,
    userDataDir: config.userDataDir,
    baseUrl: config.baseUrl,
    headless: config.headless,
    maxRuntimeMs: config.maxRuntimeMs,
    captchaAuto: config.captchaAuto,
    captchaMaxAttempts: config.captchaMaxAttempts,
    captchaExpectedLength: config.captchaExpectedLength,
    captchaProviderConfigured: Boolean(config.captchaProviderUrl),
    policy: config.policy,
    usernameConfigured: Boolean(config.username),
    passwordConfigured: Boolean(config.password)
  };
}

module.exports = {
  parseBoolean,
  parseArgs,
  browserCandidates,
  resolveBrowser,
  loadConfig,
  publicConfig
};
