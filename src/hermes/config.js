'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const packageVersion = require('../../package.json').version;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function settingValue(primary, secondary, fallback) {
  if (primary !== undefined && primary !== null && primary !== '') return primary;
  if (secondary !== undefined && secondary !== null && secondary !== '') return secondary;
  return fallback;
}

function numberSetting(value, fallback, options) {
  const settings = options || {};
  const parsed = Number(settingValue(value, undefined, fallback));
  const label = settings.name || '数值配置';
  if (!Number.isFinite(parsed)) throw new Error(`${label} 必须是有效数字`);
  if (settings.integer && !Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
  if (settings.min !== undefined && parsed < settings.min) {
    throw new Error(`${label} 不得小于 ${settings.min}`);
  }
  if (settings.max !== undefined && parsed > settings.max) {
    throw new Error(`${label} 不得大于 ${settings.max}`);
  }
  return parsed;
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
  const year = numberSetting(settingValue(args.year, env.HUAYI_YEAR), new Date().getFullYear(), {
    name: '年度', integer: true, min: 2000, max: 2100
  });
  const publicTarget = numberSetting(settingValue(args['public-target'], env.HUAYI_PUBLIC_TARGET), 5, {
    name: '公需学分目标', min: 0, max: 100
  });
  const otherTarget = numberSetting(settingValue(args['other-target'], env.HUAYI_OTHER_TARGET), 20, {
    name: '其他学分目标', min: 0, max: 100
  });
  const cardRetryMinutes = numberSetting(
    settingValue(args['card-retry-minutes'], env.HUAYI_CARD_RETRY_MINUTES), 5,
    { name: '培训卡复查分钟数', min: 1, max: 24 * 60 }
  );
  const workspace = path.resolve(settingValue(
    args['data-dir'], env.HUAYI_DATA_DIR, path.join(process.cwd(), '.huayi-hermes')
  ));
  const browserUrl = String(settingValue(args['browser-url'], env.HUAYI_BROWSER_URL, ''));
  const supervise = parseBoolean(
    args.supervise !== undefined ? args.supervise : env.HUAYI_SUPERVISE,
    false
  );
  const eventLogMaxBytes = numberSetting(
    settingValue(args['event-log-max-bytes'], env.HUAYI_EVENT_LOG_MAX_BYTES), 10 * 1024 * 1024,
    { name: '事件日志字节上限', integer: true, min: 64 * 1024 }
  );
  const eventLogBackups = numberSetting(
    settingValue(args['event-log-backups'], env.HUAYI_EVENT_LOG_BACKUPS), 3,
    { name: '事件日志备份数', integer: true, min: 0, max: 20 }
  );
  const diagnosticLimit = numberSetting(
    settingValue(args['diagnostic-limit'], env.HUAYI_DIAGNOSTIC_LIMIT), 20,
    { name: '诊断现场保留数', integer: true, min: 1, max: 200 }
  );
  return {
    version: packageVersion,
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
    captchaMaxAttempts: numberSetting(
      settingValue(args['captcha-max-attempts'], env.HUAYI_CAPTCHA_MAX_ATTEMPTS), 6,
      { name: '验证码最大尝试次数', integer: true, min: 1, max: 100 }
    ),
    captchaExpectedLength: numberSetting(
      settingValue(args['captcha-length'], env.HUAYI_CAPTCHA_LENGTH), 5,
      { name: '验证码长度', integer: true, min: 1, max: 12 }
    ),
    captchaPort: numberSetting(settingValue(args['captcha-port'], env.HUAYI_CAPTCHA_PORT), 17891, {
      name: '验证码服务端口', integer: true, min: 0, max: 65535
    }),
    captchaProviderUrl: String(
      args['captcha-provider-url'] || env.HUAYI_CAPTCHA_PROVIDER_URL || ''
    ),
    headless: parseBoolean(args.headless !== undefined ? args.headless : env.HUAYI_HEADLESS, false),
    maxRuntimeMs: numberSetting(
      settingValue(args['max-runtime-ms'], env.HUAYI_MAX_RUNTIME_MS), 8 * 60 * 60 * 1000,
      { name: '单轮运行毫秒数', integer: true, min: 1000 }
    ),
    captchaTimeoutMs: numberSetting(
      settingValue(args['captcha-timeout-ms'], env.HUAYI_CAPTCHA_TIMEOUT_MS), 10 * 60 * 1000,
      { name: '验证码等待毫秒数', integer: true, min: 1000 }
    ),
    once: parseBoolean(args.once !== undefined ? args.once : env.HUAYI_ONCE, false),
    supervise,
    restartLimit: numberSetting(settingValue(args['restart-limit'], env.HUAYI_RESTART_LIMIT), 20, {
      name: '重启上限', integer: true, min: 0, max: 1000
    }),
    restartDelayMs: numberSetting(
      settingValue(args['restart-delay-ms'], env.HUAYI_RESTART_DELAY_MS), 60 * 1000,
      { name: '重启等待毫秒数', integer: true, min: 0 }
    ),
    statusFile: path.resolve(args['status-file'] || env.HUAYI_STATUS_FILE || path.join(workspace, 'status.json')),
    eventLogFile: path.resolve(args['event-log-file'] || env.HUAYI_EVENT_LOG_FILE || path.join(workspace, 'events.ndjson')),
    eventLogMaxBytes,
    eventLogBackups,
    diagnosticsEnabled: parseBoolean(
      args.diagnostics !== undefined ? args.diagnostics : env.HUAYI_DIAGNOSTICS,
      true
    ),
    diagnosticsDir: path.resolve(settingValue(
      args['diagnostics-dir'], env.HUAYI_DIAGNOSTICS_DIR, path.join(workspace, 'diagnostics')
    )),
    diagnosticLimit,
    lockFile: path.resolve(args['lock-file'] || env.HUAYI_LOCK_FILE || path.join(workspace, 'supervisor.lock')),
    keepAwake: parseBoolean(
      args['keep-awake'] !== undefined ? args['keep-awake'] : env.HUAYI_KEEP_AWAKE,
      supervise
    ),
    policy: { year, publicTarget, otherTarget, cardRetryMinutes }
  };
}

function publicConfig(config) {
  return {
    version: config.version,
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
    supervise: config.supervise,
    restartLimit: config.restartLimit,
    restartDelayMs: config.restartDelayMs,
    statusFile: config.statusFile,
    eventLogFile: config.eventLogFile,
    eventLogMaxBytes: config.eventLogMaxBytes,
    eventLogBackups: config.eventLogBackups,
    diagnosticsEnabled: config.diagnosticsEnabled,
    diagnosticsDir: config.diagnosticsDir,
    diagnosticLimit: config.diagnosticLimit,
    lockFile: config.lockFile,
    keepAwake: config.keepAwake,
    policy: config.policy,
    usernameConfigured: Boolean(config.username),
    passwordConfigured: Boolean(config.password)
  };
}

module.exports = {
  parseBoolean,
  settingValue,
  numberSetting,
  parseArgs,
  browserCandidates,
  resolveBrowser,
  loadConfig,
  publicConfig
};
