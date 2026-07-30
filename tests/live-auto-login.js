'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { resolveBrowser } = require('../src/hermes/config');
const { handleLogin } = require('../src/hermes/runner');

(async () => {
  assert(process.env.HUAYI_USERNAME, '需要 HUAYI_USERNAME');
  assert(process.env.HUAYI_PASSWORD, '需要 HUAYI_PASSWORD');
  const executablePath = resolveBrowser(process.env.HUAYI_BROWSER);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-live-auto-login-'));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir: path.join(workspace, 'profile'),
      args: ['--no-first-run', '--disable-default-apps']
    });
    const page = await browser.newPage();
    await page.goto(
      'https://cme28.91huayi.com/secure/login.aspx?urls=http%3A%2F%2Fcme28.91huayi.com%2Fpages%2Fstudy_info_list.aspx',
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    const events = [];
    const result = await handleLogin(page, {
      username: process.env.HUAYI_USERNAME,
      password: process.env.HUAYI_PASSWORD,
      captchaCode: '',
      captchaAuto: true,
      captchaMaxAttempts: 6,
      captchaExpectedLength: 5,
      captchaTimeoutMs: 60000,
      stateDir: path.join(workspace, 'state')
    }, event => events.push(event.type));
    assert.equal(result.status, 'submitted');
    assert(!/\/secure\/login/i.test(page.url()), '登录完成后仍位于登录页');
    const authenticated = await page.evaluate(() =>
      /我的学习记录/.test(document.body ? document.body.innerText : '') ||
      Boolean(document.querySelector('a[href*="study_info_list"],table'))
    );
    assert.equal(authenticated, true);
    assert(events.includes('captcha'));
    assert(events.includes('login'));
    console.log(`华医网真实全自动登录测试通过：${result.attempts} 次页面校验`);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
