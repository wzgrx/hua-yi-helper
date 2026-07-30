'use strict';

const assert = require('assert');
const { JSDOM } = require('jsdom');
const { LOGIN_SELECTORS, buildLoginPlan, preloadSource } = require('../src/hermes/runner');

assert.match(LOGIN_SELECTORS.more, /show_type_more/);
assert.match(LOGIN_SELECTORS.passwordMode, /type_pwd/);
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
assert.match(preload, /bridgeKeys/);
assert.match(preload, /webdriver/);
assert(!/Object\.assign\(\{\}, value/.test(preload));
assert(!preload.includes(credentials.password));

const dom = new JSDOM('<!doctype html><title>bridge fixture</title>', {
  url: 'https://cme28.91huayi.com/pages/study_info_list.aspx',
  runScripts: 'dangerously'
});
const hugeState = {
  running: true,
  paused: false,
  phase: 'course',
  message: '继续年度任务',
  currentCourseUrl: 'https://cme28.91huayi.com/pages/course.aspx?cid=fixture',
  currentCourseName: '跨域状态桥测试课程',
  currentCwid: 'cw-fixture',
  blockedApplications: [
    'https://cme28.91huayi.com/pages/apply_certificate.aspx?cid=one',
    'https://cme28.91huayi.com/pages/apply_certificate.aspx?cid=two'
  ],
  blockedApplicationYear: 2026,
  blockedApplicationRetryAt: 987654999,
  lastActionAt: 987654321,
  studyRecords: Array.from({ length: 80 }, (_, index) => ({
    name: `超长学习记录-${index}-${'x'.repeat(240)}`,
    url: `https://cme28.91huayi.com/course/${index}`
  })),
  catalogRecords: Array.from({ length: 80 }, (_, index) => ({
    name: `超长目录记录-${index}-${'y'.repeat(240)}`
  })),
  planTasks: Array.from({ length: 80 }, (_, index) => ({ type: 'resume', index })),
  logs: Array.from({ length: 40 }, (_, index) => `日志-${index}-${'z'.repeat(240)}`)
};
dom.window.localStorage.setItem('HY_HERMES_HY8_STATE', JSON.stringify(hugeState));
dom.window.eval(preloadSource({ year: 2026, publicTarget: 5, otherTarget: 20 }));
const bridgePart = dom.window.document.cookie.split('; ').find(item => item.startsWith('HY_HERMES_STATE='));
assert(bridgePart, '应写入跨子域状态桥 Cookie');
assert(bridgePart.length < 4096, `状态桥 Cookie 超限：${bridgePart.length}`);
const bridgeState = JSON.parse(decodeURIComponent(bridgePart.split('=').slice(1).join('=')));
assert.deepEqual(bridgeState.blockedApplications, hugeState.blockedApplications);
assert.equal(bridgeState.blockedApplicationYear, 2026);
assert.equal(bridgeState.blockedApplicationRetryAt, hugeState.blockedApplicationRetryAt);
assert.equal(bridgeState.currentCwid, 'cw-fixture');
assert.equal(bridgeState.studyRecords, undefined);
assert.equal(bridgeState.catalogRecords, undefined);
assert.equal(bridgeState.planTasks, undefined);
assert.equal(bridgeState.logs.length, 2);

const secondary = new JSDOM('<!doctype html><title>secondary fixture</title>', {
  url: 'https://hdbl.91huayi.com/course_ware/course_ware.aspx',
  runScripts: 'dangerously',
  cookieJar: dom.cookieJar
});
secondary.window.localStorage.setItem('HY_HERMES_HY8_STATE', JSON.stringify({
  running: true,
  phase: 'player',
  lastActionAt: 1,
  planTasks: [{ type: 'resume', name: '保留本地完整任务' }],
  studyRecords: [{ name: '保留本地完整记录' }]
}));
secondary.window.eval(preloadSource({ year: 2026, publicTarget: 5, otherTarget: 20 }));
const mergedState = JSON.parse(secondary.window.localStorage.getItem('HY_HERMES_HY8_STATE'));
assert.deepEqual(mergedState.blockedApplications, hugeState.blockedApplications);
assert.equal(mergedState.blockedApplicationRetryAt, hugeState.blockedApplicationRetryAt);
assert.equal(mergedState.currentCwid, 'cw-fixture');
assert.equal(mergedState.planTasks.length, 1);
assert.equal(mergedState.studyRecords.length, 1);
secondary.window.close();
dom.window.close();

console.log('Hermes 最新登录布局与验证码等待测试通过');
