const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'tampermonkey', 'hua-yi-helper.user.js'),
  'utf8'
);

function boot(html, url = 'https://cme28.91huayi.com/pages/course.aspx?cid=test', seed = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const values = new Map(Object.entries(seed));
  dom.window.__HY_TEST_MODE__ = true;
  dom.window.GM_getValue = (key) => values.get(key);
  dom.window.GM_setValue = (key, value) => values.set(key, value);
  dom.window.GM_deleteValue = (key) => values.delete(key);
  dom.window.console.log = () => {};
  dom.window.eval(script);
  return { window: dom.window, api: dom.window.__HY_TEST_API__, values };
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}`);
    throw error;
  }
}

console.log('\n========================================');
console.log('  v6 DOM 行为测试');
console.log('========================================');

test('课程详情解析名称、链接与真实状态', () => {
  const { api } = boot(`
    <table><tbody>
      <tr><td><a class="f14blue cw-title-link" href="/course_ware/course_ware.aspx?cwid=1">课件一</a></td><td><button>已完成</button></td></tr>
      <tr><td><a class="f14blue cw-title-link" href="/course_ware/course_ware.aspx?cwid=2">课件二</a></td><td><button>学习中</button></td></tr>
    </tbody></table>`);
  const rows = api.VueCourseScanner.scanFromCourseDetail();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].completed, true);
  assert.equal(rows[1].status, '学习中');
  assert.match(rows[1].href, /cwid=2/);
});

test('学习记录只把已申请计入已获学分', () => {
  const { api } = boot(`
    <table><thead><tr>${'<th>x</th>'.repeat(8)}</tr></thead><tbody>
      <tr><td><a href="/pages/course.aspx?cid=a">公需A</a></td><td>2026</td><td>5学分 公需</td><td>已申请</td><td></td><td></td><td>5/5</td><td></td></tr>
      <tr><td><a href="/pages/course.aspx?cid=b">专科B</a></td><td>2026</td><td>2学分</td><td>学习完毕</td><td></td><td></td><td>4/4</td><td></td></tr>
    </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx');
  const result = api.VueCourseScanner.scanCreditsFromASP();
  assert.equal(result.total, 5);
  assert.equal(result.public, 5);
  assert.equal(result.courses[1].needsExam, true);
});

test('执行状态跨页面读取与写回 GM 存储', () => {
  const { api, values } = boot('<main></main>', undefined, { HY_Running: true });
  assert.equal(api.SmartEngine._running, true);
  api.SmartEngine._running = false;
  assert.equal(values.get('HY_Running'), false);
});

test('登录凭据只写入 GM 存储且密码输入事件同步网站隐藏字段', () => {
  const { api, values, window } = boot(`
    <input id="txt_user_pwd" type="text"><input id="txt_user_pwd_real" type="hidden">
  `, 'https://cme28.91huayi.com/secure/login.aspx');
  const shown = window.document.getElementById('txt_user_pwd');
  const hidden = window.document.getElementById('txt_user_pwd_real');
  shown.addEventListener('input', () => { hidden.value = shown.value; });
  api.LoginController.setNativeValue(shown, 'test-password');
  assert.equal(hidden.value, 'test-password');
  api.LoginController.saveCredentials('user1', 'secret1', true);
  assert.deepEqual(
    { username: values.get('HY_CredentialsV1').username, password: values.get('HY_CredentialsV1').password },
    { username: 'user1', password: 'secret1' }
  );
  assert.equal(window.localStorage.getItem('HY_CredentialsV1'), null);
});

test('题目按选项 name 分组且不会把每个选项当成一题', () => {
  const { api } = boot(`
    <form>
      <fieldset><legend>1. 第一题是什么？</legend>
        <label><input type="radio" name="q1">A. 甲</label><label><input type="radio" name="q1">B. 乙</label>
      </fieldset>
      <fieldset><legend>2. 第二题是什么？</legend>
        <label><input type="radio" name="q2">A. 丙</label><label><input type="radio" name="q2">B. 丁</label>
      </fieldset>
    </form>`, 'https://cme28.91huayi.com/pages/exam.aspx');
  const questions = api.findQuestions();
  assert.equal(questions.length, 2);
  assert.equal(api.extractOptions(questions[0]).length, 2);
});

test('disabled、aria-disabled 与 CSS disabled 均不可用', () => {
  const { api, window } = boot('<button id="a">A</button><button id="b" aria-disabled="true">B</button><button id="c" class="is-disabled">C</button>');
  assert.equal(api.isElementEnabled(window.document.getElementById('a')), true);
  assert.equal(api.isElementEnabled(window.document.getElementById('b')), false);
  assert.equal(api.isElementEnabled(window.document.getElementById('c')), false);
});

console.log('========================================\n');
