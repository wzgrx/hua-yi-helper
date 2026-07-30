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
  return { window: dom.window, api: dom.window.__HY8_TEST_API__, values };
}
function test(name, fn) { fn(); console.log(`✅ ${name}`); }

test('路由识别真实页面', () => {
  assert.equal(boot('', 'https://cme28.91huayi.com/pages/study_info_list.aspx').api.route(), 'study');
  assert.equal(boot('', 'https://cme28.91huayi.com/pages/exam.aspx?cwid=x').api.route(), 'exam');
  assert.equal(boot('', 'https://cme28.91huayi.com/pages/exam_code.aspx?cwid=x').api.route(), 'captcha');
  assert.equal(boot('', 'https://cme28.91huayi.com/course_ware/course_ware_polyv.aspx?cwid=x').api.route(), 'player');
  assert.equal(boot('', 'https://cme28.91huayi.com/course_ware/course_ware.aspx?cwid=x').api.route(), 'player');
  assert.equal(boot('', 'https://cme28.91huayi.com/course_ware/course_list.aspx?cid=x').api.route(), 'course');
});

test('学习记录按公需/其他分别累计已申请学分并提取动作', () => {
  const { api } = boot(`<table><tbody>
    <tr><td><a href="course.aspx?cid=a">公需课</a></td><td>2026</td><td>公需课5分</td><td>已申请</td><td></td><td></td><td>10/10</td><td></td></tr>
    <tr><td><a href="course.aspx?cid=b">专科课</a></td><td>2026</td><td>3学分</td><td>学习中</td><td></td><td></td><td>2/5</td><td><button onclick="location.href='course.aspx?cid=b'">继续学习</button></td></tr>
  </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx');
  const info = api.scanStudy();
  assert.equal(info.credit, 5);
  assert.equal(info.courses.length, 2);
  assert.match(info.courses[1].url, /cid=b/);
  assert.equal(info.summary.publicEarned, 5);
  assert.equal(info.summary.otherEarned, 0);
});

test('学习记录自动切换到策略年度并兼容历史记录无链接结构', () => {
  const { api, window } = boot(`<select><option value="2026" selected>2026</option><option value="2025">2025</option></select>
    <table><tbody>
      <tr><td>【全员】2025年继续医学教育公需课</td><td>宁卫继2025</td><td>必修课 5.0学分</td><td>已申请</td><td></td><td></td><td></td><td></td></tr>
      <tr><td>【全员】专业专项</td><td>卫卫继2025</td><td>市级 20.0学分</td><td>已申请</td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`, 'https://cme28.91huayi.com/pages/study_info_list.aspx', {
      HY8_POLICY: { year: 2025, publicTarget: 5, otherTarget: 20 }
    });
  assert.equal(api.selectStudyYear(), true);
  assert.equal(window.document.querySelector('select').value, '2025');
  const info = api.scanStudy();
  assert.equal(info.ready, true);
  assert.equal(info.summary.publicEarned, 5);
  assert.equal(info.summary.otherEarned, 20);
});

test('课程详情解析真实状态与 cwid', () => {
  const { api } = boot(`<div class="course"><a class="cw-title-link" href="/course_ware/course_ware.aspx?cwid=one">课件一</a><button>已完成</button></div>
  <div class="course"><a class="cw-title-link" href="/course_ware/course_ware.aspx?cwid=two">课件二</a><button>待考试</button></div>
  <div class="course" data-href="/course_ware/course_ware.aspx?cwid=three"><span class="course-title">课件三</span><button>学习中</button></div>`);
  const rows = api.scanCoursewares();
  assert.deepEqual(Array.from(rows, x => [x.cwid, x.status]), [['one','已完成'],['two','待考试'],['three','学习中']]);
});

test('课程详情兼容新版 lis-inside-content 与 h2 onclick', () => {
  const { api } = boot(`<ul>
    <li class="lis-inside-content"><i id="top_play"></i><h2 onclick="toCourse('/course_ware/course_ware_polyv.aspx?cwid=new-one')">新版课件一</h2><button>学习中</button></li>
    <li class="lis-inside-content"><h2 onclick="open('/course_ware/course_ware_cc.aspx?cwid=new-two')">新版课件二</h2><button>待考试</button></li>
    <li class="lis-inside-content" onclick="javascript:window.location.href='/course_ware/course_ware.aspx?cwid=new-three'"><h2>新版课件三</h2><button>未学习</button></li>
  </ul>`);
  const rows = api.scanCoursewares();
  assert.deepEqual(Array.from(rows, item => [item.cwid, item.status]), [
    ['new-one','学习中'],['new-two','待考试'],['new-three','未学习']
  ]);
});

test('课程目录区分公需、继续教育和全员专项候选', () => {
  const publicPage = boot(`<h1>继续医学教育公需课</h1><ul>
    <li class="jet_lis"><a href="/pages/course.aspx?cid=p5">职业素养公需课</a><span>2026 5学分 300分钟</span></li>
  </ul>`, 'https://cme28.91huayi.com/cme/index.html?type=public');
  const publicRows = publicPage.api.scanCatalog();
  assert.equal(publicRows.length, 1);
  assert.equal(publicRows[0].category, 'public');
  assert.equal(publicRows[0].credit, 5);

  const specialPage = boot(`<h1>全员专项</h1><ul>
    <li class="jet_lis"><a href="/pages/course.aspx?cid=s4">专项能力提升</a><span>2026 4学分 4小时</span></li>
  </ul>`, 'https://cme28.91huayi.com/cme/fme');
  const specialRows = specialPage.api.scanCatalog();
  assert.equal(specialRows[0].source, '全员专项');
  assert.equal(specialRows[0].category, 'other');
  assert.equal(specialRows[0].durationMinutes, 240);
});

test('登录页识别最新真实字段与隐藏密码字段', () => {
  const { api } = boot(`<form id="form1">
    <img id="show_type_more" src="/images/ben_img.png">
    <dd id="type_pwd"><span>密码登录</span></dd>
    <input id="txt_user_name" name="txt_user_name">
    <input id="txt_user_pwd" type="text">
    <input id="txt_user_pwd_real" name="txt_user_pwd" type="hidden">
    <input id="txt_img_code" name="txt_img_code">
    <img id="yzm_img" src="/secure/CheckCode.aspx">
    <input id="agree1" type="checkbox">
    <button class="btn_login" type="button">登 录</button>
  </form>`, 'https://cme28.91huayi.com/secure/login.aspx');
  const elements = api.loginElements();
  assert(elements.more && elements.passwordMode);
  assert(elements.username && elements.password && elements.passwordReal);
  assert(elements.captcha && elements.captchaImage && elements.agreement && elements.submit);
});

test('问卷恢复弹窗、隐藏选项、滑块必填和 div 提交入口', () => {
  let resumed = 0;
  const withResume = boot(`<form>
    <input type="radio" name="q1" value="1">
    <div id="ctlNext" class="submitbtn">提交</div>
    <a class="layui-layer-btn0">确认</a>
  </form><div>您之前已经回答了部分题目，是否继续上次回答</div>`,
  'https://dcwj.91huayi.com/vm/fixture.aspx', {
    HY8_STATE: { running: true, paused: false, phase: 'survey' }
  });
  withResume.window.document.querySelector('.layui-layer-btn0').addEventListener('click', event => {
    resumed++;
    event.currentTarget.remove();
  });
  withResume.api.handleSurvey();
  assert(resumed > 0);

  const survey = boot(`<form>
    <span><input type="checkbox" name="q1" value="1" style="display:none"><a class="jqcheck"></a></span>
    <span><input type="radio" name="q2" value="1" style="display:none"><a class="jqradio"></a></span>
    <input type="text" class="ui-slider-input" name="q3" min="0" max="100" value="">
    <div class="field" type="11"><ul>
      <li data-value="1">指南</li><li data-value="2">会议</li><li data-value="3">其他</li>
    </ul></div>
    <div id="ctlNext" class="submitbtn">提交</div>
  </form>`, 'https://dcwj.91huayi.com/vm/fixture.aspx', {
    HY8_STATE: { running: true, paused: false, phase: 'survey' }
  });
  let ranked = 0;
  survey.window.document.querySelectorAll('.field[type="11"] li').forEach(item => {
    item.addEventListener('click', () => { ranked++; item.classList.add('check'); });
  });
  survey.api.handleSurvey();
  assert.equal(survey.window.document.querySelector('input[type="checkbox"]').checked, true);
  assert.equal(survey.window.document.querySelector('input[type="radio"]').checked, true);
  assert.equal(survey.window.document.querySelector('.ui-slider-input').value, '50');
  assert.equal(ranked, 2);
  assert.match(survey.values.get('HY8_STATE').message, /正在提交/);
});

test('考试异常验证码页识别最新输入框、图片与提交按钮', () => {
  const { api } = boot(`<form>
    <img id="imgCheckCode" class="yzm_img" src="/secure/CheckCode.aspx?id=1">
    <input id="txtCheckCode" name="txtCheckCode" type="text">
    <input id="btnYes" name="btnYes" type="submit" value="提交">
  </form>`, 'https://cme28.91huayi.com/pages/exam_code.aspx?cwid=x');
  const elements = api.examCaptchaElements();
  assert.equal(elements.image.id, 'imgCheckCode');
  assert.equal(elements.input.id, 'txtCheckCode');
  assert.equal(elements.submit.id, 'btnYes');
});

test('证书确认页不会把未激活的申请成功步骤当成完成', () => {
  const { api } = boot(`<ul class="step_ul">
    <li class="step_lis lis_have"><p class="step_p">证书确认</p></li>
    <li class="step_lis"><p class="step_p">申请成功</p></li>
  </ul>
  <input type="button" value="不，先不申请">
  <input type="button" class="yes" value="是的，我申请">`,
  'https://cme28.91huayi.com/pages/apply_certificate_top.aspx?cid=x');
  assert.equal(api.certificateSucceeded(), false);
  assert.equal(api.findCertificateApplyAction().value, '是的，我申请');
});

test('证书页仅在申请成功步骤激活后判定完成', () => {
  const { api } = boot(`<ul class="step_ul">
    <li class="step_lis lis_wind"><p class="step_p">证书确认</p></li>
    <li class="step_lis lis_have"><p class="step_p">申请成功</p></li>
  </ul>`, 'https://cme28.91huayi.com/pages/apply_certificate_top.aspx?cid=x');
  assert.equal(api.certificateSucceeded(), true);
});

test('播放器识别新版签到、继续学习提示及原生媒体状态', () => {
  const { api } = boot(`<video></video><div class="study_diaog"><button class="btn_sign">签到</button></div>`,
    'https://cme28.91huayi.com/course_ware/course_ware_polyv.aspx?cwid=x');
  const media = api.playerMediaStatus();
  assert.equal(media.found, true);
  const prompt = api.findPlayerPrompt();
  assert(prompt);
  assert.equal(prompt.text, '签到');
  assert.equal(api.needsTrustedPlayerClick(prompt.element), true);
});

test('播放器兼容新版 page player 桥接进度接口', () => {
  const { api, window } = boot('<main>播放器</main>',
    'https://cme28.91huayi.com/course_ware/course_ware.aspx?cwid=x');
  window.player = {
    j2s_getCurrentTime: () => 59,
    j2s_getDuration: () => 60,
    j2s_resumeVideo: () => {}
  };
  const media = api.playerMediaStatus();
  assert.equal(media.found, true);
  assert.equal(media.current, 59);
  assert.equal(media.duration, 60);
  assert.equal(media.ended, true);
});

test('课堂问答解析、确定性重试与正确答案复用', () => {
  const html = `<div class="pv-ask-modal-wrap">
    <div class="pv-ask-right">课堂题目</div>
    <div class="pv-ask-form">
      <label><input type="radio" name="q" value="A">A、答案甲</label>
      <label><input type="radio" name="q" value="B">B、答案乙</label>
    </div>
    <button class="pv-ask-submit">提交</button>
  </div>`;
  const firstBoot = boot(html);
  const quiz = firstBoot.api.parseClassroomQuiz();
  assert.equal(quiz.question, '课堂题目');
  assert.equal(quiz.options.length, 2);
  assert.equal(firstBoot.api.chooseClassroomOption(quiz, { attempt: 0 }).text, '答案甲');
  assert.equal(firstBoot.api.chooseClassroomOption(quiz, { attempt: 1 }).text, '答案乙');

  const learnedBoot = boot(html, undefined, { HY8_ANSWERS: { 'classroom:课堂题目': '答案乙' } });
  const learnedQuiz = learnedBoot.api.parseClassroomQuiz();
  assert.equal(learnedBoot.api.chooseClassroomOption(learnedQuiz, { attempt: 0 }).text, '答案乙');
});

test('课堂问答结果页识别正确和错误信号', () => {
  const correct = boot('<div class="pv-ask-modal-wrap pv-ask-modal-answer"><div class="pv-ask-right">题目</div><i class="pv-right-icon"></i><button class="pv-ask-skip">继续观看</button></div>');
  assert.equal(correct.api.parseClassroomQuiz().correct, true);
  const wrong = boot('<div class="pv-ask-modal-wrap pv-ask-modal-answer"><div class="pv-ask-right">题目</div><i class="pv-wrong-icon"></i><button class="pv-ask-skip">继续观看</button></div>');
  assert.equal(wrong.api.parseClassroomQuiz().correct, false);
});

test('播放器禁用态 inputstyle2_2 不会提前进入考试', () => {
  const { api, window } = boot('<input id="jrks" class="inputstyle2 inputstyle2_2" value="开始考试">');
  assert.equal(api.enabled(window.document.getElementById('jrks')), false);
});

test('隐藏弹窗中的按钮不会被当作可执行提示', () => {
  const { api } = boot('<div class="study_diaog" style="display:none"><button class="btn_sign">签到</button></div>');
  assert.equal(api.findPlayerPrompt(), null);
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

test('已学习题目不占未知题组合进位', () => {
  const questions = [
    { question:'已知题', key:'known', options:[{text:'固定答案'},{text:'其他答案'}] },
    { question:'未知题', key:'unknown', options:[{text:'选项A'},{text:'选项B'}] }
  ];
  const firstBoot = boot('', undefined, { HY8_ANSWERS: { known: '固定答案' } });
  const first = Array.from(firstBoot.api.chooseAnswers(questions, { attempt: 0 }), x => x.text);
  const second = Array.from(firstBoot.api.chooseAnswers(questions, { attempt: 1 }), x => x.text);
  assert.equal(first[0], '固定答案');
  assert.equal(second[0], '固定答案');
  assert.notEqual(first[1], second[1]);
  assert.equal(firstBoot.api.answerCombinationCount(questions), 2);
});

test('结果页仅学习判定正确的题目', () => {
  const { api, values } = boot(`
    <section><div class="state_cour_lis"><img src="/images/bar_img.png"><p title="1、第一题">第一题</p></div><div>【您的答案：B、正确答案】</div></section>
    <section><div class="state_cour_lis"><img src="/images/wrong.png"><p title="2、第二题">第二题</p></div><div>【您的答案：A、错误答案】</div></section>
  `, 'https://cme28.91huayi.com/pages/exam_result.aspx?cwid=x');
  const records = api.parseResultAnswers({ 第一题: '正确答案', 第二题: '错误答案' });
  assert.equal(records.length, 2);
  assert.deepEqual(Array.from(records, item => item.correct), [true, false]);
  assert.equal(api.saveLearnedAnswers(records), 1);
  const learned = values.get('HY8_ANSWERS');
  assert.equal(learned[records[0].key], '正确答案');
  assert.equal(learned[records[1].key], undefined);
});

test('新版结果列表从每一题自身节点提取答案并保持题答对应', () => {
  const { api } = boot(`<ul class="state_cour_ul">
    <li class="state_cour_lis">
      <img src="/images/images_20221112/bar_img.png" class="state_right">
      <p class="state_lis_text" title="第一题">1、第一题</p>
      <p class="state_lis_text" title="B、第一题正确答案">【您的答案： B、第一题正确答案】</p>
    </li>
    <li class="state_cour_lis">
      <img src="/images/images_20221112/error_icon.png" class="state_error">
      <p class="state_lis_text" title="第二题">2、第二题</p>
      <p class="state_lis_text" title="D、第二题错误答案">【您的答案： D、第二题错误答案】</p>
    </li>
  </ul>`, 'https://cme28.91huayi.com/pages/exam_result.aspx?cwid=x');
  const records = api.parseResultAnswers({});
  assert.deepEqual(Array.from(records, item => item.answer), ['第一题正确答案', '第二题错误答案']);
  assert.deepEqual(Array.from(records, item => item.correct), [true, false]);
});

test('考试通过结果页识别新版立即学习入口', () => {
  const { api } = boot('<ul class="state_cour_ul"><li><p>下一课件</p><input class="state_lis_han" type="button" value="立即学习"></li></ul>',
    'https://cme28.91huayi.com/pages/exam_result.aspx?cwid=x');
  const next = api.findResultNextAction();
  assert(next);
  assert.equal(next.value, '立即学习');
});

test('互动病例能识别普通 div/span 可点击动作', () => {
  const { api, window } = boot('<main><div class=\"case-card\"><div>3小时生死竞速：房颤脑梗患者救治全纪实</div><span class=\"view-case\">查看病例</span></div></main>', 'https://hdbl.91huayi.com/?x=1#/home');
  const action = api.findCaseAction();
  assert(action, '应识别 span 查看病例');
  assert.equal(action.text, '查看病例');
});

test('病例动作过滤返回退出关闭取消类元素', () => {
  const { api } = boot('<button>返回</button><div role=\"button\">查看病例</div><button>关闭</button>', 'https://hdbl.91huayi.com/?x=1#/home');
  const action = api.findCaseAction();
  assert(action, '应找到查看病例');
  assert.equal(action.text, '查看病例');
});

test('互动病例内嵌视频未结束时不允许点击下一页', () => {
  const { api } = boot('<div class=\"dc-view-title\">重点知识</div><div>00:00 / 04:53</div><div class=\"problem-page-right click-active\">下一页</div>', 'https://hdbl.91huayi.com/?x=1#/problem/view');
  const video = api.caseVideoStatus();
  assert.equal(video.active, true);
  assert.equal(video.done, false);
  assert.equal(api.findCaseAction(), null);
});

test('互动病例内嵌视频结束后允许点击下一页', () => {
  const { api } = boot('<div class=\"dc-view-title\">重点知识</div><div>04:53 / 04:53</div><div class=\"problem-page-right click-active\">下一页</div>', 'https://hdbl.91huayi.com/?x=1#/problem/view');
  const video = api.caseVideoStatus();
  assert.equal(video.active, true);
  assert.equal(video.done, true);
  const action = api.findCaseAction();
  assert(action);
  assert.equal(action.text, '下一页');
});

test('新脚本启动时清理旧 HY7 面板并只保留 HY8 面板', () => {
  const { window } = boot('<div id=\"HY7_HOST\"></div><div id=\"HY7_HOST\"></div><main>内容</main>', 'https://hdbl.91huayi.com/?x=1#/home');
  const hosts = window.document.querySelectorAll('#HY8_HOST');
  assert.equal(hosts.length, 1);
  assert.match(hosts[0].shadowRoot.textContent, /华医助手 v8\.\d+\.\d+/);
  assert.equal(window.document.querySelectorAll('#HY7_HOST').length, 0);
});

test('控制面板直接列出年度任务清单', () => {
  const { window } = boot('<main>内容</main>', undefined, {
    HY8_STATE: {
      running: false,
      planTasks: [{ type: 'enroll', name: '公需示例课', credit: 5, source: '继续教育公需课' }],
      logs: []
    }
  });
  const host = window.document.querySelector('#HY8_HOST');
  assert.match(host.shadowRoot.getElementById('plan').textContent, /选课.*公需示例课.*5分.*继续教育公需课/);
});

test('disabled 与 aria-disabled 均不可用', () => {
  const { api, window } = boot('<button id="a">A</button><button id="b" disabled>B</button><button id="c" aria-disabled="true">C</button>');
  assert.equal(api.enabled(window.document.getElementById('a')), true);
  assert.equal(api.enabled(window.document.getElementById('b')), false);
  assert.equal(api.enabled(window.document.getElementById('c')), false);
});
console.log('v8 DOM 行为测试全部通过');
