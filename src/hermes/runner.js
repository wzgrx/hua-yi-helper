'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const Core = require('../shared/core');

const LOGIN_SELECTORS = {
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

function preloadSource(policy) {
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
    write('HY8_POLICY', ${JSON.stringify(policy)});
    const state = Object.assign({ running: true, paused: false, phase: 'idle', logs: [] }, read('HY8_STATE') || {});
    state.running = true;
    state.paused = false;
    write('HY8_STATE', state);
  })();`;
}

async function loginSnapshot(page) {
  return page.evaluate(selectors => {
    const one = selector => document.querySelector(selector);
    const username = one(selectors.username);
    const password = one(selectors.password);
    const passwordReal = one(selectors.passwordReal);
    const captcha = one(selectors.captcha);
    const captchaImage = one(selectors.captchaImage);
    const agreement = one(selectors.agreement);
    const submit = one(selectors.submit);
    return {
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

async function fillLogin(page, config) {
  await page.evaluate((selectors, values) => {
    function setValue(input, value) {
      if (!input) return;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (descriptor && descriptor.set) descriptor.set.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const username = document.querySelector(selectors.username);
    const password = document.querySelector(selectors.password);
    const real = document.querySelector(selectors.passwordReal);
    const agreement = document.querySelector(selectors.agreement);
    setValue(username, values.username);
    setValue(password, values.password);
    setValue(real, values.password);
    if (agreement && !agreement.checked) agreement.click();
  }, LOGIN_SELECTORS, { username: config.username, password: config.password });
}

async function handleLogin(page, config, report) {
  if (!/\/secure\/login/i.test(page.url())) return { status: 'not_needed' };
  if (!config.username || !config.password) throw new Error('登录页需要 HUAYI_USERNAME 与 HUAYI_PASSWORD');
  await page.waitForSelector(LOGIN_SELECTORS.username, { timeout: 30000 });
  await fillLogin(page, config);
  let snapshot = await loginSnapshot(page);
  let plan = buildLoginPlan(snapshot, config);
  if (!plan.ready) throw new Error('登录表单布局未完整识别');
  if (plan.captchaRequired) {
    if (config.captchaCode) {
      await page.$eval(LOGIN_SELECTORS.captcha, (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, config.captchaCode);
    } else {
      report({ type: 'captcha', message: '图形验证码已聚焦；输入后 Hermes 自动提交' });
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
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  await page.click(LOGIN_SELECTORS.submit);
  await navigation;
  if (/\/secure\/login/i.test(page.url())) {
    const message = await page.evaluate(() => document.body ? String(document.body.innerText || '') : '');
    throw new Error(/验证码/.test(message) ? '登录后仍停留在验证页面，请刷新验证码后重试' : '登录未完成，请核对页面提示');
  }
  report({ type: 'login', message: '登录成功，正在恢复年度任务' });
  return { status: 'submitted' };
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
  const preload = preloadSource(config.policy);
  await page.evaluateOnNewDocument(preload);
  await page.evaluateOnNewDocument(`if (/(^|\\.)91huayi\\.com$/i.test(location.hostname)) {\n${userscript}\n}`);
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await handleLogin(page, config, report);
  if (!/study_info_list/i.test(page.url())) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  const startedAt = Date.now();
  let lastSignature = '';
  while (Date.now() - startedAt < config.maxRuntimeMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    let state;
    try { state = await readState(page); } catch (_) { continue; }
    if (!state) continue;
    const signature = [state.phase, state.message, state.credit, state.publicEarned, state.otherEarned].join('|');
    if (signature !== lastSignature) {
      lastSignature = signature;
      report({ type: 'state', state });
    }
    if (state.phase === 'done') {
      if (config.once) {
        if (connected) browser.disconnect();
        else await browser.close();
      }
      return { status: 'done', state, policy: Core.buildAnnualPlan(state.studyRecords || [], state.catalogRecords || [], config.policy) };
    }
    if (!state.running && /^(blocked|card|paused)$/.test(String(state.phase))) {
      return { status: 'attention', state, browser };
    }
  }
  return { status: 'timeout', state: await readState(page), browser };
}

module.exports = {
  LOGIN_SELECTORS,
  buildLoginPlan,
  preloadSource,
  loginSnapshot,
  fillLogin,
  handleLogin,
  readState,
  runHermes
};
