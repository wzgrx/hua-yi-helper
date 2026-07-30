'use strict';

const assert = require('assert');
const { LOGIN_SELECTORS, buildLoginPlan, preloadSource } = require('../src/hermes/runner');

assert.match(LOGIN_SELECTORS.username, /txt_user_name/);
assert.match(LOGIN_SELECTORS.password, /txt_user_pwd/);
assert.match(LOGIN_SELECTORS.passwordReal, /txt_user_pwd_real/);
assert.match(LOGIN_SELECTORS.captcha, /txt_img_code/);
assert.match(LOGIN_SELECTORS.captchaImage, /yzm_img/);
assert.match(LOGIN_SELECTORS.agreement, /agree1/);
assert.match(LOGIN_SELECTORS.submit, /btn_login/);

const credentials = { username: 'fixture-user', password: 'fixture-password' };
const captchaPlan = buildLoginPlan({
  username: true,
  password: true,
  passwordReal: true,
  captcha: true,
  captchaImage: true,
  captchaValue: '',
  agreement: true,
  agreementChecked: false,
  submit: true
}, credentials);
assert.equal(captchaPlan.ready, true);
assert.equal(captchaPlan.fillUsername, true);
assert.equal(captchaPlan.syncRealPassword, true);
assert.equal(captchaPlan.acceptAgreement, true);
assert.equal(captchaPlan.captchaRequired, true);
assert.equal(captchaPlan.submit, false);

const readyPlan = buildLoginPlan({
  username: true,
  password: true,
  passwordReal: true,
  captcha: true,
  captchaImage: true,
  captchaValue: '1234',
  agreement: true,
  agreementChecked: true,
  submit: true
}, credentials);
assert.equal(readyPlan.captchaRequired, false);
assert.equal(readyPlan.submit, true);

const preload = preloadSource({ year: 2025, publicTarget: 5, otherTarget: 20 });
assert.match(preload, /HY8_POLICY/);
assert.match(preload, /publicTarget/);
assert(!preload.includes(credentials.password));

console.log('Hermes 最新登录布局与验证码等待测试通过');
