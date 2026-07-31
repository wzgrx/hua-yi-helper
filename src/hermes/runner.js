'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const puppeteer = require('puppeteer-core');
const Core = require('../shared/core');
const { createLocalRecognizer, solveCaptchaBuffer } = require('./captcha');
const { startCaptchaServer } = require('./captcha-server');

const LOGIN_SELECTORS = {
  more: '#show_type_more',
  passwordMode: '#type_pwd',
  username: '#txt_user_name,input[name="txt_user_name"],input[placeholder*="用户名"]',
  password: '#txt_user_pwd,input[placeholder*="密码"]',
  passwordReal: '#txt_user_pwd_real,input[name="txt_user_pwd"][type="hidden"]',
  captcha: '#txt_img_code,input[name="txt_img_code"],input[placeholder*="图形验证码"]',
  captchaImage: '#yzm_img,img[src*="CheckCode"],img[src*="captcha" i]',
  agreement: '#agree1,input[type="checkbox"][name*="agree" i]',
  submit: '.btn_login,#btn_login,input[type="submit"],button[type="submit"]'
};

function buildLoginPlan(snapshot, credentials) {
  const form = snapshot || {};
  const account = credentials || {};
  return {
    ready: Boolean(form.username && form.password && form.submit),
    fillUsername: Boolean(account.username && form.username),
    fillPassword: Boolean(account.password && form.password),
    syncRealPassword: Boolean(account.password && form.passwordReal),
    acceptAgreement: Boolean(form.agreement && !form.agreementChecked),
    captchaRequired: Boolean(form.captcha && form.captchaImage && !form.captchaValue),
    submit: Boolean(account.username && account.password && form.submit &&
      (!form.captcha || !form.captchaImage || form.captchaValue))
  };
}

function preloadSource(policy, options) {
  const settings = options || {};
  return `(() => {
    const prefix = 'HY_HERMES_';
    const bridgeName = 'HY_HERMES_STATE';
    const bridgeKeys = [
      'running', 'paused', 'phase', 'message',
      'credit', 'publicEarned', 'otherEarned', 'publicProjected', 'otherProjected',
      'currentCourseUrl', 'currentCourseName', 'currentCwid',
      'blockedApplications', 'blockedApplicationYear', 'blockedApplicationRetryAt',
      'catalogYear', 'catalogSourcesVisited', 'lastRoute', 'lastActionAt'
    ];
    const bridgeRead = () => {
      try {
        const part = document.cookie.split('; ').find(item => item.startsWith(bridgeName + '='));
        return part ? JSON.parse(decodeURIComponent(part.slice(bridgeName.length + 1))) : undefined;
      } catch (_) { return undefined; }
    };
    const bridgeWrite = value => {
      try {
        const compact = {};
        bridgeKeys.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(value || {}, key)) compact[key] = value[key];
        });
        const shortText = (input, size) => String(input == null ? '' : input).slice(0, size);
        ['message', 'currentCourseUrl', 'currentCourseName', 'currentCwid', 'lastRoute'].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(compact, key)) compact[key] = shortText(compact[key], 320);
        });
        compact.blockedApplications = Array.isArray(compact.blockedApplications) ?
          compact.blockedApplications.slice(-16).map(item => shortText(item, 320)) : [];
        compact.catalogSourcesVisited = Array.isArray(compact.catalogSourcesVisited) ?
          compact.catalogSourcesVisited.slice(-8).map(item => shortText(item, 160)) : [];
        compact.logs = Array.isArray(value && value.logs) ?
          value.logs.slice(-2).map(item => shortText(item, 240)) : [];
        let payload = encodeURIComponent(JSON.stringify(compact));
        if (payload.length > 3600) {
          compact.logs = [];
          compact.blockedApplications = compact.blockedApplications.slice(-8);
          compact.catalogSourcesVisited = [];
          compact.message = shortText(compact.message, 120);
          payload = encodeURIComponent(JSON.stringify(compact));
        }
        while (payload.length > 3600 && compact.blockedApplications.length > 1) {
          compact.blockedApplications.shift();
          payload = encodeURIComponent(JSON.stringify(compact));
        }
        if (payload.length > 3600) {
          compact.blockedApplications = [];
          compact.message = shortText(compact.message, 80);
          compact.currentCourseName = shortText(compact.currentCourseName, 120);
          compact.currentCourseUrl = shortText(compact.currentCourseUrl, 240);
          payload = encodeURIComponent(JSON.stringify(compact));
        }
        document.cookie = bridgeName + '=' + payload +
          '; Domain=.91huayi.com; Path=/; SameSite=Lax';
      } catch (_) {}
    };
    const read = key => {
      try {
        const raw = localStorage.getItem(prefix + key);
        const local = raw == null ? undefined : JSON.parse(raw);
        if (key !== 'HY8_STATE') return local;
        const bridge = bridgeRead();
        if (!local) return bridge;
        if (!bridge) return local;
        return Number(bridge.lastActionAt || 0) >= Number(local.lastActionAt || 0) ?
          Object.assign({}, local, bridge) : local;
      } catch (_) { return key === 'HY8_STATE' ? bridgeRead() : undefined; }
    };
    const write = (key, value) => {
      try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (_) {}
      if (key === 'HY8_STATE') bridgeWrite(value);
    };
    window.GM_getValue = key => read(key);
    window.GM_setValue = (key, value) => write(key, value);
    window.GM_deleteValue = key => { try { localStorage.removeItem(prefix + key); } catch (_) {} };
    window.GM_registerMenuCommand = () => {};
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        configurable: true,
        get: () => undefined
      });
    } catch (_) {}
    window.__HY8_CAPTCHA_PROVIDER_URL = ${JSON.stringify(settings.captchaProviderUrl || '')};
    write('HY8_POLICY', ${JSON.stringify(policy)});
    const state = Object.assign({ running: true, paused: false, phase: 'idle', logs: [] }, read('HY8_STATE') || {});
    state.running = true;
    state.paused = false;
    write('HY8_STATE', state);
  })();`;
}

async function loginSnapshot(page) {
  return page.evaluate(selectors => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };
    const one = selector => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.find(visible) || nodes[0] || null;
    };
    const more = one(selectors.more);
    const passwordMode = one(selectors.passwordMode);
    const username = one(selectors.username);
    const password = one(selectors.password);
    const passwordReal = one(selectors.passwordReal);
    const captcha = one(selectors.captcha);
    const captchaImage = one(selectors.captchaImage);
    const agreement = one(selectors.agreement);
    const submit = one(selectors.submit);
    return {
      more: Boolean(more),
      passwordMode: Boolean(passwordMode),
      username: Boolean(username),
      password: Boolean(password),
      passwordReal: Boolean(passwordReal),
      captcha: Boolean(captcha),
      captchaImage: Boolean(captchaImage),
      captchaValue: captcha ? String(captcha.value || '').trim() : '',
      agreement: Boolean(agreement),
      agreementChecked: Boolean(agreement && agreement.checked),
      submit: Boolean(submit)
    };
  }, LOGIN_SELECTORS);
}

async function ensurePasswordLogin(page) {
  if (await visibleHandle(page, LOGIN_SELECTORS.username, false)) return;
  const more = await visibleHandle(page, LOGIN_SELECTORS.more, false);
  if (more) {
    await more.click();
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (await visibleHandle(page, LOGIN_SELECTORS.username, false)) return;
  const passwordMode = await visibleHandle(page, LOGIN_SELECTORS.passwordMode, false);
  if (passwordMode) {
    await passwordMode.click();
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  await page.waitForFunction(selector => {
    return Array.from(document.querySelectorAll(selector)).some(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    });
  }, { timeout: 30000 }, LOGIN_SELECTORS.username);
}

async function fillLogin(page, config) {
  await page.evaluate((selectors, values) => {
    function visible(element) {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }
    function one(selector) {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.find(visible) || nodes[0] || null;
    }
    function setValue(input, value) {
      if (!input) return;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (descriptor && descriptor.set) descriptor.set.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const username = one(selectors.username);
    const password = one(selectors.password);
    const real = one(selectors.passwordReal);
    const agreement = one(selectors.agreement);
    setValue(username, values.username);
    setValue(password, values.password);
    setValue(real, values.password);
    if (agreement && !agreement.checked) agreement.click();
  }, LOGIN_SELECTORS, { username: config.username, password: config.password });
}

async function fillCaptcha(page, code) {
  await page.evaluate((selector, value) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    const input = nodes.find(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }) || nodes[0];
    if (!input) throw new Error('验证码输入框未找到');
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, LOGIN_SELECTORS.captcha, code);
}

async function visibleHandle(page, selector, fallback) {
  const handles = await page.$$(selector);
  for (const handle of handles) {
    const isVisible = await handle.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    });
    if (isVisible) return handle;
  }
  return fallback === false ? null : (handles[0] || null);
}

async function captchaImageBuffer(page) {
  await page.waitForFunction(selector => {
    const images = Array.from(document.querySelectorAll(selector));
    const image = images.find(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    });
    return Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  }, { timeout: 15000 }, LOGIN_SELECTORS.captchaImage);
  const image = await visibleHandle(page, LOGIN_SELECTORS.captchaImage, false);
  if (!image) throw new Error('验证码图片节点未找到');
  return image.screenshot({ type: 'png' });
}

async function refreshCaptcha(page) {
  const previous = await page.evaluate(selector => {
    const images = Array.from(document.querySelectorAll(selector));
    const image = images.find(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }) || images[0];
    return image ? `${image.currentSrc || image.src}|${image.getAttribute('src') || ''}` : '';
  }, LOGIN_SELECTORS.captchaImage).catch(() => '');
  await page.evaluate(selectors => {
    const dialog = document.querySelector(
      '.layui-layer-btn0,.layui-layer-close,.ui-dialog-button button,.el-message-box__btns button'
    );
    if (dialog) dialog.click();
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };
    const pick = selector => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.find(visible) || nodes[0] || null;
    };
    const input = pick(selectors.captcha);
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const image = pick(selectors.captchaImage);
    if (image) image.click();
  }, LOGIN_SELECTORS);
  await Promise.race([
    page.waitForFunction((selector, oldValue) => {
      const images = Array.from(document.querySelectorAll(selector));
      const image = images.find(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          style.opacity !== '0' && rect.width > 0 && rect.height > 0;
      }) || images[0];
      if (!image || !image.complete || !image.naturalWidth) return false;
      const current = `${image.currentSrc || image.src}|${image.getAttribute('src') || ''}`;
      return current !== oldValue;
    }, { timeout: 3000 }, LOGIN_SELECTORS.captchaImage, previous).catch(() => null),
    new Promise(resolve => setTimeout(resolve, 800))
  ]);
}

async function submitLogin(page) {
  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: 15000
  }).catch(() => null);
  const submit = await visibleHandle(page, LOGIN_SELECTORS.submit, false);
  if (!submit) throw new Error('登录按钮未找到');
  await submit.click();
  await Promise.race([navigation, new Promise(resolve => setTimeout(resolve, 1200))]);
}

async function waitForLoginOutcome(page, timeoutMs) {
  const deadline = Date.now() + Number(timeoutMs || 10000);
  let message = '';
  while (Date.now() < deadline) {
    if (!/\/secure\/login/i.test(page.url())) return { navigated: true, message: '' };
    try {
      const result = await page.evaluate(() => {
        const visible = element => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' &&
            style.opacity !== '0' && rect.width > 0 && rect.height > 0;
        };
        const dialogs = Array.from(document.querySelectorAll(
          '.layui-layer-dialog,.layui-layer-content,.ui-dialog,.el-message-box,[role="dialog"]'
        )).filter(visible);
        return {
          message: dialogs.map(element => element.innerText || element.textContent || '').join(' '),
          ready: document.readyState
        };
      });
      message = String(result.message || '');
      if (message) return { navigated: false, message };
    } catch (_) {
      // Navigation replaces the execution context; the next poll reads the new document.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!/\/secure\/login/i.test(page.url())) return { navigated: true, message: '' };
  try {
    message = await page.evaluate(() => document.body ? String(document.body.innerText || '') : '');
  } catch (_) {}
  return { navigated: false, message };
}

async function handleLogin(page, config, report) {
  if (!/\/secure\/login/i.test(page.url())) return { status: 'not_needed' };
  if (!config.username || !config.password) throw new Error('登录页需要 HUAYI_USERNAME 与 HUAYI_PASSWORD');
  await ensurePasswordLogin(page);
  await page.waitForSelector(LOGIN_SELECTORS.username, { timeout: 30000 });
  const maxAttempts = Math.max(1, Number(config.captchaMaxAttempts || 6));
  let recognizer = null;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await fillLogin(page, config);
      let snapshot = await loginSnapshot(page);
      let plan = buildLoginPlan(snapshot, config);
      if (!plan.ready) throw new Error('登录表单布局未完整识别');
      if (plan.captchaRequired) {
        if (config.captchaCode && attempt === 1) {
          await fillCaptcha(page, config.captchaCode);
        } else if (config.captchaAuto !== false) {
          if (!recognizer) {
            recognizer = await createLocalRecognizer({
              cachePath: path.join(config.stateDir, 'ocr-cache')
            });
          }
          report({
            type: 'captcha',
            message: `正在本机识别图形验证码（第 ${attempt}/${maxAttempts} 次）`
          });
          const image = await captchaImageBuffer(page);
          const solved = await solveCaptchaBuffer(image, {
            recognizer,
            expectedLength: config.captchaExpectedLength || 5
          });
          await fillCaptcha(page, solved.code);
          report({
            type: 'captcha',
            message: `验证码本机识别完成，正在提交（共识 ${solved.votes}）`
          });
        } else {
          report({ type: 'captcha', message: '图形验证码输入框已聚焦，输入后自动提交' });
          await page.focus(LOGIN_SELECTORS.captcha);
          await page.waitForFunction(selector => {
            const input = document.querySelector(selector);
            return Boolean(input && String(input.value || '').trim());
          }, { timeout: config.captchaTimeoutMs }, LOGIN_SELECTORS.captcha);
        }
        snapshot = await loginSnapshot(page);
        plan = buildLoginPlan(snapshot, config);
      }
      if (!plan.submit) throw new Error('登录提交条件尚未满足');
      await submitLogin(page);
      const outcome = await waitForLoginOutcome(page, 10000);
      if (outcome.navigated) {
        report({ type: 'login', message: '登录成功，正在恢复年度任务' });
        return { status: 'submitted', attempts: attempt };
      }
      const message = outcome.message;
      if (!/验证码|校验码|图形码/.test(message)) {
        throw new Error('登录未完成，请核对页面提示');
      }
      if (attempt < maxAttempts) {
        report({ type: 'captcha', message: '验证码已刷新，继续本机识别' });
        await refreshCaptcha(page);
      }
    }
  } finally {
    if (recognizer) await recognizer.terminate();
  }
  throw new Error(`验证码连续 ${maxAttempts} 次未通过页面校验`);
}

async function readState(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('HY_HERMES_HY8_STATE');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  });
}

function operationTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label || '浏览器操作'}超过 ${timeoutMs}ms 无响应`);
      error.code = 'HERMES_OPERATION_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function clickTrustedPlayerAction(page) {
  const selectors = [
    '.pv-bad-network-tip span[type="change"]',
    '.layer_tips .rig_btn',
    '.study_diaog .btn_sign',
    '.pv-cover .pv-icon-btn-play',
    '.pv-playpause.pv-icon-btn-play',
    '.xgplayer-start'
  ];
  for (const selector of selectors) {
    const handle = await visibleHandle(page, selector, false);
    if (!handle) continue;
    if (/play|xgplayer-start/i.test(selector)) {
      const completed = await page.evaluate(() => {
        const video = document.querySelector('video');
        const marker = window.__HY8_CASE_VIDEO_DONE;
        const remembered = marker && marker.key === location.href &&
          Date.now() - Number(marker.at || 0) < 120000;
        return Boolean(remembered || (video && (
          video.ended ||
          (Number(video.duration || 0) > 0 &&
            Number(video.currentTime || 0) >= Number(video.duration || 0) - 0.25)
        )));
      }).catch(() => false);
      if (completed) continue;
    }
    const text = await handle.evaluate(element =>
      String(element.value || element.innerText || element.textContent || '').trim()
    ).catch(() => '');
    await handle.click({ delay: 35 });
    return { selector, text };
  }
  return null;
}

async function clickTrustedSurveyAction(page) {
  const selectors = [
    '#aliyunCaptcha-checkbox-icon',
    '#aliyunCaptcha-checkbox-body',
    '.layui-layer-btn0'
  ];
  for (const selector of selectors) {
    const handle = await visibleHandle(page, selector, false);
    if (!handle) continue;
    if (selector === '.layui-layer-btn0') {
      const securityRetry = await handle.evaluate(() =>
        /需要安全校验|重新提交/.test(String(document.body && document.body.innerText || ''))
      ).catch(() => false);
      if (!securityRetry) continue;
    }
    const text = await handle.evaluate(element =>
      String(element.value || element.innerText || element.textContent || '').trim()
    ).catch(() => '');
    await handle.click({ delay: 85 });
    return { selector, text };
  }
  return null;
}

async function readPlayerMediaState(page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    if (!video) return null;
    return {
      url: location.href,
      currentTime: Number(video.currentTime || 0),
      duration: Number(video.duration || 0),
      paused: Boolean(video.paused),
      ended: Boolean(video.ended),
      readyState: Number(video.readyState || 0),
      networkState: Number(video.networkState || 0)
    };
  });
}

function updatePlayerWatch(previous, sample, now = Date.now(), stallMs = 45000) {
  if (!sample || !/course_ware/i.test(String(sample.url || '')) ||
      !Number.isFinite(sample.currentTime)) {
    return { watch: null, stalled: false };
  }
  const playbackPosition = Number(sample.currentTime);
  const duration = Number.isFinite(sample.duration) ? Number(sample.duration) : 0;
  const identity = `${sample.url}|${duration.toFixed(3)}`;
  const moved = !previous || previous.identity !== identity ||
    Math.abs(playbackPosition - previous.position) >= 0.25;
  const watch = {
    identity,
    position: playbackPosition,
    lastProgressAt: moved ? now : previous.lastProgressAt
  };
  const activelyExpected = !sample.paused && !sample.ended &&
    duration > 0 && playbackPosition + 1 < duration;
  const effectiveStallMs = Number(sample.readyState) <= 2 ?
    Math.min(stallMs, 10000) : stallMs;
  return {
    watch,
    stalled: activelyExpected && now - watch.lastProgressAt >= effectiveStallMs
  };
}

function processExists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function killBrowserProcessesForProfile(userDataDir) {
  if (!userDataDir || process.platform !== 'win32') return;
  const script = [
    "$profile = $env:HUAYI_CLEAN_PROFILE",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -match '^(msedge|chrome)\\.exe$' -and",
    "  $_.CommandLine -and $_.CommandLine.IndexOf($profile, [StringComparison]::OrdinalIgnoreCase) -ge 0",
    "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
  ].join('\n');
  childProcess.spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      stdio: 'ignore',
      windowsHide: true,
      env: Object.assign({}, process.env, { HUAYI_CLEAN_PROFILE: path.resolve(userDataDir) })
    }
  );
}

async function closeRuntimeResources(browser, captchaService, connected, userDataDir) {
  let browserPid = 0;
  if (browser && !connected) {
    try {
      const browserProcess = browser.process && browser.process();
      browserPid = Number(browserProcess && browserProcess.pid || 0);
    } catch (_) {}
  }
  if (browser) {
    try {
      if (connected) browser.disconnect();
      else {
        await Promise.race([
          browser.close(),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
    } catch (_) {}
  }
  if (browserPid && process.platform === 'win32') {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (processExists(browserPid)) {
      childProcess.spawnSync(
        'taskkill',
        ['/PID', String(browserPid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true }
      );
    }
  }
  if (!connected && userDataDir) killBrowserProcessesForProfile(userDataDir);
  if (captchaService) {
    try {
      await Promise.race([
        captchaService.close(),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    } catch (_) {}
  }
}

async function runHermes(config, callbacks) {
  const report = callbacks && callbacks.report || (() => {});
  fs.mkdirSync(config.userDataDir, { recursive: true });
  let captchaService = null;
  let captchaProviderUrl = config.captchaProviderUrl;
  if (config.captchaAuto !== false && !captchaProviderUrl) {
    try {
      captchaService = await startCaptchaServer({
        port: config.captchaPort,
        cachePath: path.join(config.stateDir, 'ocr-cache'),
        expectedLength: config.captchaExpectedLength,
        unref: true
      });
      captchaProviderUrl = captchaService.url;
      report({ type: 'captcha_service', message: `本机验证码模块已启动：${captchaService.url}` });
    } catch (error) {
      if (!/EADDRINUSE/.test(String(error && error.code || error && error.message))) throw error;
      captchaProviderUrl = `http://127.0.0.1:${config.captchaPort}/solve`;
      report({ type: 'captcha_service', message: `复用本机验证码模块：${captchaProviderUrl}` });
    }
  }
  const connected = Boolean(config.browserUrl);
  let browser = null;
  try {
    const userscript = fs.readFileSync(path.join(__dirname, '..', 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
    browser = connected ? await puppeteer.connect({ browserURL: config.browserUrl, defaultViewport: null }) :
      await puppeteer.launch({
      executablePath: config.browserPath,
      headless: config.headless,
      userDataDir: config.userDataDir,
      defaultViewport: { width: 1440, height: 960 },
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-first-run',
        '--disable-default-apps',
        '--disable-blink-features=AutomationControlled'
      ]
      });
  const existingPages = await browser.pages();
  const page = await browser.newPage();
  for (const existingPage of existingPages) {
    try {
      await Promise.race([
        existingPage.close({ runBeforeUnload: false }),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (_) {}
  }
  page.setDefaultTimeout(30000);
  const browserVersion = await browser.version().catch(() => '');
  const versionMatch = String(browserVersion).match(/(?:Chrome|HeadlessChrome)\/([\d.]+)/i);
  if (versionMatch) {
    await page.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
      `(KHTML, like Gecko) Chrome/${versionMatch[1]} Safari/537.36`
    );
  }
  page.on('console', event => {
    const text = event.text();
    if (/^\[HY8\]/.test(text)) report({ type: 'page', message: text });
  });
  const preload = preloadSource(config.policy, { captchaProviderUrl });
  await page.evaluateOnNewDocument(preload);
  await page.evaluateOnNewDocument(`if (/(^|\\.)91huayi\\.com$/i.test(location.hostname)) {\n${userscript}\n}`);
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await handleLogin(page, config, report);
  if (!/study_info_list/i.test(page.url())) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  const startedAt = Date.now();
  let lastSignature = '';
  let lastTaskSignature = '';
  let lastTrustedSignature = '';
  let lastTrustedActionAt = 0;
  let playerWatch = null;
  while (Date.now() - startedAt < config.maxRuntimeMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (/\/secure\/login/i.test(page.url())) {
      await handleLogin(page, config, report);
      if (!/study_info_list/i.test(page.url())) {
        await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
    }
    if (/(?:course_ware|hdbl\.91huayi\.com)/i.test(page.url()) && Date.now() - lastTrustedActionAt > 800) {
      let trusted = null;
      try {
        trusted = await operationTimeout(clickTrustedPlayerAction(page), 10000, '播放器提示检测');
      } catch (error) {
        if (error && error.code === 'HERMES_OPERATION_TIMEOUT') throw error;
      }
      if (trusted) {
        const trustedSignature = `${page.url()}|${trusted.selector}|${trusted.text}`;
        if (trustedSignature !== lastTrustedSignature || Date.now() - lastTrustedActionAt > 4000) {
          report({
            type: 'trusted_click',
            message: `已用浏览器原生输入处理播放器提示：${trusted.text || trusted.selector}`
          });
        }
        lastTrustedSignature = trustedSignature;
        lastTrustedActionAt = Date.now();
      }
    }
    if (/dcwj\.91huayi\.com/i.test(page.url()) && Date.now() - lastTrustedActionAt > 800) {
      let trusted = null;
      try {
        trusted = await operationTimeout(clickTrustedSurveyAction(page), 10000, '问卷安全校验检测');
      } catch (error) {
        if (error && error.code === 'HERMES_OPERATION_TIMEOUT') throw error;
      }
      if (trusted) {
        const trustedSignature = `${page.url()}|${trusted.selector}|${trusted.text}`;
        if (trustedSignature !== lastTrustedSignature || Date.now() - lastTrustedActionAt > 4000) {
          report({
            type: 'trusted_click',
            message: `已用浏览器原生输入处理问卷安全校验：${trusted.text || trusted.selector}`
          });
        }
        lastTrustedSignature = trustedSignature;
        lastTrustedActionAt = Date.now();
      }
    }
    if (/course_ware/i.test(page.url())) {
      let media = null;
      try {
        media = await operationTimeout(readPlayerMediaState(page), 10000, '播放器状态读取');
      } catch (error) {
        if (error && error.code === 'HERMES_OPERATION_TIMEOUT') throw error;
      }
      const observed = updatePlayerWatch(playerWatch, media);
      playerWatch = observed.watch;
      if (observed.stalled && media && page.url() === media.url) {
        report({
          type: 'player_recovery',
          message: `播放器连续无进度，正在刷新恢复（${Math.floor(media.currentTime)} 秒，readyState=${media.readyState}）`
        });
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (_) {}
        playerWatch = null;
        lastTrustedSignature = '';
        lastTrustedActionAt = 0;
        continue;
      }
    } else {
      playerWatch = null;
    }
    let state;
    try {
      state = await operationTimeout(readState(page), 10000, '页面状态读取');
    } catch (error) {
      if (error && error.code === 'HERMES_OPERATION_TIMEOUT') throw error;
      continue;
    }
    if (!state) continue;
    const signature = [state.phase, state.message, state.credit, state.publicEarned, state.otherEarned].join('|');
    if (signature !== lastSignature) {
      lastSignature = signature;
      report({ type: 'state', state });
    }
    const taskSignature = JSON.stringify(state.planTasks || []);
    if (taskSignature !== lastTaskSignature) {
      lastTaskSignature = taskSignature;
      report({ type: 'plan', tasks: state.planTasks || [] });
    }
    if (state.phase === 'done') {
      return { status: 'done', state, policy: Core.buildAnnualPlan(state.studyRecords || [], state.catalogRecords || [], config.policy) };
    }
    if (!state.running) {
      return { status: 'attention', state };
    }
    if (config.signal && config.signal.aborted) return { status: 'stopped', state };
  }
    return { status: 'timeout', state: await readState(page) };
  } finally {
    await closeRuntimeResources(browser, captchaService, connected, config.userDataDir);
  }
}

module.exports = {
  LOGIN_SELECTORS,
  buildLoginPlan,
  preloadSource,
  loginSnapshot,
  ensurePasswordLogin,
  fillLogin,
  fillCaptcha,
  visibleHandle,
  captchaImageBuffer,
  refreshCaptcha,
  submitLogin,
  waitForLoginOutcome,
  handleLogin,
  readState,
  operationTimeout,
  clickTrustedPlayerAction,
  clickTrustedSurveyAction,
  readPlayerMediaState,
  updatePlayerWatch,
  processExists,
  killBrowserProcessesForProfile,
  closeRuntimeResources,
  runHermes
};
