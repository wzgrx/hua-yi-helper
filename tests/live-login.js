'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { resolveBrowser } = require('../src/hermes/config');

(async () => {
  const executablePath = resolveBrowser(process.env.HUAYI_BROWSER);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-live-layout-'));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir: profile,
      args: ['--no-first-run', '--disable-default-apps']
    });
    const page = await browser.newPage();
    const response = await page.goto(
      'https://cme28.91huayi.com/secure/login.aspx?urls=http%3A%2F%2Fcme28.91huayi.com%2Fpages%2Fstudy_info_list.aspx',
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    assert(response && response.ok(), `HTTP ${response && response.status()}`);
    const layout = await page.evaluate(() => {
      const form = document.querySelector('#form1');
      const one = selector => document.querySelector(selector);
      return {
        title: document.title,
        form: Boolean(form),
        method: form ? String(form.method || '').toLowerCase() : '',
        username: Boolean(one('#txt_user_name[name="txt_user_name"]')),
        password: Boolean(one('#txt_user_pwd')),
        passwordReal: Boolean(one('#txt_user_pwd_real[name="txt_user_pwd"]')),
        captcha: Boolean(one('#txt_img_code[name="txt_img_code"]')),
        captchaImage: Boolean(one('#yzm_img[src*="CheckCode"]')),
        agreement: Boolean(one('#agree1[type="checkbox"]')),
        submit: Boolean(one('.btn_login'))
      };
    });
    assert.equal(layout.form, true);
    assert.equal(layout.method, 'post');
    for (const field of ['username', 'password', 'passwordReal', 'captcha', 'captchaImage', 'agreement', 'submit']) {
      assert.equal(layout[field], true, `缺少最新登录字段：${field}`);
    }
    console.log(`华医网在线登录布局测试通过：${layout.title}`);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
