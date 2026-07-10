// ==UserScript==
// @name         华医网学习助手 v6
// @namespace    https://github.com/wzgrx/hua-yi-helper
// @version      7.0.0
// @description  基于2026真实页面重写的华医网学习流程助手：课程、原生播放、考试、证书与断点恢复
// @author       wzgrx
// @license      AGPL-3.0
// @match        *://*.91huayi.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_info
// @run-at       document-start
// @noframes
// @downloadURL  https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js?v=7.0.0
// @updateURL    https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js?v=7.0.0
// @supportURL   https://github.com/wzgrx/hua-yi-helper/issues
// ==/UserScript==

(function () {
  'use strict';

  var VERSION = '7.0.0';
  var STATE_KEY = 'HY7_STATE';
  var ANSWER_KEY = 'HY7_ANSWERS';
  var EXAM_KEY = 'HY7_EXAMS';
  var TARGET = 25;

  function read(key, fallback) {
    try { var value = GM_getValue(key); return value === undefined || value === null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function write(key, value) { try { GM_setValue(key, value); } catch (_) {} }
  function remove(key) { try { GM_deleteValue(key); } catch (_) {} }
  function now() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function normalize(value) {
    return clean(value).replace(/^\d+[、.．)\]\s]+/, '').replace(/m²/g, 'm2').replace(/[，,。；;：:\s]/g, '').toLowerCase();
  }
  function absolute(url) {
    try { return new URL(url, location.href).href; } catch (_) { return url || ''; }
  }
  function queryParam(name, url) {
    try { return new URL(url || location.href).searchParams.get(name) || ''; } catch (_) { return ''; }
  }
  function navigate(url) {
    if (!url) return;
    var target = absolute(url);
    if (target === location.href) return;
    location.assign(target);
  }
  function visible(element) {
    if (!element) return false;
    var style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }
  function enabled(element) {
    if (!element || !visible(element)) return false;
    return !element.disabled && !element.hasAttribute('disabled') &&
      clean(element.getAttribute('aria-disabled')).toLowerCase() !== 'true' &&
      !/(^|\s)(disabled|is-disabled)(\s|$)/i.test(String(element.className || ''));
  }

  function defaultState() {
    return {
      running: !!read('HY_Running', false), paused: false, phase: 'idle',
      message: '就绪', credit: 0, currentCourseUrl: '', currentCourseName: '',
      currentCwid: '', lastRoute: '', lastActionAt: 0, logs: []
    };
  }
  var state = Object.assign(defaultState(), read(STATE_KEY, {}));
  function saveState() { state.lastActionAt = Date.now(); write(STATE_KEY, state); }
  function setState(patch) { Object.assign(state, patch || {}); saveState(); render(); }
  function log(message) {
    var line = now() + ' ' + message;
    state.logs = (state.logs || []).concat(line).slice(-80);
    saveState();
    try { console.log('[HY7] ' + line); } catch (_) {}
    render();
  }

  function route() {
    var host = location.hostname.toLowerCase();
    var path = location.pathname.toLowerCase();
    if (host.indexOf('dcwj.') === 0) return 'survey';
    if (host.indexOf('hdbl.') === 0) return 'case';
    if (/\/secure\/login/.test(path)) return 'login';
    if (/study_info_list\.aspx$/.test(path)) return 'study';
    if (/apply_certificate(?:_top)?\.aspx$/.test(path)) return 'certificate';
    if (/card_select\.aspx$/.test(path)) return 'card';
    if (/exam_result(?:_hd)?\.aspx$/.test(path)) return 'result';
    if (/exam(?:_code)?\.aspx$/.test(path)) return 'exam';
    if (/course_ware_(?:polyv|cc)\.aspx$/.test(path)) return 'player';
    if (/\/pages\/course\.aspx$/.test(path) && queryParam('cid')) return 'course';
    if (/\/cme\/(?:index|fme)/.test(path) || /\/pages\/(?:cme|fme)\.aspx$/.test(path)) return 'catalog';
    return 'other';
  }

  var hostNode = null;
  var shadow = null;
  function createUI() {
    if (route() === 'player' || hostNode || !document.body) return;
    hostNode = document.createElement('div');
    hostNode.id = 'HY7_HOST';
    hostNode.style.cssText = 'all:initial;position:fixed;top:14px;right:14px;z-index:2147483647;';
    shadow = hostNode.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>' +
      ':host{all:initial}.box{width:280px;max-width:calc(100vw - 28px);font:13px/1.45 "Microsoft YaHei",sans-serif;color:#e8eef7;background:#172033;border:1px solid #34445f;border-radius:12px;box-shadow:0 12px 36px #0007;overflow:hidden}' +
      '.head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1f5f99;font-weight:700}.head button{width:28px}.body{padding:10px}.row{display:flex;gap:7px;align-items:center;margin:6px 0}.grow{flex:1}.badge{padding:2px 7px;border-radius:999px;background:#263650;color:#9fd1ff}.meter{height:7px;border-radius:9px;background:#263650;overflow:hidden}.bar{height:100%;background:#29b67a}.msg{min-height:36px;color:#dbe7f7}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}button{box-sizing:border-box;border:0;border-radius:7px;padding:8px;background:#2b6da8;color:white;font:inherit;cursor:pointer}button.pause{background:#a64040}button.secondary{background:#40516c}.log{display:none;max-height:180px;overflow:auto;margin-top:8px;padding:7px;background:#0e1522;color:#8ee79f;border-radius:7px;font:11px/1.45 Consolas,monospace;white-space:pre-wrap}.collapsed .body{display:none}' +
      '</style><section class="box"><header class="head"><span id="title">华医助手 v' + VERSION + '</span><button id="fold" type="button">−</button></header>' +
      '<div class="body"><div class="row"><span id="status" class="badge">就绪</span><span class="grow"></span><strong id="credit">0/' + TARGET + '分</strong></div>' +
      '<div class="meter"><div id="bar" class="bar" style="width:0%"></div></div><div id="message" class="msg"></div>' +
      '<div class="actions"><button id="start" type="button">开始/继续</button><button id="pause" class="pause" type="button">暂停</button><button id="records" class="secondary" type="button">学习记录</button><button id="showlog" class="secondary" type="button">日志</button></div>' +
      '<div id="log" class="log"></div></div></section>';
    document.body.appendChild(hostNode);
    shadow.getElementById('fold').addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation();
      var box = shadow.querySelector('.box'); box.classList.toggle('collapsed');
      this.textContent = box.classList.contains('collapsed') ? '+' : '−';
    });
    shadow.getElementById('start').addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation();
      setState({ running: true, paused: false, message: '正在恢复流程' });
      runRoute(true);
    });
    shadow.getElementById('pause').addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation();
      setState({ running: false, paused: true, phase: 'paused', message: '已暂停' });
      if (window.__HY7_TIMER) clearInterval(window.__HY7_TIMER);
    });
    shadow.getElementById('records').addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation(); navigate('/pages/study_info_list.aspx');
    });
    shadow.getElementById('showlog').addEventListener('click', function (event) {
      event.preventDefault(); event.stopPropagation();
      var area = shadow.getElementById('log'); area.style.display = area.style.display === 'block' ? 'none' : 'block';
    });
    render();
  }
  function render() {
    if (!shadow) return;
    var status = state.paused ? '已暂停' : (state.running ? '运行中' : '就绪');
    shadow.getElementById('status').textContent = status;
    shadow.getElementById('credit').textContent = Number(state.credit || 0) + '/' + TARGET + '分';
    shadow.getElementById('bar').style.width = Math.min(100, Number(state.credit || 0) / TARGET * 100) + '%';
    shadow.getElementById('message').textContent = state.message || '';
    shadow.getElementById('log').textContent = (state.logs || []).join('\n');
  }

  function extractActionUrl(element) {
    if (!element) return '';
    if (element.href && !/^javascript:/i.test(element.href)) return element.href;
    var raw = element.getAttribute('onclick') || '';
    var match = raw.match(/(?:window\.open|location(?:\.href)?\s*=)\s*\(?\s*['"]([^'"]+)/i);
    return match ? absolute(match[1]) : '';
  }

  function scanStudy() {
    var rows = Array.from(document.querySelectorAll('table tbody tr'));
    var result = { credit: 0, courses: [] };
    rows.forEach(function (row) {
      var cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 6) return;
      var text = clean(row.innerText || row.textContent);
      if (!/2026/.test(text)) return;
      var creditCell = cells.find(function (cell) { return /学分/.test(cell.textContent || ''); });
      var creditMatch = clean(creditCell ? creditCell.textContent : '').match(/(\d+(?:\.\d+)?)\s*学分/);
      var credit = creditMatch ? Number(creditMatch[1]) : 0;
      var status = /已申请/.test(text) ? '已申请' : (/学习完毕/.test(text) ? '学习完毕' : (/学习中/.test(text) ? '学习中' : '未学习'));
      if (status === '已申请') result.credit += credit;
      var link = row.querySelector('a[href*="course.aspx"]');
      var actionCell = cells[cells.length - 1];
      var actionElement = actionCell.querySelector('a,button,input');
      var actionText = clean(actionElement ? (actionElement.value || actionElement.textContent) : actionCell.textContent);
      var url = extractActionUrl(actionElement) || (link ? link.href : '');
      result.courses.push({ name: clean(link ? link.textContent : cells[0].textContent), credit: credit, status: status, action: actionText, url: url });
    });
    return result;
  }

  function handleStudy() {
    var info = scanStudy();
    setState({ credit: info.credit, phase: 'study', message: '已申请 ' + info.credit + ' 分' });
    log('[学习记录] 已申请 ' + info.credit + ' 分，共 ' + info.courses.length + ' 门课程');
    if (!state.running) return;
    if (info.credit >= TARGET) { setState({ running: false, phase: 'done', message: '目标学分已完成' }); return; }
    var task = info.courses.find(function (item) { return /申请证书/.test(item.action); }) ||
      info.courses.find(function (item) { return item.status !== '已申请' && item.url; });
    if (task) {
      setState({ currentCourseUrl: task.url, currentCourseName: task.name, phase: 'course', message: '进入：' + task.name });
      navigate(task.url);
      return;
    }
    setState({ phase: 'catalog', message: '寻找新课程' });
    navigate('/cme/index.html');
  }

  function scanCoursewares() {
    return Array.from(document.querySelectorAll('a.cw-title-link[href*="cwid="],a[href*="course_ware.aspx?cwid="]')).map(function (link) {
      var box = link.closest('.course, tr, [class*="course-item"]') || link.parentElement;
      var text = clean(box ? box.innerText || box.textContent : link.textContent);
      var status = /待考试/.test(text) ? '待考试' : (/已完成/.test(text) ? '已完成' : (/学习中/.test(text) ? '学习中' : (/互动/.test(text) ? '互动' : '未学习')));
      return { name: clean(link.textContent), url: link.href, cwid: queryParam('cwid', link.href), status: status };
    }).filter(function (item, index, all) { return item.cwid && all.findIndex(function (other) { return other.cwid === item.cwid; }) === index; });
  }

  function handleCourse() {
    var items = scanCoursewares();
    log('[课程] 识别到 ' + items.length + ' 个课件');
    if (!state.running || !items.length) return;
    var pending = items.find(function (item) { return item.status === '待考试'; });
    if (pending) {
      setState({ currentCwid: pending.cwid, phase: 'exam', message: '考试：' + pending.name });
      navigate('/pages/exam.aspx?cwid=' + encodeURIComponent(pending.cwid));
      return;
    }
    var next = items.find(function (item) { return item.status !== '已完成'; });
    if (next) {
      setState({ currentCwid: next.cwid, phase: next.status === '互动' ? 'case' : 'player', message: '学习：' + next.name });
      navigate(next.url);
      return;
    }
    setState({ phase: 'study', message: '本项目课件已完成，核验学分' });
    navigate('/pages/study_info_list.aspx');
  }

  function handlePlayer() {
    if (!state.running) return;
    var cwid = queryParam('cwid');
    setState({ currentCwid: cwid || state.currentCwid, phase: 'player', message: '网站原生播放器正常学习中' });
    var count = 0;
    window.__HY7_TIMER = setInterval(function () {
      if (!state.running || state.paused) { clearInterval(window.__HY7_TIMER); return; }
      count++;
      var bodyText = document.body ? document.body.innerText || '' : '';
      if (/系统检测到此浏览器安装了异常插件/.test(bodyText)) {
        clearInterval(window.__HY7_TIMER);
        setState({ running: false, paused: true, phase: 'blocked', message: '播放器检测到其他异常插件' });
        return;
      }
      var exam = document.getElementById('jrks');
      if (cwid && enabled(exam)) {
        clearInterval(window.__HY7_TIMER);
        navigate('/pages/exam.aspx?cwid=' + encodeURIComponent(cwid));
        return;
      }
      if (count >= 43200) { clearInterval(window.__HY7_TIMER); setState({ running: false, message: '播放器观察超时' }); }
    }, 1000);
  }

  var VERIFIED = [
    ['体重正常但存在中心型肥胖', '以减少内脏脂肪沉积为主，更加关注腰围的改变'],
    ['实现长期有效减重的关键', '使能量代谢处于负平衡状态'],
    ['老年T2D患者（≥65岁）', '摒弃单纯追求体重数字下降，将功能改善与生活质量作为核心导向'],
    ['重度肥胖合并T2D，其BMI阈值', 'BMI>32.5 kg/m2'],
    ['MDT）全程管理体系覆盖的三个阶段', '减重期、维持期、预防反弹期']
  ];
  function verifiedAnswer(question) {
    var q = clean(question).replace(/m²/g, 'm2');
    for (var i = 0; i < VERIFIED.length; i++) if (q.indexOf(VERIFIED[i][0]) >= 0) return VERIFIED[i][1];
    return '';
  }
  function scoreOption(question, option) {
    var score = 0;
    var text = clean(option);
    if (/以上都|以上均/.test(text)) score += 20;
    if (/仅|唯一|完全依赖|快速|严格控制|2小时以上/.test(text)) score -= 8;
    if (/功能改善|生活质量|综合|规范|共识|指南|长期|维持|预防/.test(text)) score += 5;
    if (/不正确|错误|不属于|除外/.test(question)) score = -score;
    score += Math.min(4, text.length / 20);
    return score;
  }
  function parseExam() {
    return Array.from(document.querySelectorAll('table.tablestyle')).map(function (table) {
      var questionNode = table.querySelector('th,thead td,tr:first-child td');
      var question = clean(questionNode ? questionNode.textContent : table.textContent);
      var radios = Array.from(table.querySelectorAll('input[type="radio"]'));
      var options = radios.map(function (input) {
        var row = input.closest('tr,td,label') || input.parentElement;
        var text = clean(row ? row.innerText || row.textContent : '');
        text = text.replace(/^[A-E][、.．)\s]*/, '');
        return { input: input, text: text };
      });
      return { question: question, key: normalize(question).slice(0, 100), options: options };
    }).filter(function (item) { return item.options.length > 1; });
  }
  function chooseAnswers(questions, examState) {
    var learned = read(ANSWER_KEY, {});
    var attempt = Number(examState.attempt || 0);
    return questions.map(function (item, index) {
      var known = learned[item.key] || verifiedAnswer(item.question);
      if (known) {
        var nk = normalize(known);
        var exact = item.options.find(function (option) { return normalize(option.text) === nk; });
        if (exact) return exact;
      }
      var ranked = item.options.slice().sort(function (a, b) { return scoreOption(item.question, b.text) - scoreOption(item.question, a.text); });
      var divisor = 1;
      for (var d = 0; d < index; d++) divisor *= Math.max(1, questions[d].options.length);
      return ranked[Math.floor(attempt / divisor) % ranked.length];
    });
  }
  function handleExam() {
    if (!state.running) return;
    var questions = parseExam();
    if (!questions.length) { log('[考试] 未识别到题目，停止自动提交'); setState({ running: false, message: '未识别到考试题目' }); return; }
    var cwid = queryParam('cwid') || state.currentCwid;
    var exams = read(EXAM_KEY, {});
    var examState = exams[cwid] || { attempt: 0, submitted: {} };
    var choices = chooseAnswers(questions, examState);
    setState({ phase: 'exam', message: '正在选择 ' + questions.length + ' 道题（第' + (examState.attempt + 1) + '次）' });
    choices.forEach(function (choice, index) {
      setTimeout(function () {
        if (!state.running || !choice || !choice.input) return;
        choice.input.click();
        examState.submitted[questions[index].key] = choice.text;
        exams[cwid] = examState; write(EXAM_KEY, exams);
        if (index === choices.length - 1) {
          setState({ message: '已完成 ' + choices.length + ' 道题，准备提交' });
          setTimeout(function () {
            if (!state.running) return;
            var submit = document.getElementById('btn_submit') || Array.from(document.querySelectorAll('input[type="image"],input[type="submit"],button[type="submit"]')).find(enabled);
            if (submit && enabled(submit)) submit.click();
            else { log('[考试] 未找到唯一提交按钮'); setState({ running: false, message: '提交按钮识别失败' }); }
          }, 3500);
        }
      }, 700 + index * 850);
    });
  }

  function parseResultAnswers() {
    var text = document.body ? document.body.innerText || '' : '';
    var blocks = text.split(/(?=\d+[、.])/);
    return blocks.map(function (block) {
      var q = block.match(/^\d+[、.]\s*([^【\n]+)/);
      var a = block.match(/您的答案[：:]\s*[A-E][、.．]\s*([^】\n]+)/);
      return q && a ? { key: normalize(q[1]).slice(0, 100), answer: clean(a[1]) } : null;
    }).filter(Boolean);
  }
  function handleResult() {
    if (!state.running) return;
    var text = document.body ? document.body.innerText || '' : '';
    var cwid = queryParam('cwid') || state.currentCwid;
    var exams = read(EXAM_KEY, {});
    var examState = exams[cwid] || { attempt: 0, submitted: {} };
    if (/考试未通过|未通过/.test(text)) {
      examState.attempt = Number(examState.attempt || 0) + 1;
      parseResultAnswers().forEach(function (entry) { examState.submitted[entry.key] = entry.answer; });
      exams[cwid] = examState; write(EXAM_KEY, exams);
      setState({ phase: 'result', message: '本次未通过，准备第' + (examState.attempt + 1) + '次组合' });
      setTimeout(function () { if (state.running) navigate('/pages/exam.aspx?cwid=' + encodeURIComponent(cwid)); }, 2500);
      return;
    }
    if (/考试通过|已通过|考试合格|完成项目学习可以申请学分/.test(text)) {
      delete exams[cwid]; write(EXAM_KEY, exams);
      setState({ phase: 'course', message: '考试通过，返回项目继续' });
      setTimeout(function () { navigate(state.currentCourseUrl || '/pages/study_info_list.aspx'); }, 1800);
      return;
    }
    setState({ running: false, message: '无法确认考试结果，已停止' });
  }

  function handleCertificate() {
    if (!state.running) return;
    var text = document.body ? document.body.innerText || '' : '';
    if (/申请成功|已申请/.test(text)) { setTimeout(function () { navigate('/pages/study_info_list.aspx'); }, 1000); return; }
    Array.from(document.querySelectorAll('input[type="radio"]')).forEach(function (input) {
      var group = document.querySelectorAll('input[type="radio"][name="' + CSS.escape(input.name) + '"]');
      if (group.length && !Array.from(group).some(function (item) { return item.checked; })) group[0].click();
    });
    Array.from(document.querySelectorAll('textarea')).forEach(function (area) { if (!area.value) area.value = '满意'; });
    var apply = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"],a')).find(function (element) {
      return enabled(element) && /申请|确认/.test(clean(element.value || element.textContent));
    });
    if (apply) { setState({ phase: 'certificate', message: '正在申请证书/学分' }); setTimeout(function () { apply.click(); }, 1200); }
    else { setState({ running: false, message: '未找到证书申请按钮' }); }
  }

  function handleCard() {
    var text = document.body ? document.body.innerText || '' : '';
    if (/可用培训卡\s*\(?0\)?|这里空空的|暂无.*培训卡/.test(text)) setState({ running: false, paused: true, phase: 'card', message: '没有可用培训卡' });
  }

  function handleSurvey() {
    if (!state.running) return;
    var form = document.querySelector('form') || document.body;
    var groups = {};
    Array.from(form.querySelectorAll('input[type="radio"]')).forEach(function (input) { (groups[input.name] || (groups[input.name] = [])).push(input); });
    Object.keys(groups).forEach(function (name) { if (!groups[name].some(function (item) { return item.checked; })) groups[name][0].click(); });
    Array.from(form.querySelectorAll('input[type="checkbox"]')).forEach(function (input) { if (!input.checked) input.click(); });
    Array.from(form.querySelectorAll('select')).forEach(function (select) { if (!select.value && select.options.length > 1) select.selectedIndex = 1; });
    Array.from(form.querySelectorAll('textarea')).forEach(function (area) { if (!area.value) area.value = '无'; });
    var submit = Array.from(form.querySelectorAll('button,input[type="submit"],input[type="button"]')).find(function (element) { return enabled(element) && /提交|完成|下一步/.test(clean(element.value || element.textContent)); });
    if (submit) setTimeout(function () { submit.click(); }, 1200);
  }

  function handleCase() {
    if (!state.running) return;
    window.__HY7_TIMER = setInterval(function () {
      if (!state.running) { clearInterval(window.__HY7_TIMER); return; }
      var candidates = Array.from(document.querySelectorAll('button,a[href],input[type="button"],input[type="submit"],[role="button"]'));
      var action = candidates.find(function (element) {
        var text = clean(element.value || element.textContent);
        return enabled(element) && /^(开始学习|查看病例|下一步|继续|下一页|完成学习|提交)$/.test(text) && !/返回|退出|关闭|取消/.test(text);
      });
      if (action) action.click();
      var text = document.body ? document.body.innerText || '' : '';
      if (/学习完毕|病例完成/.test(text)) { clearInterval(window.__HY7_TIMER); navigate(state.currentCourseUrl || '/pages/study_info_list.aspx'); }
    }, 1300);
  }

  function handleCatalog() {
    if (!state.running) return;
    var cards = Array.from(document.querySelectorAll('.jet_lis,[class*="course-card"],li')).filter(function (card) { return card.querySelector('a[href*="course.aspx?cid="]'); });
    var candidate = cards.map(function (card) { var link = card.querySelector('a[href*="course.aspx?cid="]'); return { name: clean(card.innerText || card.textContent).split(' ')[0], url: link.href }; })[0];
    if (candidate) { setState({ currentCourseUrl: candidate.url, currentCourseName: candidate.name, phase: 'course', message: '选择新课程' }); navigate(candidate.url); }
    else setState({ running: false, message: '课程目录未找到可用课程' });
  }

  function runRoute(force) {
    var current = route();
    state.lastRoute = current; saveState();
    if (current !== 'player') createUI();
    if (!state.running && !force) { render(); return; }
    if (current === 'study') handleStudy();
    else if (current === 'course') handleCourse();
    else if (current === 'player') handlePlayer();
    else if (current === 'exam') handleExam();
    else if (current === 'result') handleResult();
    else if (current === 'certificate') handleCertificate();
    else if (current === 'card') handleCard();
    else if (current === 'survey') handleSurvey();
    else if (current === 'case') handleCase();
    else if (current === 'catalog') handleCatalog();
  }

  function init() { createUI(); runRoute(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 350); }, { once: true });
  else setTimeout(init, 0);

  if (window.__HY_TEST_MODE__) {
    window.__HY7_TEST_API__ = { route: route, scanStudy: scanStudy, scanCoursewares: scanCoursewares, parseExam: parseExam, verifiedAnswer: verifiedAnswer, scoreOption: scoreOption, chooseAnswers: chooseAnswers, enabled: enabled, normalize: normalize };
  }
})();
