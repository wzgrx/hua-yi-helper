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

test('问卷安全校验确认后重新提交并等待智能验证', () => {
  const retry = boot(`<form>
    <input type="radio" name="q1" value="1" checked>
    <div id="ctlNext" class="submitbtn">提交</div>
    <a class="layui-layer-btn0">确认</a>
  </form><div>需要安全校验，请重新提交！</div>`, 'https://dcwj.91huayi.com/vm/fixture.aspx', {
    HY8_STATE: { running: true, paused: false, phase: 'survey' }
  });
  let confirmed = 0;
  retry.window.document.querySelector('.layui-layer-btn0').addEventListener('click', event => {
    confirmed++;
    event.currentTarget.remove();
  });
  retry.api.handleSurvey();
  assert.equal(confirmed, 1);
  assert.match(retry.values.get('HY8_STATE').message, /重新提交/);

  const captcha = boot(`<form><div id="ctlNext" class="submitbtn">提交</div></form>
    <div id="aliyunCaptcha-window-popup">请完成安全验证 点击开始智能验证</div>`,
  'https://dcwj.91huayi.com/vm/fixture.aspx', {
    HY8_STATE: { running: true, paused: false, phase: 'survey' }
  });
  captcha.api.handleSurvey();
  assert.match(captcha.values.get('HY8_STATE').message, /浏览器完成问卷安全验证/);
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

test('培训卡缺失后按持久化时间自动复查申请', () => {
  const { api } = boot('');
  const tasks = [{ type: 'apply', record: { url: '/apply', name: '待申请课程' } }];
  const first = api.blockedApplicationDecision(tasks, 0, 1000);
  assert.equal(first.action, 'retry');
  assert.equal(first.task.record.name, '待申请课程');
  assert.equal(first.retryAt, 1801000);
  const waiting = api.blockedApplicationDecision(tasks, first.retryAt, 2000);
  assert.equal(waiting.action, 'wait');
  assert.equal(waiting.waitMs, 1799000);
  const due = api.blockedApplicationDecision(tasks, first.retryAt, 1801001);
  assert.equal(due.action, 'retry');
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
  assert.equal(api.verifiedAnswer('以下哪项属于阿尔茨海默病（AD）的致病基因？'), 'APP 基因');
  assert.equal(api.verifiedAnswer('Aβ 的主要清除部位是?'), '脑部');
  assert.equal(api.verifiedAnswer('认知障碍自评量表（AD8）的评分标准中，提示需进一步临床评估的总分阈值是？'), '≥2 分');
  assert.equal(api.verifiedAnswer('MES量表主要涵盖哪两个认知域的评估？'), '记忆与执行功能');
  assert.equal(api.verifiedAnswer('在痴呆的神经心理学评估中，用于评估患者情景记忆的常用测验是？'), '韦氏记忆量表个人经历分测验');
  assert.equal(api.verifiedAnswer('关于简易精神状态检查（MMSE）的缺点，下列说法错误的是？'), '不受教育程度影响');
  assert.equal(api.verifiedAnswer('以下哪项是评估痴呆患者精神行为症状的常用量表？'), 'NPI');
  assert.equal(api.verifiedAnswer('以下哪种量表主要用于评估痴呆患者的日常生活功能？'), 'ADL');
  assert.equal(api.verifiedAnswer('在痴呆诊疗中，用于评估患者总体退化程度的量表是？'), 'GDS');
  assert.equal(api.verifiedAnswer('在结构影像学检查中，对于痴呆诊断首选的检查手段是？'), 'MRI');
  assert.equal(api.verifiedAnswer('在常见认知障碍疾病的临床特点对比中，路易体痴呆（DLB）的典型运动症状是？'), '帕金森征（行动迟缓，步态异常）');
  assert.equal(api.verifiedAnswer('在病史采集中，以下哪项属于“精神行为”方面的评估内容？'), '抑郁和焦虑、幻觉和妄想');
  assert.equal(api.verifiedAnswer('在FDG PET显像中，典型的阿尔茨海默病（AD）代谢模式是？'), '枕顶叶为主，额叶其次');
  assert.equal(api.verifiedAnswer('关于基因检测的推荐意见，以下哪项是正确的？'), '有明确痴呆家族史的患者应进行基因检测（A级推荐）');
  assert.equal(api.verifiedAnswer('以下哪种疾病不属于变性性认知障碍？'), '血管性痴呆（VaD）');
  assert.equal(api.verifiedAnswer('阿尔茨海默病的典型病理改变不包括以下哪项？'), '路易小体');
  assert.equal(api.verifiedAnswer('关于认知障碍的病因分类，以下哪项描述符合变性性认知障碍的特点？'), '隐匿起病，进行性加重，症状不可逆');
  assert.equal(api.verifiedAnswer('在辅助检查中，SWI（磁敏感加权成像）主要用于明确？'), '微出血');
  assert.equal(api.verifiedAnswer('关于AD血液生物标志物，以下哪项描述是正确的？'), '家族性AD患者血浆总Aβ或Aβ42水平增高');
  assert.equal(api.verifiedAnswer('中国2020年AD痴呆诊疗指南中，AD痴呆临床分级的金标准是？'), '临床痴呆评定量表（CDR）');
  assert.equal(api.verifiedAnswer('2024年IWG-4标准中，将认知功能正常但具有特定生物标志物模式的个体定义为？'), 'AD高风险人群');
  assert.equal(api.verifiedAnswer('根据2014年IWG-2标准，阿尔茨海默病（AD）相关的生物标志物被明确分为哪两类？'), '诊断性标志物和进展性标志物');
  assert.equal(api.verifiedAnswer('2007年IWG-1标准中，诊断可能的AD的核心要求是？'), '早期显著情景记忆损伤+至少1项支持性特征');
  assert.equal(api.verifiedAnswer('关于AD诊断中生物标志物的应用原则，以下哪项是错误的？'), '生物标志物阳性即可确诊AD，无需结合临床症状');
  assert.equal(api.verifiedAnswer('以下哪项是AD的特征性萎缩表现，对早发型AD尤为重要？'), '楔前叶+顶叶萎缩');
  assert.equal(api.verifiedAnswer('进行内侧颞叶萎缩评估（MTA）的标准影像学层面为？'), '冠状位 T1WI，脑桥前面水平通过海马体部层面');
  assert.equal(api.verifiedAnswer('阿尔茨海默病（AD）患者在功能性磁共振成像（fMRI）检查中实施学习和回忆任务时的典型表现为？'), '额叶前区和颞叶内侧皮质激活区域缩小，信号强度降低');
  assert.equal(api.verifiedAnswer('AD患者在磁共振波谱成像（MRS）检查中最早期的波谱变化为？'), 'NAA/Cr 比值降低，MI/Cr 比值升高');
  assert.equal(api.verifiedAnswer('磁共振波谱成像（MRS）中AD最早期的波谱变化为？'), 'NAA/Cr 比值降低，MI/Cr 比值升高');
  assert.equal(api.verifiedAnswer('关于肝性脑病，下列说法不正确的是？'), '前期出现昏迷');
  assert.equal(api.verifiedAnswer('自身免疫性脑炎（AE）导致的认知障碍通常伴随下列哪组症状？'), '癫痫、精神障碍');
  assert.equal(api.verifiedAnswer('关于血管性认知障碍（VCI）的Newcastle分型，下列哪项描述正确？'), 'VI型指伴AD的脑血管病变');
  assert.equal(api.verifiedAnswer('根据NIA-AA 2011版诊断标准，下列哪项不属于“很可能的AD痴呆”核心临床标准中的早期突出认知损害表现？'), '早期即出现显著的人格改变和行为异常');
  assert.equal(api.verifiedAnswer('关于行为变异型额颞叶痴呆，不属于核心临床表现-行为症状的是？'), '找词困难和命名障碍');
  assert.equal(api.verifiedAnswer('AD临床症状出现前β淀粉样蛋白（Aβ）开始沉积的时间为？'), '10~20年');
  assert.equal(api.verifiedAnswer('导致血浆AD生物标志物检测存在挑战的因素不包括？'), '单一样本可检测多项标志物');
  assert.equal(api.verifiedAnswer('与神经轴索变性和损伤相关的新型体液生物标志物是？'), '神经丝轻链（NfL）');
  assert.equal(api.verifiedAnswer('脑脊液标本处理中，受检测前因素影响最大的标志物是？'), 'Aβ42');
  assert.equal(api.verifiedAnswer('相较于PET影像，脑脊液生物标志物的优势不包括？'), '无创性检测');
  assert.equal(api.verifiedAnswer('典型AD患者最早出现的临床症状是哪种记忆障碍？'), '情景记忆障碍');
  assert.equal(api.verifiedAnswer('AD脑结构变化的典型特点是？'), '早期海马萎缩，晚期全脑萎缩');
  assert.equal(api.verifiedAnswer('AD临床症状的ABC分类中，A代表的是？'), '日常生活能力受损');
  assert.equal(api.verifiedAnswer('诊断AD源性SCD的核心条件不包括？'), 'AD生物标志物阴性');
  assert.equal(api.verifiedAnswer('失读的病变部位主要是？'), '顶下小叶的缘上回和角回');
  assert.equal(api.verifiedAnswer('以下关于 BPSD 的定义描述正确的是？'), '认知障碍患者经常出现的紊乱的感知觉、思维内容、心境和行为症状');
  assert.equal(api.verifiedAnswer('单一出现时，需与颞叶癫痫或颞叶器质性损害鉴别的幻觉类型是？'), '幻嗅');
  assert.equal(api.verifiedAnswer('在智能障碍基础上出现的与周围环境不协调的愉快体验，表情单调刻板的是？'), '欣快');
  assert.equal(api.verifiedAnswer('以下哪项不是 BPSD 造成的不良后果？'), '减慢痴呆患者认知功能下降速度');
  assert.equal(api.verifiedAnswer('以下不属于 AD 患者精神病性症状的是？'), '抑郁');
  assert.equal(api.verifiedAnswer('以下哪项不属于BPSD中的睡眠障碍类型？'), '易激惹');
  assert.equal(api.verifiedAnswer('以下哪项属于BPSD早期识别量表？'), '神经精神问卷（NPI）');
  assert.equal(api.verifiedAnswer('诊治BPSD的价值不包括？'), '与认知障碍及日常生活能力下降互不影响');
  assert.equal(api.verifiedAnswer('痴呆临床表现的ABC症状中，A代表的是？'), '日常生活能力下降');
  assert.equal(api.verifiedAnswer('路易体痴呆（DLB）的BPSD核心特点是？'), '幻觉早而明显');
  assert.equal(api.verifiedAnswer('以下属于激越中言语攻击性行为的是？'), '发出怪声');
  assert.equal(api.verifiedAnswer('关于BPSD的临床特点，以下表述错误的是？'), '精神症状仅在痴呆中晚期出现');
  assert.equal(api.verifiedAnswer('以下属于激越中身体非攻击性行为的是？'), '不恰当的处理事情');
  assert.equal(api.verifiedAnswer('美金刚显著预防AD患者以下哪项BPSD症状的发生？'), '激越/攻击');
  assert.equal(api.verifiedAnswer('AD患者激越发生率随CDR分期变化的趋势是？'), '逐渐升高');
  assert.equal(api.verifiedAnswer('AD疾病修饰疗法（DMT）的核心目的是？'), '阻断或延缓疾病的进展');
  assert.equal(api.verifiedAnswer('用于AD患者睡眠障碍治疗，可增强脑内γ-氨基丁酸与受体结合的药物是？'), '地西泮');
  assert.equal(api.verifiedAnswer('国内指南指出，AD伴发精神行为症状的药物干预核心原则为？'), '抗痴呆治疗为基本，必要时使用精神药物');
  assert.equal(api.verifiedAnswer('《中国阿尔茨海默病痴呆诊疗指南（2020年版）》指出AD药物治疗的核心原则不包括？'), '根治疾病');
  assert.equal(api.verifiedAnswer('属于强效高选择性5-羟色胺（5-HT）再摄取抑制剂的AD治疗药物是？'), '帕罗西汀');
  assert.equal(api.verifiedAnswer('BPSD临床管理的DICE过程不包括以下哪项？'), '药物干预');
  assert.equal(api.verifiedAnswer('关于BPSD诊治的误区，说法错误的是？'), '重视社会心理干预的核心作用');
  assert.equal(api.verifiedAnswer('经颅直流电刺激（tDCS）的阳极刺激作用是？'), '增强刺激部位神经元的兴奋性');
  assert.equal(api.verifiedAnswer('下列哪项不属于AD的脑相关危险因素？'), '2型糖尿病');
  assert.equal(api.verifiedAnswer('体育锻炼对AD患者BPSD的影响是？'), '显著改善抑郁症状，整体BPSD无显著改善');
  assert.equal(api.verifiedAnswer('关于AD治疗药物的用药安全，以下哪项是正确的？'), '多奈哌齐若出现肝肾功能损害，应考虑减量或停药');
  assert.equal(api.verifiedAnswer('共病管理模式的要素不包括以下哪项？'), '完全依赖社区志愿者管理');
  assert.equal(api.verifiedAnswer('在AD与房颤的关系中，以下哪项是两者共有的风险因素？'), '甲状腺功能亢进');
  assert.equal(api.verifiedAnswer('关于 AD 患者共病的流行病学特点，说法正确的是？'), '65 岁以上老年痴呆患者共病发生率更高');
  assert.equal(api.verifiedAnswer('关于阻塞性睡眠呼吸暂停（OSA）对AD的影响，以下哪项错误？'), 'AD患者对CPAP治疗的耐受性极好');
  assert.equal(api.verifiedOptionKey('在 ad 与房颤的关系中，以下哪项是两者共有的风险因素？'), 'C');
  assert.equal(api.verifiedAnswer('阿尔茨海默病全病程管理的核心是？'), '以单个病人为中心的照护模式');
  assert.equal(api.verifiedOptionKey('阿尔茨海默病全病程管理的核心是？'), 'B');
  assert.equal(api.verifiedAnswer('下列哪一项不是ARDS的评估工具（ ）'), 'GCS昏迷评分');
  assert.equal(api.verifiedOptionKey('下列哪一项不是ARDS的评估工具（ ）'), 'C');
  assert.equal(api.verifiedAnswer('ARDS患者早期最常见的病理生理改变是（ ）'), '肺泡水肿');
  assert.equal(api.verifiedOptionKey('ARDS患者早期最常见的病理生理改变是（ ）'), 'B');
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

test('全量已知答案生成稳定签名且未知题不生成签名', () => {
  const { api } = boot('');
  const known = [{
    question: '以下哪种量表主要用于评估痴呆患者的日常生活功能？',
    key: 'known-adl',
    options: [{ text: 'ADL' }, { text: 'NPI' }]
  }];
  const choices = api.chooseAnswers(known, { attempt: 99 });
  assert.equal(choices[0].text, 'ADL');
  assert(api.fixedAnswerSignature(known, choices).includes('known-adl=adl'));
  const unknown = [{ question: '未知题', key: 'unknown', options: [{ text: 'A' }, { text: 'B' }] }];
  assert.equal(api.fixedAnswerSignature(unknown, api.chooseAnswers(unknown, { attempt: 0 })), '');
});

test('结果判错后排除旧答案并缩小组合空间', () => {
  const questions = [{
    question: '已知题',
    key: 'known',
    options: [{ text: '旧答案' }, { text: '新答案' }]
  }];
  const { api } = boot('', undefined, { HY8_ANSWERS: { known: '旧答案' } });
  const examState = { attempt: 0, rejected: { known: ['旧答案'] } };
  const choices = api.chooseAnswers(questions, examState);
  assert.equal(choices[0].text, '新答案');
  assert.equal(api.fixedAnswerSignature(questions, choices, examState), '');
  assert.equal(api.answerCombinationCount(questions, examState), 1);
});

test('重复答案文本按选项字母区分，排除B后仍可选择C', () => {
  const questions = [{
    question: '房颤共有风险因素',
    key: 'duplicate-option',
    options: [
      { text: '低血压', optionKey: 'A' },
      { text: '甲状腺功能亢进', optionKey: 'B' },
      { text: '甲状腺功能亢进', optionKey: 'C' },
      { text: '低血糖', optionKey: 'D' }
    ]
  }];
  const { api } = boot('', undefined, {
    HY8_ANSWERS: { 'duplicate-option': '甲状腺功能亢进' },
    HY8_ANSWER_OPTIONS: { 'duplicate-option': 'C' }
  });
  const examState = { attempt: 0, rejected: { 'duplicate-option': ['option:B'] } };
  const choices = api.chooseAnswers(questions, examState);
  assert.equal(choices[0].optionKey, 'C');
  assert.equal(api.answerCombinationCount(questions, examState), 1);
  assert(api.fixedAnswerSignature(questions, choices, examState).includes('@C'));
});

test('全新题库直接使用站点验证的重复文本选项字母', () => {
  const question = '在AD与房颤的关系中，以下哪项是两者共有的风险因素？';
  const questions = [{
    question,
    key: 'verified-duplicate',
    options: [
      { text: '低血压', optionKey: 'A' },
      { text: '甲状腺功能亢进', optionKey: 'B' },
      { text: '甲状腺功能亢进', optionKey: 'C' },
      { text: '低血糖', optionKey: 'D' },
      { text: '贫血', optionKey: 'E' }
    ]
  }];
  const { api } = boot('');
  const choices = api.chooseAnswers(questions, { attempt: 0 });
  assert.equal(choices[0].optionKey, 'C');
  assert.equal(api.answerCombinationCount(questions, {}), 1);
  assert(api.fixedAnswerSignature(questions, choices, {}).includes('@C'));
});

test('结果页仅学习判定正确的题目', () => {
  const { api, values } = boot(`
    <section><div class="state_cour_lis"><img src="/images/bar_img.png"><p title="1、第一题">第一题</p></div><div>【您的答案：B、正确答案】</div></section>
    <section><div class="state_cour_lis"><img src="/images/wrong.png"><p title="2、第二题">第二题</p></div><div>【您的答案：A、错误答案】</div></section>
  `, 'https://cme28.91huayi.com/pages/exam_result.aspx?cwid=x');
  const records = api.parseResultAnswers({ 第一题: '正确答案', 第二题: '错误答案' });
  assert.equal(records.length, 2);
  assert.deepEqual(Array.from(records, item => item.correct), [true, false]);
  assert.deepEqual(Array.from(records, item => item.optionKey), ['B', 'A']);
  assert.equal(api.saveLearnedAnswers(records), 1);
  const learned = values.get('HY8_ANSWERS');
  assert.equal(learned[records[0].key], '正确答案');
  assert.equal(learned[records[1].key], undefined);
  assert.equal(values.get('HY8_ANSWER_OPTIONS')[records[0].key], 'B');
  const examState = {};
  assert.equal(api.saveRejectedAnswers(records, examState), 1);
  assert.equal(examState.rejected[records[1].key][0], 'option:A');
  assert.equal(api.saveRejectedAnswers(records, examState), 0);
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
  assert.deepEqual(Array.from(records, item => item.optionKey), ['B', 'D']);
  assert.deepEqual(Array.from(records, item => item.correct), [true, false]);
});

test('考试通过后将本轮全部提交答案写入题库', () => {
  const { api, values } = boot('');
  assert.equal(api.savePassedAnswers(
    { question_one: '答案甲', question_two: '答案乙' },
    { question_one: 'B', question_two: 'D' }
  ), 2);
  assert.deepEqual(values.get('HY8_ANSWERS'), {
    question_one: '答案甲',
    question_two: '答案乙'
  });
  assert.deepEqual(values.get('HY8_ANSWER_OPTIONS'), {
    question_one: 'B',
    question_two: 'D'
  });
});

test('考试通过结果页识别新版立即学习入口', () => {
  const { api } = boot('<ul class="state_cour_ul"><li><p>下一课件</p><input class="state_lis_han" type="button" value="立即学习"></li></ul>',
    'https://cme28.91huayi.com/pages/exam_result.aspx?cwid=x');
  const next = api.findResultNextAction();
  assert(next);
  assert.equal(next.value, '立即学习');
});

test('互动病例完成回跳页等待问卷而不是按普通考试结果停止', () => {
  const { api } = boot('<main>互动病例学习记录处理中</main>',
    'https://cme28.91huayi.com/pages/exam_result_hd.aspx', {
      HY8_STATE: { running: false, currentCwid: 'interactive-one' }
    });
  assert.equal(api.isInteractiveCompletionResult('互动病例学习记录处理中', { submitted: {} }), true);
  assert.equal(api.isInteractiveCompletionResult('考试通过', { submitted: {} }), false);
  assert.equal(api.isInteractiveCompletionResult('处理中', { submitted: { q: 'A' } }), false);
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

test('互动病例单选题先选答案再提交并识别站点验证答案', () => {
  const page = boot(`<main>
    <span class="question-text">2型糖尿病防治指南中，除血糖和糖化血红蛋白的达标外，理想血压是（）</span>
    <div class="option-content"><span class="option-label">A. </span><span class="option-text">＜140/90mmHg</span></div>
    <div class="option-content"><span class="option-label">B. </span><span class="option-text">＜130/80mmHg</span></div>
    <div class="option-content"><span class="option-label">C. </span><span class="option-text">＜150/90mmHg</span></div>
    <div class="problem-page-right click-active">提交</div>
  </main>`, 'https://hdbl.91huayi.com/?x=1#/problem/question');
  const quiz = page.api.parseCaseQuestion();
  assert(quiz);
  assert.equal(quiz.options.length, 3);
  assert.equal(page.api.chooseCaseQuestionOption(quiz).optionKey, 'B');
  const choose = page.api.findCaseQuestionAction(quiz);
  assert.equal(choose.kind, 'case-option');
  assert.equal(choose.optionKey, 'B');
  page.window.__HY8_CASE_SELECTION = { key: quiz.key, optionKey: 'B', at: Date.now() };
  const submit = page.api.findCaseQuestionAction(page.api.parseCaseQuestion());
  assert.equal(submit.kind, 'case-submit');
  assert.equal(submit.text, '提交');
});

test('互动病例结果页学习参考答案并继续下一页', () => {
  const page = boot(`<main>
    <span class="question-text">病例验证题</span>
    <div class="option-content"><span>A. </span><span>答案甲</span></div>
    <div class="option-content"><span>B. </span><span>答案乙</span></div>
    <div>错误! 参考答案: B</div>
    <div class="problem-page-right click-active">下一页</div>
  </main>`, 'https://hdbl.91huayi.com/?x=1#/problem/question');
  const quiz = page.api.parseCaseQuestion();
  assert.equal(quiz.result, true);
  assert.equal(quiz.referenceOptionKey, 'B');
  assert.equal(page.api.learnCaseQuestionResult(quiz), 1);
  assert.equal(page.values.get('HY8_ANSWERS')[quiz.key], '答案乙');
  const action = page.api.findCaseAction();
  assert(action);
  assert.equal(action.text, '下一页');
});

test('互动病例原生视频暂停时优先播放而不是跳到下一页', () => {
  const page = boot(`<main>
    <video class="pv-video"></video>
    <span class="pv-icon-btn-play"></span>
    <div class="problem-page-right click-active">下一页</div>
  </main>`, 'https://hdbl.91huayi.com/?x=1#/problem/view');
  const media = page.window.document.querySelector('video');
  Object.defineProperty(media, 'duration', { configurable: true, value: 253.48 });
  Object.defineProperty(media, 'currentTime', { configurable: true, value: 0 });
  Object.defineProperty(media, 'paused', { configurable: true, value: true });
  Object.defineProperty(media, 'ended', { configurable: true, value: false });
  const status = page.api.caseVideoStatus();
  assert.equal(status.active, true);
  assert.equal(status.paused, true);
  const action = page.api.findCaseAction();
  assert(action);
  assert.equal(action.kind, 'case-video-play');
  assert.equal(action.text, '播放病例视频');
});

test('互动病例视频结束后保留完成记忆避免被播放器自动重播', () => {
  const page = boot(`<main>
    <video class="pv-video"></video>
    <span class="pv-icon-btn-play"></span>
    <div class="problem-page-right click-active">下一页</div>
  </main>`, 'https://hdbl.91huayi.com/?x=1#/problem/view?catalogId=finished');
  const media = page.window.document.querySelector('video');
  Object.defineProperty(media, 'duration', { configurable: true, value: 201.62 });
  Object.defineProperty(media, 'currentTime', { configurable: true, writable: true, value: 201.60 });
  Object.defineProperty(media, 'paused', { configurable: true, value: true });
  Object.defineProperty(media, 'ended', { configurable: true, value: false });
  assert.equal(page.api.caseVideoStatus().done, true);
  media.currentTime = 0;
  assert.equal(page.api.caseVideoStatus().done, true);
  const action = page.api.findCaseAction();
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
