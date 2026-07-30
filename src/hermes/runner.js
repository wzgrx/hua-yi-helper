'use strict';

const fs = require('fs');
const path = require('path');
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
    const bridgeRead = () => {
      try {
        const part = document.cookie.split('; ').find(item => item.startsWith(bridgeName + '='));
        return part ? JSON.parse(decodeURIComponent(part.slice(bridgeName.length + 1))) : undefined;
      } catch (_) { return undefined; }
    };
    const bridgeWrite = value => {
      try {
        const compact = Object.assign({}, value, { logs: (value.logs || []).slice(-8) });
        document.cookie = bridgeName + '=' + encodeURIComponent(JSON.stringify(compact)) +
          '; Domain=.91huayi.com; Path=/; SameSite=Lax';
      } catch (_) {}
    };
    const read = key => {
      try {
        const raw = localStorage.getItem(prefix + key);
        const local = raw == null ? undefined : JSON.parse(raw);
        if (key !== 'HY8_STATE') return local;
        const bridge = bridgeRead();
        return !local || (bridge && Number(bridge.lastActionAt || 0) > Number(local.lastActionAt || 0)) ? bridge : local;
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
  await Promise.race([navigation, new Promise(resolve => setTimeout(resolve, 2200))]);
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
      if (!/\/secure\/login/i.test(page.url())) {
        report({ type: 'login', message: '登录成功，正在恢复年度任务' });
        return { status: 'submitted', attempts: attempt };
      }
      const message = await page.evaluate(() =>
        document.body ? String(document.body.innerText || '') : ''
      );
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

async function runHermes(config, callbacks) {
  const report = callbacks && callbacks.report || (() => {});
  fs.mkdirSync(config.userDataDir, { recursive: true });
  let captchaService = null;
  if (config.captchaAuto !== false && !config.captchaProviderUrl) {
    try {
      captchaService = await startCaptchaServer({
        port: config.captchaPort,
        cachePath: path.join(config.stateDir, 'ocr-cache'),
        expectedLength: config.captchaExpectedLength,
        unref: true
      });
      config.captchaProviderUrl = captchaService.url;
      report({ type: 'captcha_service', message: `本机验证码模块已启动：${captchaService.url}` });
    } catch (error) {
      if (!/EADDRINUSE/.test(String(error && error.code || error && error.message))) throw error;
      config.captchaProviderUrl = `http://127.0.0.1:${config.captchaPort}/solve`;
      report({ type: 'captcha_service', message: `复用本机验证码模块：${config.captchaProviderUrl}` });
    }
  }
  const userscript = fs.readFileSync(path.join(__dirname, '..', 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
  const connected = Boolean(config.browserUrl);
  const browser = connected ? await puppeteer.connect({ browserURL: config.browserUrl, defaultViewport: null }) :
    await puppeteer.launch({
      executablePath: config.browserPath,
      headless: config.headless,
      userDataDir: config.userDataDir,
      defaultViewport: { width: 1440, height: 960 },
      args: ['--no-first-run', '--disable-default-apps']
    });
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', event => {
    const text = event.text();
    if (/^\[HY8\]/.test(text)) report({ type: 'page', message: text });
  });
  const preload = preloadSource(config.policy, { captchaProviderUrl: config.captchaProviderUrl });
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
  while (Date.now() - startedAt < config.maxRuntimeMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (/\/secure\/login/i.test(page.url())) {
      await handleLogin(page, config, report);
      if (!/study_info_list/i.test(page.url())) {
        await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
    }
    let state;
    try { state = await readState(page); } catch (_) { continue; }
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
      if (config.once) {
        if (connected) browser.disconnect();
        else await browser.close();
        if (captchaService) await captchaService.close();
      }
      return { status: 'done', state, policy: Core.buildAnnualPlan(state.studyRecords || [], state.catalogRecords || [], config.policy) };
    }
    if (!state.running && /^(blocked|card|paused)$/.test(String(state.phase))) {
      return { status: 'attention', state, browser, captchaService };
    }
  }
  return { status: 'timeout', state: await readState(page), browser, captchaService };
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
  handleLogin,
  readState,
  runHermes
};
