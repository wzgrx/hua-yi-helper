const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
function boot(html, url, seed = {}) {
  const dom = new JSDOM(html, { url: url || 'https://cme28.91huayi.com/pages/course.aspx?cid=x', runScripts: 'outside-only', pretendToBeVisual: true });
  const values = new Map(Object.entries(seed));
  dom.window.__HY_TEST_MODE__ = true;
  dom.window.GM_getValue = key => values.get(key);
  dom.window.GM_setValue = (key, value) => values.set(key, value);
  dom.window.GM_deleteValue = key => values.delete(key);
  dom.window.console.log = () => {};
  dom.window.eval(script);
  return { window: dom.window, api: dom.window.__HY7_TEST_API__, values };
}
function test(name, fn) { fn(); console.log(`✅ ${name}`); }

test('路由识别真实页面', () => {
  assert.equal(boot('', 'https://cme28.91huayi.com/pages/study_info_list.aspx').api.route(), 'study');
  assert.equal(boot('', 'https://cme28.91huayi.com/pages/exam.aspx?cwid=x').api.route(), 'exam');
  assert.equal(boot('', 'https://cme28.91huayi.com/course_ware/course_ware_polyv.aspx?cwid=x').api.route(), 'player');
});

test('学习记录仅累计已申请学分并提取动作', () => {
  const { api } = boot(`<table><tbody>
    <tr><td><a href="course.aspx?cid=a">公需课</a></td><td>2026</td><td>5学分</td><td>已申请</td><td></td><td></td><td>10/10</td><td></td></tr>
    <tr><td><a href="course.aspx?cid=b">专科课</a></td><td>2026</td><td>3学分</td><td>学习中</td><td></td><td></td><td>2/5</td><td><button onclick="location.href='course.aspx?cid=b'">继续学习</button></td></tr>
  </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx');
  const info = api.scanStudy();
  assert.equal(info.credit, 5);
  assert.equal(info.courses.length, 2);
  assert.match(info.courses[1].url, /cid=b/);
});

test('课程详情解析真实状态与 cwid', () => {
  const { api } = boot(`<div class="course"><a class="cw-title-link" href="/course_ware/course_ware.aspx?cwid=one">课件一</a><button>已完成</button></div>
  <div class="course"><a class="cw-title-link" href="/course_ware/course_ware.aspx?cwid=two">课件二</a><button>待考试</button></div>`);
  const rows = api.scanCoursewares();
  assert.deepEqual(Array.from(rows, x => [x.cwid, x.status]), [['one','已完成'],['two','待考试']]);
});

test('考试按 name 分组并提取五道真实格式题', () => {
  const tables = Array.from({length:5}, (_,i) => `<table class="tablestyle"><tr><th>${i+1}、题目${i+1}</th></tr><tr><td><label><input type="radio" name="q${i}" value="a">A、答案A</label></td></tr><tr><td><label><input type="radio" name="q${i}" value="b">B、答案B</label></td></tr></table>`).join('');
  const { api } = boot(tables, 'https://cme28.91huayi.com/pages/exam.aspx?cwid=x');
  const questions = api.parseExam();
  assert.equal(questions.length, 5);
  assert.equal(questions[0].options.length, 2);
});

test('真实验证题库按题干文本匹配', () => {
  const { api } = boot('');
  assert.equal(api.verifiedAnswer('对于老年T2D患者（≥65岁），核心管理目标导向是？'), '摒弃单纯追求体重数字下降，将功能改善与生活质量作为核心导向');
  assert.equal(api.verifiedAnswer('重度肥胖合并T2D，其BMI阈值为？'), 'BMI>32.5 kg/m2');
});

test('未知题使用确定性组合且每轮变化', () => {
  const { api } = boot('');
  const questions = [0,1].map(i => ({ question:'普通题'+i, key:'q'+i, options:[{text:'选项A'},{text:'选项B'},{text:'选项C'}] }));
  const first = Array.from(api.chooseAnswers(questions, {attempt:0}), x=>x.text);
  const second = Array.from(api.chooseAnswers(questions, {attempt:1}), x=>x.text);
  assert.notDeepEqual(first, second);
});

test('disabled 与 aria-disabled 均不可用', () => {
  const { api, window } = boot('<button id="a">A</button><button id="b" disabled>B</button><button id="c" aria-disabled="true">C</button>');
  assert.equal(api.enabled(window.document.getElementById('a')), true);
  assert.equal(api.enabled(window.document.getElementById('b')), false);
  assert.equal(api.enabled(window.document.getElementById('c')), false);
});
console.log('v7 DOM 行为测试全部通过');
