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

test('Vue 分页课程发现跨页合并且下一页只在可用时点击', () => {
  const { api, window } = boot(`
    <div class="pro_cent"><ul><li class="jet_lis"><p class="test_tit">课程一</p><a href="/pages/course.aspx?cid=1">进入</a><span>2学分</span></li></ul></div>
    <div class="el-pagination"><button class="btn-next">下一页</button></div>
  `, 'https://cme28.91huayi.com/cme/index');
  let clicked = 0;
  window.document.querySelector('.btn-next').addEventListener('click', () => { clicked++; });
  api.VueCourseScanner.scanFromVueSPA();
  assert.equal(api.VueCourseScanner.advanceVuePage(), true);
  assert.equal(clicked, 1);
  window.document.querySelector('.pro_cent ul').innerHTML = '<li class="jet_lis"><p class="test_tit">课程二</p><a href="/pages/course.aspx?cid=2">进入</a><span>3学分</span></li>';
  api.VueCourseScanner.scanFromVueSPA();
  assert.deepEqual(Array.from(api.VueCourseScanner.getDiscoveredCourses(), course => course.name).sort(), ['课程一', '课程二']);
  window.document.querySelector('.btn-next').disabled = true;
  assert.equal(api.VueCourseScanner.advanceVuePage(), false);
});

test('Vue 新版项目卡无标题类时从首行解析名称和学分', () => {
  const { api } = boot(`
    <div class="pro_cent"><ul>
      <li class="jet_lis">
        <a href="/pages/course.aspx?cid=abc" target="_blank"></a>
        “因地制宜”寒地缺血性心脏病的精准治疗
        <p>前沿进展</p>
        <p>国家级 2.0学分</p>
        <p>项目编号：</p><p>2026-03-01-046(国)</p>
      </li>
    </ul></div>
  `, 'https://cme28.91huayi.com/cme/index');
  const courses = api.VueCourseScanner.scanFromVueSPA();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].name, '“因地制宜”寒地缺血性心脏病的精准治疗');
  assert.equal(courses[0].credit, 2);
  assert.match(courses[0].link, /cid=abc/);
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

test('学习记录按目标年度过滤历史课程', () => {
  const { api } = boot(`
    <table><thead><tr><th>项目名称</th><th>年度</th><th>学分</th><th>学习状态</th><th>x</th><th>x</th><th>学习进度</th><th>操作</th></tr></thead><tbody>
      <tr><td><a href="/pages/course.aspx?cid=old">旧课程</a></td><td>2025</td><td>10学分</td><td>已申请</td><td></td><td></td><td>1/1</td><td></td></tr>
      <tr><td><a href="/pages/course.aspx?cid=new">本年课程</a></td><td>2026</td><td>2学分</td><td>已申请</td><td></td><td></td><td>1/1</td><td></td></tr>
    </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx');
  const result = api.VueCourseScanner.scanCreditsFromASP();
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].name, '本年课程');
  assert.equal(result.total, 2);
});

test('规划同时满足公需与其他类别且不会伪造课程 URL', () => {
  const { api } = boot('<main></main>');
  const analysis = {
    met: false,
    publicRemaining: 5,
    otherRemaining: 4,
    totalRemaining: 9,
    courses: [
      { name: '无入口课程', credit: 9, isPublic: false, completed: false, link: '', actionUrl: '' },
      { name: '公需课', credit: 5, isPublic: true, completed: false, link: '/pages/course.aspx?cid=pub', progressPct: 0 },
      { name: '待考试课', credit: 2, isPublic: false, completed: false, link: '/pages/course.aspx?cid=exam', needsExam: true, progressPct: 100 },
      { name: '普通课', credit: 2, isPublic: false, completed: false, link: '/pages/course.aspx?cid=normal', progressPct: 0 }
    ]
  };
  const plan = api.CreditPlanner.generatePlan(analysis);
  assert.deepEqual(Array.from(plan.tasks, task => task.name), ['公需课', '待考试课', '普通课']);
  assert(plan.tasks.every(task => /course\.aspx\?cid=/.test(task.url)));
  assert.equal(plan.remainingAfterPlan, 0);
});

test('总分 25 但类别配额不足时不误判达标', () => {
  const { api } = boot(`
    <table><thead><tr><th>项目名称</th><th>年度</th><th>学分</th><th>学习状态</th><th>x</th><th>x</th><th>学习进度</th><th>操作</th></tr></thead><tbody>
      <tr><td><a href="/pages/course.aspx?cid=p">公需课程</a></td><td>2026</td><td>6学分 公需</td><td>已申请</td><td></td><td></td><td>1/1</td><td></td></tr>
      <tr><td><a href="/pages/course.aspx?cid=o">专业课程</a></td><td>2026</td><td>19学分</td><td>已申请</td><td></td><td></td><td>1/1</td><td></td></tr>
    </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx');
  const result = api.CreditPlanner.analyze();
  assert.equal(result.totalEarned, 25);
  assert.equal(result.met, false);
  assert.equal(result.otherRemaining, 1);
  assert.equal(result.totalRemaining, 1);
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

test('登录重试只针对验证码错误，账号密码错误立即停止', () => {
  const { api } = boot('', 'https://cme28.91huayi.com/secure/login.aspx');
  assert.equal(api.shouldRetryLogin('图形验证码错误'), true);
  assert.equal(api.shouldRetryLogin('用户名或密码错误'), false);
  assert.equal(api.shouldRetryLogin('账号不存在'), false);
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

test('考试结果只学习结果页明确验证为正确的已提交答案', () => {
  const { api, values } = boot(`
    <div class="state_cour_lis"><img src="/images/bar_img.png"><p title="1. 正确题目">正确题目</p></div>
    <div class="state_cour_lis"><img src="/images/wrong.png"><p title="2. 错误题目">错误题目</p></div>
  `, 'https://cme28.91huayi.com/pages/exam_result.aspx', {
    HY_LastSubmittedAnswers: { 正确题目: '正确选项', 错误题目: '错误选项' },
    HY_rightAnswers: {}
  });
  api.doResult();
  const answers = values.get('HY_rightAnswers');
  assert.equal(answers['正确题目'], '正确选项');
  assert.equal(answers['错误题目'], undefined);
  assert.equal(values.has('HY_LastSubmittedAnswers'), false);
});

test('问卷先填写必需控件再返回唯一提交按钮', () => {
  const { api, window } = boot(`
    <form id="divQuestion">
      <label><input type="radio" name="q1" value="1">满意</label>
      <label><input type="radio" name="q1" value="2">一般</label>
      <label><input type="checkbox" name="q2" value="a">选项A</label>
      <select name="q3"><option value="">请选择</option><option value="x">X</option></select>
      <textarea name="q4"></textarea>
      <button id="ctlNext" type="submit">提交</button>
    </form>
  `, 'https://dcwj.91huayi.com/survey');
  const result = api.fillSurveyForm();
  assert(result.answered >= 4);
  assert.equal(result.submit.id, 'ctlNext');
  assert.equal(window.document.querySelector('input[name="q1"]:checked') !== null, true);
  assert.equal(window.document.querySelector('input[name="q2"]:checked') !== null, true);
  assert.equal(window.document.querySelector('select[name="q3"]').value, 'x');
  assert.equal(window.document.querySelector('textarea[name="q4"]').value, '无');
});

test('disabled、aria-disabled 与 CSS disabled 均不可用', () => {
  const { api, window } = boot('<button id="a">A</button><button id="b" aria-disabled="true">B</button><button id="c" class="is-disabled">C</button>');
  assert.equal(api.isElementEnabled(window.document.getElementById('a')), true);
  assert.equal(api.isElementEnabled(window.document.getElementById('b')), false);
  assert.equal(api.isElementEnabled(window.document.getElementById('c')), false);
});

test('互动病例只点击可见可用的安全推进按钮', () => {
  const { api } = boot(`
    <main class="case-main">
      <button id="back">返回</button>
      <span role="button" id="fake">确认</span>
      <button id="disabled" disabled>下一步</button>
      <button id="next">下一步</button>
    </main>
  `, 'https://hdbl.91huayi.com/case');
  assert.equal(api.findInteractiveAction().id, 'next');
});

console.log('========================================\n');
