const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function boot(url, seed = {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const values = new Map(Object.entries(Object.assign({
    HY7_STATE: { running: true, paused: false, phase: 'idle', logs: [] }
  }, seed)));
  dom.window.GM_getValue = key => values.get(key);
  dom.window.GM_setValue = (key, value) => values.set(key, value);
  dom.window.GM_deleteValue = key => values.delete(key);
  dom.window.eval(script);
  return { dom, window: dom.window, values };
}

(async () => {
  {
    const fixture = boot('https://cme28.91huayi.com/pages/study_info_list.aspx');
    await wait(120);
    fixture.window.document.body.innerHTML = `
      <table><tbody>
        <tr><td>专业课</td><td>2026</td><td>20学分</td><td>已申请</td><td></td><td></td></tr>
        <tr><td>公需课</td><td>2026</td><td>5分</td><td>已申请</td><td></td><td></td></tr>
      </tbody></table>`;
    await wait(850);
    const state = fixture.values.get('HY7_STATE');
    assert.equal(state.credit, 25);
    assert.equal(state.phase, 'done');
    assert.equal(state.running, false);
    fixture.dom.window.close();
    console.log('✅ 学习记录异步渲染后自动恢复');
  }

  {
    const fixture = boot('https://cme28.91huayi.com/pages/course.aspx?cid=delayed');
    await wait(120);
    fixture.window.document.body.innerHTML = `
      <div class="course" data-href="/course_ware/course_ware.aspx?cwid=delayed-one">
        <span class="course-title">延迟课件</span><button>待考试</button>
      </div>`;
    await wait(850);
    const state = fixture.values.get('HY7_STATE');
    assert.equal(state.currentCwid, 'delayed-one');
    assert.equal(state.phase, 'exam');
    fixture.dom.window.close();
    console.log('✅ 课件列表异步渲染后自动恢复');
  }

  {
    const fixture = boot('https://cme28.91huayi.com/pages/exam.aspx?cwid=delayed-exam');
    await wait(120);
    fixture.window.document.body.innerHTML = `
      <table class="tablestyle"><tr><th>1、延迟题目</th></tr>
        <tr><td><label><input type="radio" name="q1">A、选项A</label></td></tr>
        <tr><td><label><input type="radio" name="q1">B、以上都是</label></td></tr>
      </table><button id="btn_submit" type="button">提交</button>`;
    await wait(850);
    const state = fixture.values.get('HY7_STATE');
    assert.equal(state.phase, 'exam');
    assert.match(state.message, /正在选择|准备提交/);
    fixture.dom.window.close();
    console.log('✅ 考试题目异步渲染后自动恢复');
  }

  {
    const fixture = boot('https://cme28.91huayi.com/pages/exam_result.aspx?cwid=result-exam', {
      HY7_EXAMS: {
        'result-exam': {
          attempt: 0,
          submitted: { 第一题: '正确答案', 第二题: '错误答案' }
        }
      }
    });
    fixture.window.document.body.innerHTML = `
      <h1>考试未通过</h1>
      <section><div class="state_cour_lis"><img src="/images/bar_img.png"><p title="1、第一题">第一题</p></div><div>【您的答案：B、正确答案】</div></section>
      <section><div class="state_cour_lis"><img src="/images/wrong.png"><p title="2、第二题">第二题</p></div><div>【您的答案：A、错误答案】</div></section>`;
    await wait(500);
    const exams = fixture.values.get('HY7_EXAMS');
    const learned = fixture.values.get('HY7_ANSWERS');
    assert.equal(exams['result-exam'].attempt, 1);
    assert.equal(learned.第一题, '正确答案');
    assert.equal(learned.第二题, undefined);
    fixture.dom.window.close();
    console.log('✅ 未通过结果页学习正确题并推进下一轮');
  }

  console.log('v7 异步加载集成测试全部通过');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
