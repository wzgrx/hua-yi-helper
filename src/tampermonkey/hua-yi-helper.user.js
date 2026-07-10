// ==UserScript==
// @name         华医网学习助手 v6
// @namespace    https://github.com/wzgrx/hua-yi-helper
// @version      6.0.4
// @description  2026 华医网全流程学习自动化：登录、学分规划、课程学习、考试、断点恢复与诊断
// @author       wzgrx | 基于miiky-nerm/hua-yi-helper v2.0.5重构
// @license      AGPL-3.0
// @match        *://*.91huayi.com/*
// @match        *://dcwj.91huayi.com/*
// @match        *://hdbl.91huayi.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_info
// @connect      cdn.jsdelivr.net
// @connect      tessdata.projectnaptha.com
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js?v=6.0.4
// @updateURL    https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js?v=6.0.4
// @supportURL   https://github.com/wzgrx/hua-yi-helper/issues
// ==/UserScript==
/*!
 * 华医网小助手 v3.1 - 全自动智能刷课 & 学分规划
 * ============================================================
 * 完全基于2026年华医网Vue SPA + ASP.NET混合架构真实DOM分析重构
 *
 * ███████ 核心设计 ███████
 * 1. 混合架构适配 - 自动识别Vue SPA(主页面) vs ASP.NET(详情页) 
 * 2. 智能学分规划 - 基于Vue SPA课程卡片数据解析学分/状态
 * 3. 智能Tab管理 - 截获target=_blank避免打开数百标签页
 * 4. 全自动刷课引擎 - 课程列表→课程详情→问卷→视频→考试→下一课
 * 5. 增强反作弊 - 多层拦截+保护
 * 6. 答题模块 - 支持Vue/ASP.NET双格式,不依赖云端API
 *
 * 学分目标: 每年25学分 | 公需课5分(固定) | 其他20分
 * ============================================================
 */

"use strict";



// ═══════════════════════════════════════════════════════════════
// 零号初始化器 (页面加载前执行)
// ═══════════════════════════════════════════════════════════════
(function() {
  // Do not monkey-patch window.open, console, document handlers or DOM APIs.
  // The current player validates page integrity and reports such mutations as
  // an "异常插件". Navigation is handled explicitly by safeNavigate instead.
})();

// ═══════════════════════════════════════════════════════════════
// 主函数入口 - DOMContentLoaded后执行
// ═══════════════════════════════════════════════════════════════
function __HY_main() {
// ═══════════════════════════════════════════════════════════════
// 版本信息
// ═══════════════════════════════════════════════════════════════
var HY_VERSION = "6.0.4";
var HY_UPDATE_DATE = "2026.7.10";
var HY_UPDATE_LOG = "v6.0.4 视频完成判定修复：禁止用页面任意“已完成”文本误判视频结束，避免播放1秒后回跳";
var HY_HISTORY = [
  "v3.1.0 (2026.7.8) - 完全基于真实网站DOM重构:",
  "  · 混合架构: 自动识别Vue SPA(/cme/index) vs ASP.NET(course.aspx)",
  "  · Vue SPA课程解析: 从.jet_ul > li.jet_lis卡片提取课程名/学分/状态",
  "  · ASP.NET详情页: a.f14blue.cw-title-link课件链接解析",
  "  · Tab管理: 截获target=_blank,统一用location.href导航",
  "  · 问卷页自动处理: 检测dcwj.91huayi.com域,自动完成或跳过",
  "  · 新学分规划: 从Vue SPA课程卡片直接解析学分数据",
  "  · 答题模块重构: 支持ASP.NET+混合格式,指纹匹配+智能评分",
  "  · 控制面板重设计: 弹窗级UI,任务列表,实时日志,状态指示",
  "  · 智能分页: 自动翻页扫描全部课程(非仅第1页)",
  "  · 页面路由修正: study_info_list→ASP.NET, fme→Vue SPA",
  "  · 冗余代码清理: 删除所有lis-inside-content/btn67旧逻辑",
  "v3.0.2 (2026.7.8) - 考试模块升级: 指纹识别|文本匹配|防随机化"
];


// ═══════════════════════════════════════════════════════════════
// 1. 配置与存储
// ═══════════════════════════════════════════════════════════════
var CONFIG = {
  targetYear: new Date().getFullYear(),
  targetTotal: 25,
  publicTarget: 5,
  otherTarget: 20,
  mode: 'auto',  // 'video' / 'full' / 'auto' / 'plan'
  speeds: [1, 1.5, 2, 4, 8],
  delays: {
    submitTime: 4900,
    reTryTime: 2100,
    examTime: 5000,
    randomMax: 5000,
    navCooldown: 15000,
    pauseRefresh: 3000,
    surveyWait: 5000,
    afterNav: 3000
  },
  maxTabs: 3,  // 最大同时打开的tab数
  keys: {
    mode: 'HY_mode',
    allAnswers: 'HY_allAnswers',
    rightAnswers: 'HY_rightAnswers',
    currentPlan: 'HY_PlanV2',
    planProgress: 'HY_PlanIdx',
    discoveredCourses: 'HY_Discovered',
    completedCourses: 'HY_Completed',
    running: 'HY_Running',
    paused: 'HY_Paused',
    runtime: 'HY_RuntimeV3',
    credentials: 'HY_CredentialsV1'
  }
};

var Store = {
  g: function(key, def) {
    try {
      if (typeof GM_getValue !== 'undefined') {
        var v = GM_getValue(key);
        return v !== undefined && v !== null ? v : def;
      }
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : def;
    } catch(e) { return def; }
  },
  s: function(key, val) {
    try {
      if (typeof GM_setValue !== 'undefined') { GM_setValue(key, val); return; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch(e) {}
  },
  d: function(key) {
    try {
      if (typeof GM_deleteValue !== 'undefined') { GM_deleteValue(key); return; }
      localStorage.removeItem(key);
    } catch(e) {}
  }
};

// ═══════════════════════════════════════════════════════════════
// 2. 页面类型检测 - 基于真实URL和DOM特征
// ═══════════════════════════════════════════════════════════════
var URL = (function() {
  var href = window.location.href;
  var parts = href.split('/');
  var last = parts[parts.length - 1].split('?')[0].split('#')[0];
  return {
    full: href,
    last: last,
    host: window.location.host,
    // Vue SPA pages (继续教育/全员专项)
    isCMEIndex: href.indexOf('/cme/index') !== -1 || href.indexOf('/cme/index.html') !== -1,
    isFME: href.indexOf('/cme/fme') !== -1 || last === 'fme.aspx',
    isVueSPA: function() {
      return this.isCMEIndex || this.isFME;
    },
    // ASP.NET pages
    isCourseDetail: last === 'course.aspx' && href.indexOf('cid=') !== -1,
    // Certificate application page
    isCertificateApply: last === 'apply_certificate.aspx' || last === 'apply_certificate_top.aspx',
    isCardSelect: last === 'card_select.aspx',
    isCourseList: (last === 'course.aspx' && href.indexOf('cid=') === -1) || last === 'cme.aspx',
    isCME: last === 'cme.aspx',
    isStudyList: last === 'study_info_list.aspx',
    isLogin: last === 'login.aspx' || href.indexOf('/secure/login') !== -1,
    // Video pages
    isVideo: last.indexOf('course_ware_polyv') !== -1 || last.indexOf('course_ware_cc') !== -1,
    isPolyv: last.indexOf('course_ware_polyv') !== -1,
    isCC: last.indexOf('course_ware_cc') !== -1,
    isCourseware: last === 'course_ware.aspx',
    // Interactive case page (hdbl.91huayi.com)
    isInteractiveCase: href.indexOf('hdbl.91huayi.com') !== -1,
    // HD exam result page
    isHDExamResult: last === 'exam_result_hd.aspx' || href.indexOf('exam_result_hd') !== -1,
    // Survey page
    isSurvey: href.indexOf('dcwj.91huayi.com') !== -1,
    // Exam pages
    isExam: last === 'exam.aspx' || last === 'exam_code.aspx',
    isExamResult: last === 'exam_result.aspx' || last === 'exam_result_hd.aspx',
    // Other
    isFace: last === 'face.aspx',
    isError: href.indexOf('error.html') !== -1,
    // Get CID from URL
    getCID: function() {
      var m = href.match(/cid=([^&]+)/);
      return m ? m[1] : null;
    },
    getCWID: function() {
      var m = href.match(/cwid=([^&]+)/);
      return m ? m[1] : null;
    }
  };
})();

// ═══════════════════════════════════════════════════════════════
// 3. 工具函数
// ═══════════════════════════════════════════════════════════════
var _navCooldown = 0;
var _isNavigating = false;
var _globalPaused = false;

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function randDelay(base) {
  return base + Math.floor(Math.random() * (CONFIG.delays.randomMax || 5000));
}

function getTimestamp() {
  return new Date().toLocaleTimeString();
}

function log(msg) {
  var time = getTimestamp();
  console.log('[HYv3] ' + time + ' ' + msg);
  try {
    var el = document.getElementById('HY_log');
    if (el) {
      var t = document.createTextNode('\n' + time + ' ' + msg);
      el.appendChild(t);
      el.scrollTop = el.scrollHeight;
    }
  } catch(e) {}
}

function isElementEnabled(el) {
  if (!el) return false;
  var ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase();
  var className = typeof el.className === 'string' ? el.className : '';
  return !el.disabled && !el.hasAttribute('disabled') && ariaDisabled !== 'true' &&
    !/(^|\s)(disabled|is-disabled)(\s|$)/i.test(className) &&
    el.style.display !== 'none';
}

// 智能导航 - 防止打开新标签页
function safeNavigate(url) {
  if (!url || url.indexOf('javascript:') === 0) return false;
  if (window.__HY_paused || Store.g(CONFIG.keys.paused, false)) { log('[导航] 已暂停, 取消导航'); return false; }
  _navCooldown = Date.now() + CONFIG.delays.navCooldown;
  _isNavigating = true;
  log('[导航] -> ' + url.substring(0, 120));
  window.location.href = url;
  return true;
}

// 安全点击 - 截获target=_blank
function safeClick(el) {
  if (!el) return false;
  try {
    // 如果是链接且有target=_blank, 改用location.href
    if (el.tagName === 'A' && el.href) {
      if (el.target === '_blank') {
        el.target = '_self';
      }
      if (el.href && el.href.indexOf('javascript:') === -1) {
        return safeNavigate(el.href);
      }
    }
    if (el.onclick || el.getAttribute('onclick')) {
      el.click();
      return true;
    }
    return false;
  } catch(e) {
    log('[安全点击] 失败: ' + e.message);
    return false;
  }
}

// 保留兼容入口，但绝不改写站点 onclick/window.open。
function fixWindowOpenLinks() {
  // Scanners parse target URLs without mutating the site's DOM or handlers.
}

// 页面完整性保护：不移除或替换站点事件处理器。
function cleanupRestrictions() {
  // No-op by design; mutations are detected as an abnormal plugin.
}

// 弹窗杀手 - 处理疲劳/温馨提示/防刷题弹窗
function killPopups() {
  try {
    // 只处理播放器已知的非业务提示。旧版点击所有“确定/是/否”并隐藏所有 modal，
    // 可能误交卷、误提交问卷或遮掉登录错误信息。
    var knownContainers = document.querySelectorAll(
      '#div_processbar_tip, .pv-ask-wrap, .pv-ask-container, .player-tip, .course-tip'
    );
    var allBtns = [];
    for (var kc = 0; kc < knownContainers.length; kc++) {
      allBtns = allBtns.concat(Array.from(knownContainers[kc].querySelectorAll(
        'button, input[type="button"], a.btn, .ui-button, [class*="close"], .pv-ask-skip'
      )));
    }
    for (var i = 0; i < allBtns.length; i++) {
      var txt = (allBtns[i].textContent || allBtns[i].value || '').trim();
      if (['知道了', '关闭', '继续播放', '跳过'].indexOf(txt) >= 0 ||
          allBtns[i].classList.contains('pv-ask-skip') || /(^|[-_])close([-_]|$)/i.test(allBtns[i].className || '')) {
        allBtns[i].click();
      }
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// 4. Vue SPA课程扫描器 (全新实现)
// ═══════════════════════════════════════════════════════════════
// 基于真实DOM分析: .pro_cent > ul.jet_ul > li.jet_lis > div.jet_cent > p.test_tit
// 学分从卡片内 <span> 元素提取 (如 "2.0学分")
// 注意: 所有 course.aspx 链接都有 target="_blank"
// ═══════════════════════════════════════════════════════════════

var VueCourseScanner = {
  rememberCourses: function(courses) {
    var catalog = Store.g(HY_DISC_KEY || CONFIG.keys.discoveredCourses, null);
    if (!catalog || catalog.year !== CONFIG.targetYear || !catalog.items) {
      catalog = { year: CONFIG.targetYear, items: {}, updatedAt: Date.now() };
    }
    (courses || []).forEach(function(course) {
      var key = course.link || course.name;
      if (!key) return;
      var previous = catalog.items[key] || {};
      catalog.items[key] = Object.assign({}, previous, course, { discoveredAt: Date.now() });
    });
    catalog.updatedAt = Date.now();
    Store.s(CONFIG.keys.discoveredCourses, catalog);
    return Object.keys(catalog.items).map(function(key) { return catalog.items[key]; });
  },

  getDiscoveredCourses: function() {
    var catalog = Store.g(CONFIG.keys.discoveredCourses, null);
    if (!catalog || catalog.year !== CONFIG.targetYear || !catalog.items) return [];
    return Object.keys(catalog.items).map(function(key) { return catalog.items[key]; });
  },

  advanceVuePage: function() {
    var next = document.querySelector(
      '.el-pagination .btn-next, button.btn-next, .ant-pagination-next button, .ant-pagination-next a'
    );
    if (!next) return false;
    var container = next.closest('li, .ant-pagination-next') || next;
    if (!isElementEnabled(next) || /disabled/i.test(container.className || '') ||
        container.getAttribute('aria-disabled') === 'true') return false;
    next.click();
    return true;
  },

  // 从Vue SPA页面扫描课程卡片
  parseVueCourseCard: function(card, index) {
    var nameEl = card.querySelector('.test_tit') || card.querySelector('h3, h4, [class*="title"], [class*="name"]');
    var rawText = (card.innerText || card.textContent || '').trim();
    var lines = rawText.split(/\n+/).map(function(line) {
      return line.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    var name = nameEl ? (nameEl.textContent || '').trim() : '';
    if (!name) {
      for (var li = 0; li < lines.length; li++) {
        if (!/^(国家级|省级|市级|项目编号|项目负责人|负责人单位|关注度|基础训练|学习提高|前沿进展|专业科目|公需科目|[\d.]+\s*学分)$/.test(lines[li]) &&
            lines[li].indexOf('学分') < 0 && lines[li].length > 2) {
          name = lines[li];
          break;
        }
      }
    }
    if (!name) name = '课程 ' + (index + 1);

    var linkEl = card.querySelector('a[href*="course.aspx?cid="]');
    var link = linkEl ? linkEl.href : '';
    if (linkEl && linkEl.target === '_blank') linkEl.target = '_self';

    var credit = 0;
    for (var ci = 0; ci < lines.length; ci++) {
      var cm = lines[ci].match(/([\d.]+)\s*学分/);
      if (cm) { credit = parseFloat(cm[1]); break; }
    }
    if (!credit) {
      var spanText = Array.from(card.querySelectorAll('span, p, div')).map(function(el) {
        return el.textContent || '';
      }).join(' ');
      var cm2 = spanText.match(/([\d.]+)\s*学分/);
      if (cm2) credit = parseFloat(cm2[1]);
    }
    if (!credit) credit = 1;

    var status = '未学习';
    if (/已申请|已完成/.test(rawText)) status = '已完成';
    else if (/待考试|考试/.test(rawText)) status = '待考试';
    else if (/学习中|播放至|继续学习/.test(rawText)) status = '学习中';

    return {
      name: name,
      link: link,
      credit: credit,
      status: status,
      isPublic: /公需|公共/.test(name + rawText),
      isInteractive: !!card.querySelector('.jet_icon, [class*="interactive"], [class*="case"]'),
      completed: status === '已完成'
    };
  },

  scanFromVueSPA: function() {
    var courses = [];
    try {
      // 寻找课程卡片容器
      var container = document.querySelector('.pro_cent') || document.querySelector('.pro_box');
      if (!container) {
        // 备用: 直接找所有课程链接
        var links = document.querySelectorAll('a[href*="course.aspx?cid="]');
        if (links.length > 0) {
          log('[VUE扫描] 备用选择器: 找到 ' + links.length + ' 个课程链接');
          links.forEach(function(a) {
            var name = (a.textContent || '').trim();
            if (!name) name = (a.title || '').trim();
            if (!name) {
              var parent = a.closest('[class*="card"], [class*="item"], [class*="list"], td');
              if (parent) {
                var pt = (parent.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50);
                if (pt.length > 5) name = pt;
              }
            }
            if (!name) name = '课程 ' + (links.length > 0 ? '#' + (Array.from(links).indexOf(a) + 1) : '');
            courses.push({
              name: name,
              link: a.href,
              credit: 1,
              status: '未学习',
              isPublic: name.indexOf('公需') >= 0,
              completed: false
            });
          });
          this.rememberCourses(courses);
          return courses;
        }
        log('[VUE扫描] 未找到课程容器或链接');
        return courses;
      }
      
      // 课程卡片在 ul.jet_ul > li.jet_lis 内
      var cards = container.querySelectorAll('li.jet_lis');
      if (cards.length === 0) {
        // 回退: 可能在其他结构中
        cards = container.querySelectorAll('[class*="card"], [class*="item"], li');
      }
      
      log('[VUE扫描] 找到 ' + cards.length + ' 个课程卡片');
      
      for (var i = 0; i < cards.length; i++) {
        try {
          courses.push(this.parseVueCourseCard(cards[i], i));
        } catch(e) {
          log('[VUE扫描] 卡片解析错误: ' + e.message);
        }
      }
      
      log('[VUE扫描] 解析到 ' + courses.length + ' 门课程');
      this.rememberCourses(courses);
      return courses;
    } catch(e) {
      log('[VUE扫描] 扫描出错: ' + e.message);
      return courses;
    }
  },
  
  // 从课程详情页扫描课件列表 (ASP.NET course.aspx?cid=X)
  scanFromCourseDetail: function() {
    var coursewares = [];
    try {
      // ASP.NET格式: a.f14blue.cw-title-link[href*="course_ware.aspx?cwid="]
      var links = document.querySelectorAll('a.f14blue.cw-title-link[href*="course_ware"]');
      
      if (links.length === 0) {
        // 回退: 所有含course_ware的链接
        links = document.querySelectorAll('a[href*="course_ware"]');
      }
      
      log('[详情扫描] 找到 ' + links.length + ' 个课件链接');
      
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var name = (a.textContent || '').trim();
        var href = a.href;
        
        // 查找对应的状态按钮
        var status = '未学习';
        var container = a.closest('tr') || a.closest('div.course') || a.closest('[class*="item"]') || a.closest('[class*="course"]') || a.parentElement;
        if (container) {
          var btns = container.querySelectorAll('button, input[type="button"]');
          for (var b = 0; b < btns.length; b++) {
            var btnText = btns[b].value || btns[b].textContent || '';
            if (btnText === '已完成' || btnText === '待考试' || btnText === '学习中' || btnText === '未学习') {
              status = btnText;
              break;
            }
          }
          // 回退: 从文本分析
          if (status === '未学习') {
            var contText = container.textContent || '';
            if (contText.indexOf('已完成') >= 0) status = '已完成';
            else if (contText.indexOf('待考试') >= 0) status = '待考试';
            else if (contText.indexOf('学习中') >= 0) status = '学习中';
          }
        }
        
        coursewares.push({
          name: name,
          href: href,
          status: status,
          completed: status === '已完成'
        });
      }
      
      return coursewares;
    } catch(e) {
      log('[详情扫描] 出错: ' + e.message);
      return coursewares;
    }
  },
  
  // 扫描学分信息 - 从cme.aspx表格
  scanCreditsFromASP: function() {
    try {
      var thead = document.querySelector('table thead');
      if (!thead) return null;
      var headerCells = Array.from(thead.querySelectorAll('th, td'));
      var headers = headerCells.map(function(cell) { return (cell.textContent || '').replace(/\s+/g, ' ').trim(); });
      var thCount = headers.length;
      var isStudyInfo = thCount >= 6;
      function headerIndex(pattern, fallback) {
        for (var hi = 0; hi < headers.length; hi++) if (pattern.test(headers[hi])) return hi;
        return fallback;
      }
      var nameIndex = headerIndex(/项目名称|课程名称|项目/, 0);
      var creditIndex = headerIndex(/学分|分值/, 2);
      var statusIndex = headerIndex(/学习状态|状态/, 3);
      var progressIndex = headerIndex(/学习进度|进度/, 6);
      var actionIndex = headerIndex(/操作/, 7);
      var yearIndex = headerIndex(/年度|年份/, -1);
      
      var tbody = document.querySelector('table tbody');
      if (!tbody) return null;
      
      var result = { total: 0, public: 0, other: 0, done: 0, inProgress: 0, courses: [] };
      var rows = tbody.querySelectorAll('tr');
      
      for (var ri = 0; ri < rows.length; ri++) {
        var cells = rows[ri].querySelectorAll('td');
        if (cells.length < 4) continue;

        var rowText = (rows[ri].textContent || '').replace(/\s+/g, ' ').trim();
        var yearText = yearIndex >= 0 && cells[yearIndex] ? (cells[yearIndex].textContent || '') : rowText;
        var yearMatch = yearText.match(/(?:19|20)\d{2}/);
        var courseYear = yearMatch ? parseInt(yearMatch[0], 10) : null;
        if (courseYear && courseYear !== CONFIG.targetYear) continue;
        
        // Col 0: 项目名称 (with link)
        var nameCell = cells[nameIndex] || cells[0];
        var nameEl = nameCell.querySelector('a');
        var name = nameEl ? nameEl.textContent.trim() : (nameCell.textContent || '').trim();
        var link = nameEl ? nameEl.href : '';
        if (!name) continue;
        
        // Col 2: 学分类型
        var creditCell = cells[creditIndex] || cells[2] || cells[0];
        var creditText = (creditCell.textContent || '').trim();
        var cm = creditText.match(/([\d.]+)\s*学分/) || creditText.match(/([\d.]+)分/);
        if (!cm) cm = rowText.match(/([\d.]+)\s*学分/);
        var credit = cm ? parseFloat(cm[1]) : 0;
        if (!Number.isFinite(credit) || credit <= 0) credit = 1;
        var isPublic = creditText.indexOf('公需') >= 0 || name.indexOf('公需') >= 0;
        
        // Col 3: 学习状态
        var statusCell = cells[statusIndex] || cells[3];
        var status = isStudyInfo && statusCell ? (statusCell.textContent || '').replace(/\s+/g, '').trim() : '未学习';
        if (!isStudyInfo && cells.length >= 4) {
          var btn0 = cells[3].querySelector('input[type="button"], button');
          if (btn0) {
            var bt0 = (btn0.value || btn0.textContent || '').trim();
            if (bt0.indexOf('继续') >= 0) status = '学习中';
            else if (bt0.indexOf('证书') >= 0 || bt0.indexOf('申请') >= 0) status = '学习完毕';
          }
        }
        
        // Col 6: 学习进度 (e.g. "7/7", "0/12", "3/5")
        var progress = '';
        if (cells[progressIndex]) progress = (cells[progressIndex].textContent || '').trim();
        if (!/\d+\s*\/\s*\d+/.test(progress)) {
          var rowProgress = rowText.match(/\d+\s*\/\s*\d+/);
          progress = rowProgress ? rowProgress[0] : '';
        }
        
        // Col 7: 操作 (button text: "申请证书"/"继续学习" or empty)
        var action = '';
        var actionCell = cells[actionIndex] || cells[cells.length - 1];
        if (actionCell) {
          var actionBtn = actionCell.querySelector('input[type="button"], input[type="submit"], button, a');
          if (actionBtn) action = (actionBtn.value || actionBtn.textContent || '').trim();
        }
        
        // Extract action URL from button onclick (e.g. apply_certificate.aspx or course.aspx)
        var actionUrl = '';
        if (actionCell) {
          var actionBtn2 = actionCell.querySelector('input[type="button"], input[type="submit"], button, a');
          if (actionBtn2) {
            var oc = actionBtn2.getAttribute('onclick') || '';
            var ocMatch = oc.match(/(?:location\.href\s*=|window\.open\s*\()\s*["']([^"']+)["']/);
            actionUrl = actionBtn2.getAttribute('href') || actionBtn2.getAttribute('data-url') || (ocMatch ? ocMatch[1] : '');
            if (/^javascript:/i.test(actionUrl)) actionUrl = '';
            if (actionUrl) {
              try { actionUrl = new URL(actionUrl, location.href).href; } catch(eu) {}
            }
          }
        }
        
        // Determine completion state:
        // "已申请" = fully complete, credits received
        // "学习完毕" + "申请证书" = coursewares done, just need to apply certificate
        // "学习完毕" + no button = may need exam
        // "学习中" + "继续学习" = not finished, need to continue
        var trulyDone = (status === '已申请');
        var needsCertificate = (status === '学习完毕' && action.indexOf('证书') >= 0);
        var needsExam = (status === '学习完毕' && action === '');
        var needsContinue = (status === '学习中');
        
        if (trulyDone) {
          result.total += credit;
          if (isPublic) result.public += credit;
          else result.other += credit;
          result.done += credit;
        }
        
        // Parse progress
        var pm = progress.match(/(\d+)\/(\d+)/);
        var pDone = pm ? parseInt(pm[1]) : 0;
        var pTotal = pm ? parseInt(pm[2]) : 0;
        var pPct = pTotal > 0 ? Math.round(pDone / pTotal * 100) : 0;
        
        result.courses.push({
          name: name,
          year: courseYear,
          credit: credit,
          status: status,
          isPublic: isPublic,
          completed: trulyDone,
          needsCertificate: needsCertificate,
          needsExam: needsExam,
          needsContinue: needsContinue,
          link: link,
          progress: progress,
          progressDone: pDone,
          progressTotal: pTotal,
          progressPct: pPct,
          action: action,
          actionUrl: actionUrl
        });
        
        log('[学分] ' + name.substring(0, 20) + ' | ' + status + ' | ' + progress + ' | ' + (action || '无操作'));
      }
      
      return result;
    } catch(e) {
      log('[学分扫描] 出错: ' + e.message);
      return null;
    }
  },};

// ═══════════════════════════════════════════════════════════════
// 5. 智能学分规划器 (Smart Credit Planner)
// ═══════════════════════════════════════════════════════════════
// 从Vue SPA课程卡片解析学分状态 + ASP.NET表格回退
// ═══════════════════════════════════════════════════════════════

var HY_PLAN_KEY = CONFIG.keys.currentPlan;
var HY_PLAN_IDX = CONFIG.keys.planProgress;
var HY_DISC_KEY = CONFIG.keys.discoveredCourses;

var CreditPlanner = {
  // 分析当前页面学分状态
  analyze: function() {
    log('[学分] 开始分析学分...');
    
    // 优先使用学习记录表数据 (study_info_list.aspx/cme.aspx)
    var tableData = VueCourseScanner.scanCreditsFromASP();
    var courses;
    if (tableData && tableData.courses && tableData.courses.length > 0) {
      log('[学分] 从学习记录表解析到 ' + tableData.courses.length + ' 门课');
      courses = tableData.courses.map(function(c) {
        var pm = (c.progress || '').match(/(\d+)\/(\d+)/);
        var pDone = pm ? parseInt(pm[1]) : 0;
        var pTotal = pm ? parseInt(pm[2]) : 0;
        var pPct = pTotal > 0 ? Math.round(pDone / pTotal * 100) : 0;
        return {
          name: c.name,
          year: c.year || null,
          link: c.link,
          credit: c.credit,
          status: c.status,
          isPublic: c.isPublic,
          completed: c.completed,
          needsCertificate: c.needsCertificate || false,
          needsExam: c.needsExam || false,
          needsContinue: c.needsContinue || false,
          progress: c.progress || '',
          progressDone: pDone,
          progressTotal: pTotal,
          progressPct: pPct,
          action: c.action || '',
          actionUrl: c.actionUrl || ''
        };
      });
    } else {
      // 备用: 从Vue SPA课程卡片扫描
      VueCourseScanner.scanFromVueSPA();
      courses = VueCourseScanner.getDiscoveredCourses();
    }
    
    var result = {
      courses: courses,
      totalEarned: 0,
      publicEarned: 0,
      otherEarned: 0,
      total: 0,
      publicTarget: CONFIG.publicTarget,
      otherTarget: CONFIG.otherTarget,
      targetTotal: CONFIG.targetTotal,
      met: false
    };
    
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      result.total += c.credit;
      if (c.completed) {
        result.totalEarned += c.credit;
        if (c.isPublic) result.publicEarned += c.credit;
        else result.otherEarned += c.credit;
      }
    }
    
    result.publicRemaining = Math.max(0, result.publicTarget - result.publicEarned);
    result.otherRemaining = Math.max(0, result.otherTarget - result.otherEarned);
    result.totalRemaining = result.publicRemaining + result.otherRemaining;
    result.met = result.totalEarned >= result.targetTotal &&
      result.publicEarned >= result.publicTarget && result.otherEarned >= result.otherTarget;
    
    log('[学分] 已获: ' + result.totalEarned + '/' + result.targetTotal +
        ' (公需' + result.publicEarned + '/' + result.publicTarget +
        ' 其他' + result.otherEarned + '/' + result.otherTarget + ')');
    
    // Update UI credit display
    try { if (window.HY_updateCredits) window.HY_updateCredits(result.totalEarned, result.targetTotal, result.publicEarned, result.publicTarget); } catch(e) {}
    
    return result;
  },
  
  // 生成最优学习计划
  generatePlan: function(analysis) {
    if (!analysis || analysis.met) {
      log('[学分] 学分已达标或分析失败');
      return null;
    }
    
    // 只选择有真实入口且能继续处理的课程；绝不再用课程名称伪造 cid。
    var unfinished = analysis.courses.filter(function(c) {
      return !c.completed && !!(c.actionUrl || c.link);
    });

    unfinished.sort(function(a, b) {
      var aCert = a.needsCertificate ? 0 : 1;
      var bCert = b.needsCertificate ? 0 : 1;
      if (aCert !== bCert) return aCert - bCert;
      var aExam = a.needsExam ? 0 : 1;
      var bExam = b.needsExam ? 0 : 1;
      if (aExam !== bExam) return aExam - bExam;
      var aPct = a.progressPct || 0;
      var bPct = b.progressPct || 0;
      if (aPct !== bPct) return bPct - aPct;
      var aRem = (a.progressTotal || 999) - (a.progressDone || 0);
      var bRem = (b.progressTotal || 999) - (b.progressDone || 0);
      if (aRem !== bRem) return aRem - bRem;
      if (a.credit !== b.credit) return b.credit - a.credit;
      return String(a.name).localeCompare(String(b.name), 'zh-CN');
    });

    var tasks = [];
    var acc = 0;
    var needPublic = analysis.publicRemaining;
    var needOther = analysis.otherRemaining;
    var selected = [];

    function addTask(c) {
      if (selected.indexOf(c) >= 0) return;
      selected.push(c);
      tasks.push({
        name: c.name,
        url: c.actionUrl || c.link,
        credit: c.credit,
        status: c.status,
        isPublic: c.isPublic,
        completed: false,
        needsCertificate: c.needsCertificate || false,
        needsExam: c.needsExam || false,
        needsContinue: c.needsContinue || false,
        progress: c.progress || '',
        progressPct: c.progressPct || 0,
        action: c.action || ''
      });
      acc += c.credit;
    }

    for (var pi = 0; pi < unfinished.length && needPublic > 0; pi++) {
      if (!unfinished[pi].isPublic) continue;
      addTask(unfinished[pi]);
      needPublic = Math.max(0, needPublic - unfinished[pi].credit);
    }
    for (var oi = 0; oi < unfinished.length && needOther > 0; oi++) {
      if (unfinished[oi].isPublic) continue;
      addTask(unfinished[oi]);
      needOther = Math.max(0, needOther - unfinished[oi].credit);
    }

    var needTotal = analysis.totalRemaining;
    
    var plan = {
      tasks: tasks,
      total: acc,
      need: needTotal,
      remainingAfterPlan: needPublic + needOther,
      createdAt: Date.now()
    };
    
    Store.s(HY_PLAN_KEY, plan);
    Store.s(HY_PLAN_IDX, 0);
    
    log('[学分] 生成计划: ' + tasks.length + ' 个任务, 共 ' + acc + ' 学分');
    return plan;
  },
  
  // 获取保存的计划
  getPlan: function() {
    return Store.g(HY_PLAN_KEY, null);
  },
  
  // 获取当前进度
  getProgress: function() {
    return Store.g(HY_PLAN_IDX, 0);
  },
  
  // 标记当前任务完成
  completeTask: function() {
    var idx = Store.g(HY_PLAN_IDX, 0);
    Store.s(HY_PLAN_IDX, idx + 1);
    log('[学分] 完成任务 #' + (idx + 1));
  },
  
  // 重置计划
  resetPlan: function() {
    Store.s(HY_PLAN_IDX, 0);
    log('[学分] 计划已重置');
  },
  
  showQuickStatus: function(analysis) {
    try {
      var dot = document.getElementById('HY_statusDot');
      var lbl = document.getElementById('HY_statusLabel');
      if (lbl) {
        lbl.textContent = analysis.totalEarned + '/' + analysis.targetTotal + '分';
      }
    } catch(e) {}
  }
};

// ═══════════════════════════════════════════════════════════════
// 6. 智能执行引擎 (Smart Execution Engine)
// ═══════════════════════════════════════════════════════════════
// 状态机: 自动判断当前页面 → 执行适当操作 → 推进到下一步
// 流程: 课程列表 → 课程详情 → 课件页面 → 问卷 → 视频 → 考试 → 结果 → 下一课
// ═══════════════════════════════════════════════════════════════

function fillSurveyForm() {
  var root = document.querySelector('#divQuestion, #fieldset1, form') || document.body;
  var answered = 0;
  var groups = {};
  Array.from(root.querySelectorAll('input[type="radio"]')).forEach(function(input, index) {
    if (input.disabled) return;
    var key = input.name || ('radio-' + index);
    if (!groups[key]) groups[key] = [];
    groups[key].push(input);
  });
  Object.keys(groups).forEach(function(key) {
    var options = groups[key];
    if (options.some(function(input) { return input.checked; })) return;
    var choice = options[Math.floor((options.length - 1) / 2)];
    if (choice) { choice.click(); answered++; }
  });

  var checkboxGroups = {};
  Array.from(root.querySelectorAll('input[type="checkbox"]')).forEach(function(input, index) {
    if (input.disabled || input.id === 'agree1') return;
    var key = input.name || ('checkbox-' + index);
    if (!checkboxGroups[key]) checkboxGroups[key] = [];
    checkboxGroups[key].push(input);
  });
  Object.keys(checkboxGroups).forEach(function(key) {
    var options = checkboxGroups[key];
    if (!options.some(function(input) { return input.checked; }) && options[0]) {
      options[0].click();
      answered++;
    }
  });

  Array.from(root.querySelectorAll('select')).forEach(function(select) {
    if (select.disabled || select.value) return;
    var option = Array.from(select.options).find(function(item) { return item.value && !item.disabled; });
    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      answered++;
    }
  });
  Array.from(root.querySelectorAll('textarea, input[type="text"]')).forEach(function(input) {
    if (input.disabled || input.value || /验证码|手机|姓名|身份证/.test(input.placeholder || '')) return;
    input.value = '无';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    answered++;
  });

  var submit = root.querySelector('#ctlNext, #submit_button, #btnSubmit, #divSubmit .btn_submit, input[type="submit"], button[type="submit"], .submitbutton, a.submit');
  if (!submit) {
    var candidates = root.querySelectorAll('button, input[type="button"], a');
    for (var ci = 0; ci < candidates.length; ci++) {
      var text = (candidates[ci].textContent || candidates[ci].value || '').replace(/\s+/g, ' ').trim();
      if (/^(提交|完成|下一步|立即提交|提交问卷)$/.test(text)) { submit = candidates[ci]; break; }
    }
  }
  return { answered: answered, submit: submit };
}

function findInteractiveAction() {
  var scopes = [
    document.querySelector('.case-main, .case-content, .study-main, .content, #app, #root'),
    document.body
  ].filter(Boolean);
  var startTexts = ['查看病例', '开始学习', '进入病例', '继续学习'];
  var nextTexts = ['下一步', '继续', '下一页', '完成学习', '完成', '提交'];
  var denyTexts = ['删除', '退出', '返回', '关闭', '取消', '重置', '上一页', '上一步'];
  function normalize(text) { return String(text || '').replace(/\s+/g, '').trim(); }
  function visible(el) {
    if (!el) return false;
    if (el.offsetWidth || el.offsetHeight || el.getClientRects().length) return true;
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return !!(style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0');
  }
  function candidateElements(root) {
    return Array.from(root.querySelectorAll('button, a[href], input[type="button"], input[type="submit"], [role="button"], .btn, [class*="button"]'));
  }
  for (var s = 0; s < scopes.length; s++) {
    var buttons = candidateElements(scopes[s]).filter(function(el) {
      if (!visible(el) || !isElementEnabled(el)) return false;
      var text = normalize(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title);
      if (!text || denyTexts.indexOf(text) >= 0) return false;
      return startTexts.indexOf(text) >= 0 || nextTexts.indexOf(text) >= 0;
    });
    if (buttons.length) {
      buttons.sort(function(a, b) {
        var at = normalize(a.innerText || a.textContent || a.value || a.getAttribute('aria-label') || a.title);
        var bt = normalize(b.innerText || b.textContent || b.value || b.getAttribute('aria-label') || b.title);
        var ap = startTexts.indexOf(at) >= 0 ? 0 : 1;
        var bp = startTexts.indexOf(bt) >= 0 ? 0 : 1;
        return ap - bp;
      });
      return buttons[0];
    }
  }
  return null;
}

var SmartEngine = {
  _running: false,
  _currentPage: '',
  _retryCount: 0,
  
  // 获取当前任务
  getCurrentTask: function() {
    var plan = Store.g(HY_PLAN_KEY, null);
    if (!plan || !plan.tasks || !plan.tasks.length) return null;
    var idx = Store.g(HY_PLAN_IDX, 0);
    if (idx >= plan.tasks.length) return null;
    return plan.tasks[idx];
  },
  
  // 推进到下一任务
  nextTask: function() {
    var idx = Store.g(HY_PLAN_IDX, 0);
    Store.s(HY_PLAN_IDX, idx + 1);
    return this.getCurrentTask();
  },
  
  // 显示任务列表
  showTasks: function() {
    var plan = Store.g(HY_PLAN_KEY, null);
    if (!plan || !plan.tasks) { log('[引擎] 无计划'); return; }
    log('[引擎] 计划: ' + plan.tasks.length + ' 个任务');
    for (var i = 0; i < plan.tasks.length; i++) {
      var action = plan.tasks[i].action || '';
      var prog = plan.tasks[i].progressPct ? ' [' + plan.tasks[i].progressPct + '%]' : '';
      var actStr = action ? ' (' + action + ')' : (plan.tasks[i].status === '学习完毕' ? ' (待考试)' : '');
      log('[引擎]   #' + (i+1) + ' ' + plan.tasks[i].name + ' (' + plan.tasks[i].credit + '分' + actStr + ')' + prog);
    }
    var idx = Store.g(HY_PLAN_IDX, 0);
    log('[引擎] 当前进度: ' + idx + '/' + plan.tasks.length);
    try { if (window.HY_updateTaskProgress) window.HY_updateTaskProgress(idx, plan.tasks.length); } catch(e) {}
  },
  
  // 开始执行 - 需要先在课程列表页
  start: function() {
    if (this._running) {
      log('[引擎] 已在运行中');
      return;
    }
    this._running = true;
    window.__HY_paused = false;
    Store.s(CONFIG.keys.paused, false);
    log('[引擎] === 开始执行 ===');
    this.updateUI('navigating', '正在启动...');
    
    // If we have an existing plan with pending tasks, resume it
    var task = this.getCurrentTask();
    if (task) {
      log('[引擎] 恢复现有计划');
      this.showTasks();
      this.navigateToTask(task);
      return;
    }
    
    // No existing plan - need to check study records FIRST
    // Navigate to study_info_list.aspx to get real credit status
    // (Vue SPA cards don't show study progress - all show as '未学习')
    if (!URL.isStudyList) {
      log('[引擎] 先查看学习记录, 获取真实学分状态...');
      Store.s('__HY_startRequested', true);
      safeNavigate('/pages/study_info_list.aspx');
      return;
    }
    
    // We are on the study record page - parse real credit status
    var self = this;
    setTimeout(function() {
      var analysis = CreditPlanner.analyze();
      if (analysis) {
        log('[学分] 已获: ' + analysis.totalEarned + '/' + analysis.targetTotal +
            ' (公需' + analysis.publicEarned + '/' + analysis.publicTarget +
            ' 其他' + analysis.otherEarned + '/' + analysis.otherTarget + ')');
        
        // List courses that need action
        var needAction = analysis.courses.filter(function(c) { return !c.completed; });
        for (var i = 0; i < needAction.length; i++) {
          log('[学分] 需处理: ' + needAction[i].name.substring(0, 25) + ' (' + needAction[i].status + ', ' + needAction[i].credit + '分)');
        }
        
        if (analysis.met) {
          log('[引擎] 学分已达标, 无需继续');
          self._running = false;
          self.updateUI('done');
          return;
        }
        
        // Generate plan from courses that need action
        var plan = CreditPlanner.generatePlan(analysis);
        if (plan && plan.tasks.length > 0) {
          self.showTasks();
          var newTask = self.getCurrentTask();
          if (newTask) {
            log('[引擎] 开始执行第一个任务: ' + newTask.name);
            self.navigateToTask(newTask);
          }
        } else {
          // No courses need action from study record - go to CME index to find new courses
          log('[引擎] 学习记录中的课程无需处理, 跳转到课程列表寻找新课程...');
          Store.s('__HY_needMoreCourses', true);
          Store.d(CONFIG.keys.discoveredCourses);
          self._running = false;
          safeNavigate('/cme/index');
        }
      } else {
        log('[引擎] 无法分析学分, 重试中...');
        setTimeout(function() {
          if (self._running) self.start();
        }, 3000);
      }
    }, 2000);
  },
  
  // 暂停
  stop: function() {
    this._running = false;
    window.__HY_paused = true;
    Store.s(CONFIG.keys.paused, true);
    // Clear any pending timers
    if (window.__HY_videoCheck) { clearInterval(window.__HY_videoCheck); window.__HY_videoCheck = null; }
    if (window.__HY_caseTimer) { clearInterval(window.__HY_caseTimer); window.__HY_caseTimer = null; }
    log('[引擎] === 已暂停 ===');
    this.updateUI('paused');
  },
  
  // 导航到任务页面
  navigateToTask: function(task) {
    if (!this._running) return;
    if (!task || !task.url) {
      log('[引擎] 任务无效, 跳过');
      this.nextTask();
      this._running = false;
      return;
    }
    log('[引擎] 导航到: ' + task.name);
    this.updateUI('navigating', task.name);
    safeNavigate(task.url);
  },
  
  // 当前页面处理 - 由路由自动调用
  handleCurrentPage: function() {
    if (!this._running) {
      // 检查是否在执行过程中 (跨页面导航后恢复)
      var plan = Store.g(HY_PLAN_KEY, null);
      var idx = Store.g(HY_PLAN_IDX, 0);
      if (plan && plan.tasks && idx >= 0 && idx < plan.tasks.length && Store.g(CONFIG.keys.running, false)) {
        // 有未完成计划, 恢复执行
        log('[引擎] 检测到未完成计划, 恢复执行');
        this._running = true;
      } else {
        return;
      }
    }
    
    // The study record is a verification/staging page, not a course task.
    // Older builds fell through to "unknown page" and called nextTask(),
    // silently skipping one course every time this page was visited.
    if (URL.isStudyList) {
      this.handleStudyList();
      return;
    }

    var task = this.getCurrentTask();
    if (!task) {
      log('[引擎] 所有任务已完成!');
      this._running = false;
      this.updateUI('done');
      return;
    }
    
    log('[引擎] 处理页面: ' + URL.full.substring(0, 80));
    
    // 根据页面类型执行对应操作
    if (URL.isSurvey) {
      this.handleSurvey();
    } else if (URL.isInteractiveCase) {
      this.handleInteractiveCase();
    } else if (URL.isVideo) {
      this.handleVideo();
    } else if (URL.isExam) {
      this.handleExam();
    } else if (URL.isExamResult) {
      this.handleExamResult();
    } else if (URL.isCourseDetail) {
      this.handleCourseDetail();
    } else if (URL.isVueSPA() || URL.isCME) {
      this.handleCourseList();
    } else if (URL.isError) {
      log('[引擎] 错误页面, 等待后重试');
      var self = this;
      setTimeout(function() { location.reload(); }, 10000);
    } else {
      log('[引擎] 未知页面: ' + URL.last);
      this.nextTask();
    }
  },

  // Resume an existing task from the authoritative study record, or rebuild
  // the plan after the previous batch has really finished.
  handleStudyList: function() {
    var task = this.getCurrentTask();
    if (task && task.url) {
      log('[引擎] 学习记录核验完成，继续当前任务: ' + task.name);
      this.navigateToTask(task);
      return;
    }

    log('[引擎] 当前计划已结束，重新核验学分并生成后续计划');
    Store.d(HY_PLAN_KEY);
    Store.s(HY_PLAN_IDX, 0);
    this._running = false;
    this.start();
  },
  
  // 处理课程列表页 (Vue SPA)
  handleCourseList: function() {
    var self = this;
    // 等待Vue渲染完成
    setTimeout(function() {
      if (!self._running) return;
      
      var task = self.getCurrentTask();
      if (!task || !task.url) {
        log('[引擎] 课程列表: 无任务或任务无链接');
        self.nextTask();
        self._running = false;
        return;
      }
      
      log('[引擎] 课程列表: 导航到任务课程');
      self.navigateToTask(task);
    }, 2000);
  },
  
  // 处理课程详情页
  handleCourseDetail: function() {
    var self = this;
    setTimeout(function() {
      if (!self._running) return;
      
      // 扫描课件列表
      var coursewares = VueCourseScanner.scanFromCourseDetail();
      if (coursewares.length === 0) {
        var emptyRetries = Store.g('HY_EmptyCoursewareRetries', 0) + 1;
        Store.s('HY_EmptyCoursewareRetries', emptyRetries);
        log('[引擎] 课程详情尚未发现课件 (' + emptyRetries + '/5)');
        if (emptyRetries < 5) {
          setTimeout(function() { location.reload(); }, 3000);
        } else {
          Store.d('HY_EmptyCoursewareRetries');
          log('[引擎] 课程详情连续为空, 返回学习记录重新核验，未把任务误标为完成');
          safeNavigate('/pages/study_info_list.aspx');
        }
        return;
      }
      Store.d('HY_EmptyCoursewareRetries');
      
      // 查找第一个未完成的课件
      var found = null;
      for (var i = 0; i < coursewares.length; i++) {
        if (!coursewares[i].completed) {
          found = coursewares[i];
          break;
        }
      }
      
      if (!found) {
        log('[引擎] 课程详情: 所有课件已完成, 进入第一个课件查找考试入口');
        // For '学习完毕' courses: all coursewares done but exam not taken
        // Enter the first courseware to reach the video page where #jrks exam button is enabled
        if (coursewares.length > 0 && coursewares[0].href) {
          log('[引擎] 进入课件查找考试: ' + coursewares[0].name);
          Store.s('__HY_lookingForExam', true);
          safeNavigate(coursewares[0].href);
        } else {
          self.checkExamAfterCourseware();
        }
        return;
      }
      
      log('[引擎] 进入课件: ' + found.name);
      // 课件链接会重定向到问卷, 再重定向到视频
      // 原链接让服务器处理重定向流程(问卷sojumpparm含视频地址)
      safeNavigate(found.href);
    }, 2000);
  },
  
  // 检查课程详情页的考试按钮
  checkExamAfterCourseware: function() {
    var self = this;
    // 查找考试相关元素
    var allBtns = document.querySelectorAll('button, input[type="button"], input[type="image"], a, [onclick]');
    var examBtns = Array.from(allBtns).filter(function(b) {
      var t = (b.textContent || b.value || b.alt || '').trim();
      var oc = b.getAttribute('onclick') || '';
      return t.indexOf('考试') >= 0 || t.indexOf('进入') >= 0 || t.indexOf('申请') >= 0 ||
             oc.indexOf('exam') >= 0 || oc.indexOf('考试') >= 0 || oc.indexOf('apply') >= 0;
    });
    // Also check for links to exam.aspx
    if (examBtns.length === 0) {
      var examLinks = document.querySelectorAll('a[href*="exam.aspx"]');
      if (examLinks.length > 0) examBtns = Array.from(examLinks);
    }
    if (examBtns.length > 0) {
      log('[引擎] 检测到考试按钮, 进入考试');
      var btn = examBtns[0];
      if (btn.href) {
        safeNavigate(btn.href);
      } else {
        btn.click();
      }
    } else {
      log('[引擎] 无考试按钮, 完成本课程');
      self.nextTask();
      self._running = false;
      // 返回课程列表
      setTimeout(function() {
        var plan = Store.g(HY_PLAN_KEY, null);
        var idx = Store.g(HY_PLAN_IDX, 0);
        if (plan && idx < (plan.tasks ? plan.tasks.length : 0)) {
          var nextTask = plan.tasks[idx];
          if (nextTask && nextTask.url) {
            safeNavigate(nextTask.url);
          } else {
            safeNavigate('/cme/index');
          }
        } else {
          safeNavigate('/cme/index');
        }
      }, 2000);
    }
  },
  
  // 处理问卷页 (dcwj.91huayi.com)
  handleSurvey: function() {
    log('[引擎] 检测到问卷页');
    this.updateUI('survey');
    
    // 尝试查找"提交"或"下一步"按钮
    var self = this;
    setTimeout(function() {
      if (!self._running) return;
      
      var survey = fillSurveyForm();
      if (survey.submit) {
        log('[引擎] 已填写 ' + survey.answered + ' 个问卷字段，提交问卷');
        survey.submit.click();
        // 提交后等待重定向到视频
        setTimeout(function() {
          if (self._running) {
            log('[引擎] 问卷提交后等待视频页面...');
          }
        }, 5000);
      } else {
        // 页面本身没有问卷表单时，才使用站点提供的返回视频地址。
        log('[引擎] 页面没有可提交问卷，读取站点返回地址');
        // URL中的sojumpparm参数包含视频地址
        var m = location.href.match(/sojumpparm=[^|]*\|[^|]*\|[^|]*\|([^&]+)/);
        if (m) {
          var videoUrl = decodeURIComponent(m[1]);
          log('[引擎] 从sojumpparm找到视频地址');
          safeNavigate(videoUrl);
        } else {
          // 兼容只携带 cwid 的过渡页。
          var cwid = URL.getCWID();
          if (cwid) {
            safeNavigate('/course_ware/course_ware_polyv.aspx?cwid=' + cwid);
          } else {
            log('[引擎] 无法处理问卷页');
          }
        }
      }
    }, 3000);
  },
  
  // 处理互动病例页 (hdbl.91huayi.com)
  handleInteractiveCase: function() {
    log('[引擎] 互动病例页加载...');
    this.updateUI('video');
    this._running = true;
    cleanupRestrictions();
    
    var self = this;
    var caseCheckCount = 0;
    var caseMaxChecks = 300; // 5 minutes
    
    var caseTimer = setInterval(function() {
      if (!self._running) { clearInterval(caseTimer); return; }
      caseCheckCount++;
      
      try {
        var action = findInteractiveAction();
        if (action) {
          var actionText = (action.innerText || action.textContent || action.value || action.getAttribute('aria-label') || action.title || '').trim();
          try { action.click(); } catch(e) {}
          log('[引擎] 互动病例: 点击 ' + actionText);
        }
        
        // Check if completed (redirect back or completion text)
        var pageText = document.body ? document.body.innerText : '';
        if (pageText.indexOf('已完成') >= 0 || pageText.indexOf('学习完毕') >= 0) {
          clearInterval(caseTimer);
          log('[引擎] 互动病例完成');
          self._running = false;
          // Navigate back to course detail
          var backUrl = new URLSearchParams(window.location.search).get('backUrl');
          if (backUrl) {
            safeNavigate(backUrl);
          } else {
            safeNavigate('/pages/study_info_list.aspx');
          }
          return;
        }
        
        if (caseCheckCount % 30 === 0) {
          log('[引擎] 互动病例进行中... (' + caseCheckCount + '秒)');
        }
        
        if (caseCheckCount > caseMaxChecks) {
          clearInterval(caseTimer);
          log('[引擎] 互动病例超时, 返回课程列表');
          self._running = false;
          safeNavigate('/pages/study_info_list.aspx');
        }
      } catch(e) {
        log('[引擎] 互动病例错误: ' + e.message);
      }
    }, 1000);
    
    window.__HY_caseTimer = caseTimer;
  },
  
  // 处理视频页 (course_ware_polyv.aspx)
  handleVideo: function() {
    log('[引擎] 视频页加载, 启动播放器...');
    this.updateUI('video');
    cleanupRestrictions();
    this._running = true;
    
    var self = this;
    var checkCount = 0;
    // 允许长课程持续运行；仅以连续无进展判定故障，不按固定 10 分钟误杀。
    var maxChecks = 21600; // 6 hours
    var videoStarted = false;
    var videoAlreadyCompleted = false; // v3.8.1: shared flag for both setTimeout and checkTimer
    var lastVideoTime = -1;
    var stalledChecks = 0;
    var recoveryKey = 'HY_VideoRecovery:' + (URL.getCWID() || URL.full.substring(0, 120));
    
    // 只信任网站给出的可进入考试状态或视频真实 ended 状态。
    // 旧版按 localStorage >100 秒伪判完成并调用 s2j_onPlayOver，会造成服务端进度与页面不一致。
    setTimeout(function() {
      try {
        var videos = document.querySelectorAll('video');
        var jrksCheck = document.getElementById('jrks');
        if (jrksCheck && isElementEnabled(jrksCheck)) {
          videoAlreadyCompleted = true;
          log('[引擎] 网站已启用考试入口，无需重复播放');
          return;
        }

        for (var v = 0; v < videos.length; v++) {
          try { videos[v].muted = true; videos[v].volume = 0; } catch(e) {}
        }
        if (videos.length > 0 && videos[0].paused) {
          var p = videos[0].play();
          if (p && p.then) {
            p.then(function() { log('[引擎] 播放已开始'); }).catch(function(e) {});
          }
        }
        // v3.8.0: 不点击倍速按钮 - 网站maxPlaybackRateLimit=1.0,
        // 倍速控制已关闭(ifRatePlay=false), 点击倍速按钮无效且
        // 可能触发反作弊检测(blockAbnormalPlugin)
        log('[引擎] 视频播放中(1x倍速, 网站不支持加速)');
      } catch(e) {
        log('[引擎] 播放启动错误: ' + e.message);
      }
    }, 1000);
    
    var checkTimer = setInterval(function() {
      if (!self._running) { clearInterval(checkTimer); return; }
      checkCount++;
      try {
        // 立即检查是否可进入考试(视频可能已完成)
        var jrksBtn = document.getElementById('jrks');
        if (jrksBtn && isElementEnabled(jrksBtn)) {
          log('[引擎] 进入考试按钮已启用, 进入考试');
          clearInterval(checkTimer);
          var rawHref = jrksBtn.getAttribute('href') || '';
          if (rawHref && rawHref !== '#' && !rawHref.startsWith('javascript') && !rawHref.startsWith('#')) {
            safeNavigate(rawHref);
          } else {
            try { jrksBtn.click(); } catch(e) {}
          }
          return;
        }

        killPopups();
        
          var video = document.querySelector('video');
          if (video) {
            try { video.muted = true; video.volume = 0; } catch(e) {}

            if (video.currentTime > lastVideoTime + 0.2) {
              lastVideoTime = video.currentTime;
              stalledChecks = 0;
              Store.d(recoveryKey);
            } else if (!video.ended && !videoAlreadyCompleted) {
              stalledChecks++;
            }
          
          // v3.8.0: 检测已完成视频 (ban_history_time=on 导致视频重置到0)
          // 如果jrks按钮存在但disabled, 且视频在开头, 需要播放视频
          // 但如果视频duration很短(<60秒)可能是已完成的标志
          
          // 检查视频是否已经结束
          if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 3)) {
            log('[引擎] 检测到视频已完成, 等待考试按钮启用');
            // 不播放, 等待jrks启用
            if (checkCount % 10 === 0) {
              log('[引擎] 等待考试按钮启用... (视频已结束)');
            }
          } else if (!videoAlreadyCompleted) {
            // v3.8.1: Don't play if video was already completed (localStorage check)
            // ban_history_time=on resets video to 0:00, but we know it was watched
            if (!videoStarted && !video.paused) { videoStarted = true; log('[引擎] 视频正在播放'); }
            if (video.paused && !video.ended && checkCount % 3 === 0) {
              try { var p = video.play(); if(p&&p.then) p.catch(function(){}); } catch(e) {}
            }
          } else if (checkCount % 10 === 0) {
            log('[引擎] 等待网站确认视频完成...');
          }

          var progress = video.duration > 0 ? (video.currentTime / video.duration) : 0;
          if (checkCount % 30 === 0) {
            var remaining = video.duration > 0 ? Math.round(video.duration - video.currentTime) : 0;
            log('[引擎] 视频进度 ' + Math.round(progress * 100) + '% (剩余' + remaining + '秒)');
          }
          if (stalledChecks === 120) {
            log('[引擎] 视频连续 2 分钟无进展，尝试恢复播放器');
            try { if (window.player && typeof window.player.j2s_resumeVideo === 'function') window.player.j2s_resumeVideo(); } catch(e) {}
            try { if (window.cc_js_Player && typeof window.cc_js_Player.play === 'function') window.cc_js_Player.play(); } catch(e) {}
            try { var rp = video.play(); if (rp && rp.catch) rp.catch(function(){}); } catch(e) {}
          }
          if (stalledChecks >= 300) {
            clearInterval(checkTimer);
            var recoveryCount = Store.g(recoveryKey, 0) + 1;
            Store.s(recoveryKey, recoveryCount);
            if (recoveryCount <= 3) {
              log('[引擎] 视频连续 5 分钟无进展，重新加载页面恢复 (' + recoveryCount + '/3)');
              location.reload();
            } else {
              log('[引擎] 视频多次恢复失败，返回学习记录核验，任务保持未完成');
              Store.d(recoveryKey);
              safeNavigate('/pages/study_info_list.aspx');
            }
            return;
          }
          if (progress > 0.95 || (video.duration > 0 && video.currentTime >= video.duration - 5)) {
            var jrksFinal = document.getElementById('jrks');
            if (jrksFinal && isElementEnabled(jrksFinal)) {
              clearInterval(checkTimer);
              log('[引擎] 视频播放完成! 进入考试');
              self._running = false;
              var finalHref = jrksFinal.getAttribute('href') || '';
              if (jrksFinal.tagName === 'A' && finalHref && finalHref !== '#' && !finalHref.startsWith('javascript') && !finalHref.startsWith('#')) {
                safeNavigate(finalHref);
              } else {
                try { jrksFinal.click(); } catch(e) {}
              }
              return;
            } else if (jrksFinal && !isElementEnabled(jrksFinal)) {
              if (checkCount % 10 === 0) {
                log('[引擎] 视频已完成, 等待考试按钮启用...');
              }
              // Keep timer running, wait for button to enable
            } else {
              clearInterval(checkTimer);
              log('[引擎] 视频播放完成, 返回课程列表');
              self._running = false;
              safeNavigate('/pages/study_info_list.aspx');
              return;
            }
          }
        } else {
          var jrksNoVideo = document.getElementById('jrks');
          if (jrksNoVideo && isElementEnabled(jrksNoVideo)) {
            clearInterval(checkTimer);
            log('[引擎] 无视频元素, 进入考试');
            self._running = false;
            var noVideoHref = jrksNoVideo.getAttribute('href') || '';
            if (jrksNoVideo.tagName === 'A' && noVideoHref && noVideoHref !== '#' && !noVideoHref.startsWith('javascript') && !noVideoHref.startsWith('#')) {
              safeNavigate(noVideoHref);
            } else {
              try { jrksNoVideo.click(); } catch(e) {}
            }
            return;
          }
          // Never infer completion from a global "已完成" substring. The
          // player page, hidden widgets and even this helper's own panel can
          // contain that phrase while the video is at 0:00. Completion is
          // accepted only from video.ended/currentTime or an enabled #jrks.
        }
      } catch(e) {
        log('[引擎] 视频检测错误: ' + e.message);
      }
      if (checkCount > maxChecks) {
        clearInterval(checkTimer);
        log('[引擎] 视频检测超时, 返回课程列表');
        self._running = false;
        safeNavigate('/pages/study_info_list.aspx');
      }
    }, 1000);
    window.__HY_videoCheck = checkTimer;
  },
  // 处理考试结果页
  // 处理考试页 (exam.aspx)
  handleExam: function() {
    log('[引擎] 考试页加载, 开始答题...');
    this.updateUI('exam');
    this._running = true;
    cleanupRestrictions();
    // doExam() handles the full answer flow: find questions → answer → submit
    // After submit, the page navigates to exam_result.aspx → handleExamResult
    doExam();
  },
  // 处理考试结果页
    handleExamResult: function() {
    log('[引擎] 考试结果页');
    var self = this;
    var pageText = document.body ? document.body.innerText : '';
    var examFailed = pageText.indexOf('考试未通过') >= 0 || pageText.indexOf('未通过') >= 0;
    var examPassed = pageText.indexOf('考试通过') >= 0 || pageText.indexOf('已通过') >= 0 ||
      pageText.indexOf('完成项目学习可以申请学分') >= 0 || pageText.indexOf('考试合格') >= 0;
    if (examFailed) {
      log('[引擎] 考试未通过, 记录错误答案, 准备重试');
      try {
        var wrongAnswers = Store.g('HY_wrongAnswers', {});
        var lines = pageText.split('\n');
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          var qMatch = line.match(/^\d+[、.](.+)/);
          if (qMatch) {
            var qText = qMatch[1].trim().substring(0, 50);
            var aMatch = line.match(/您的答案[：:]\s*([A-E])/);
            if (!aMatch && li + 1 < lines.length) aMatch = lines[li + 1].match(/您的答案[：:]\s*([A-E])/);
            if (aMatch) { wrongAnswers[qText] = aMatch[1]; log('[引擎] 记录错误: ' + qText.substring(0, 15) + '->' + aMatch[1]); }
          }
        }
        Store.s('HY_wrongAnswers', wrongAnswers);
      } catch(e) {}
      var task = self.getCurrentTask();
      if (task && task.url) {
        log('[引擎] 返回课程重新考试: ' + task.name);
        setTimeout(function() { self._running = true; safeNavigate(task.url); }, 3000);
      } else { safeNavigate('/pages/study_info_list.aspx'); }
      return;
    }
    if (!examPassed) {
      log('[引擎] 无法确认考试是否通过，不推进任务；返回学习记录核验');
      doResult();
      setTimeout(function() { safeNavigate('/pages/study_info_list.aspx'); }, 3000);
      return;
    }
    Store.d('HY_examTries');
    doResult(function() {
      self.nextTask();
      self._running = false;
      setTimeout(function() {
        var nextTask = self.getCurrentTask();
        if (nextTask && nextTask.url) {
          log('[引擎] 进入下一个任务: ' + nextTask.name);
          self._running = true;
          safeNavigate(nextTask.url);
        } else {
          log('[引擎] 所有任务完成, 返回学习记录页');
          safeNavigate('/pages/study_info_list.aspx');
        }
      }, 3000);
    });
  },
  
  // 处理申请证书页 (apply_certificate.aspx)
  handleCertificateApply: function() {
    log('[引擎] 申请证书页 - 填写评价并申请学分');
    var self = this;
    setTimeout(function() {
      try {
        var pageText = document.body ? document.body.innerText : '';
        if (/申请成功|已申请|证书已申请/.test(pageText)) {
          log('[引擎] 证书申请成功，返回学习记录核验');
          self.nextTask();
          safeNavigate('/pages/study_info_list.aspx');
          return;
        }

        var radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        var groups = {};
        radios.forEach(function(input) {
          if (!groups[input.name]) groups[input.name] = [];
          groups[input.name].push(input);
        });
        Object.keys(groups).forEach(function(name) {
          var first = groups[name].filter(isElementEnabled)[0] || groups[name][0];
          if (first && !groups[name].some(function(input) { return input.checked; })) {
            first.click();
          }
        });

        var checkedBoxes = 0;
        Array.from(document.querySelectorAll('input[type="checkbox"]')).forEach(function(input) {
          if (checkedBoxes < 2 && isElementEnabled(input) && !input.checked) {
            input.click();
            checkedBoxes++;
          } else if (input.checked) {
            checkedBoxes++;
          }
        });

        Array.from(document.querySelectorAll('textarea')).forEach(function(textarea) {
          if (!textarea.value) {
            textarea.value = '课程内容实用，讲解清晰，收获较大。';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        var buttons = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button, a'));
        var applyBtn = buttons.find(function(btn) {
          var text = (btn.value || btn.innerText || btn.textContent || '').trim();
          return isElementEnabled(btn) && /是的.*申请|我申请|确认申请|去确认|提交/.test(text) && !/不|取消|返回/.test(text);
        });
        if (applyBtn) {
          log('[引擎] 点击证书申请按钮: ' + (applyBtn.value || applyBtn.innerText || '').trim());
          applyBtn.click();
          setTimeout(function() {
            var okBtn = document.getElementById('btn_preapply_tip_ok') ||
              Array.from(document.querySelectorAll('input[type="button"], button, a')).find(function(btn) {
                var text = (btn.value || btn.innerText || btn.textContent || '').trim();
                return isElementEnabled(btn) && /我知道了|确定|确认/.test(text);
              });
            if (okBtn) okBtn.click();
            setTimeout(function() { safeNavigate('/pages/study_info_list.aspx'); }, 3000);
          }, 2000);
        } else {
          log('[引擎] 未找到证书申请按钮，返回学习记录核验');
          safeNavigate('/pages/study_info_list.aspx');
        }
      } catch(e) {
        log('[引擎] 证书申请处理错误: ' + e.message);
        safeNavigate('/pages/study_info_list.aspx');
      }
    }, 1000);
  },

  handleCardSelect: function() {
    log('[引擎] 培训卡选择页');
    var self = this;
    setTimeout(function() {
      var text = document.body ? document.body.innerText : '';
      var noCards = /可用培训卡\s*\(0\)|这里空空的|没有可用|去绑卡\/购卡/.test(text);
      if (noCards) {
        log('[引擎] 当前无可用培训卡，跳过本证书申请任务，继续后续课程');
        self.nextTask();
        var nextTask = self.getCurrentTask();
        if (nextTask && nextTask.url) {
          self._running = true;
          safeNavigate(nextTask.url);
        } else {
          safeNavigate('/pages/study_info_list.aspx');
        }
        return;
      }
      var confirmBtn = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button, a')).find(function(btn) {
        var btnText = (btn.value || btn.innerText || btn.textContent || '').trim();
        return isElementEnabled(btn) && /确认使用|确认|提交/.test(btnText);
      });
      if (confirmBtn) {
        log('[引擎] 使用可用培训卡申请证书');
        confirmBtn.click();
        setTimeout(function() { safeNavigate('/pages/study_info_list.aspx'); }, 4000);
      } else {
        log('[引擎] 未找到培训卡确认按钮，返回学习记录核验');
        safeNavigate('/pages/study_info_list.aspx');
      }
    }, 1500);
  },

  // 更新UI状态
  updateUI: function(state, label) {
    try {
      if (window.HY_setPanelState) {
        window.HY_setPanelState(state, label);
      }
    } catch(e) {}
  },
  
  // 继续执行 - 由路由调用
  continueExecution: function() {
    var plan = Store.g(HY_PLAN_KEY, null);
    var idx = Store.g(HY_PLAN_IDX, 0);
    
    if (!plan || !plan.tasks || idx >= plan.tasks.length) {
      return false;
    }
    
    // 检查是否有任务需要处理
    if (idx === 0) return false; // 还没开始
    
    log('[引擎] 续执行: 任务 ' + idx + '/' + plan.tasks.length);
    this._running = true;
    this.handleCurrentPage();
    return true;
  }
};

// _running 必须跨页面持久化；普通对象字段在每次导航后都会重置，旧版本因此经常首课即停。
(function persistEngineRunningState() {
  var running = !!Store.g(CONFIG.keys.running, false);
  Object.defineProperty(SmartEngine, '_running', {
    configurable: false,
    enumerable: true,
    get: function() { return running; },
    set: function(value) {
      running = !!value;
      Store.s(CONFIG.keys.running, running);
    }
  });
})();

// ═══════════════════════════════════════════════════════════════
// 7. 考试助手模块 (Exam Helper)
// ═══════════════════════════════════════════════════════════════
// 支持ASP.NET多种DOM格式, 指纹匹配, 智能评分(不依赖云端API)
// ═══════════════════════════════════════════════════════════════

function doExam() {
  log("[考试] 开始答题...");
  cleanupRestrictions();
  
  var rightAnswers = Store.g(CONFIG.keys.rightAnswers, {});
  var allAnswers = Store.g(CONFIG.keys.allAnswers, {});
  var currentTries = Store.g("HY_examTries", {}); // v5.1: persist tries across retries
  var round = 1;
  var maxRounds = 10;
  
  function findAndAnswer() {
    var questions = findQuestions();
    if (questions.length > 0) {
      log("[考试] 找到 " + questions.length + " 道题目");
      answerQuestions(rightAnswers, allAnswers, currentTries, round);
      var delay = 3000 + Math.floor(Math.random() * 5000);
      log("[考试] 第" + round + "轮完成, " + Math.round(delay/1000) + "秒后提交");
      setTimeout(submitExam, delay);
    } else {
      log("[考试] 未找到题目, 重试...");
      setTimeout(findAndAnswer, 1000);
    }
  }
  
  setTimeout(findAndAnswer, 2000);
}

// 查找题目 - 支持多种DOM结构
function findQuestions() {
  var explicit = document.querySelectorAll(
    "table.tablestyle, .test > table, [data-question-id], .question-item, .exam-item"
  );
  var explicitQuestions = Array.from(explicit).filter(function(el) {
    return el.querySelectorAll("input[type='radio'], input[type='checkbox']").length >= 2;
  });
  if (explicitQuestions.length > 0) return explicitQuestions;

  // 回退按 input.name 分组，并寻找只包含该题选项的最小祖先，避免旧版把每个选项 div 当作一道题。
  var inputs = Array.from(document.querySelectorAll("input[type='radio'], input[type='checkbox']"))
    .filter(function(input) { return !input.disabled; });
  var groups = {};
  inputs.forEach(function(input, index) {
    var key = input.name || ('__unnamed_' + index);
    if (!groups[key]) groups[key] = [];
    groups[key].push(input);
  });

  var result = [];
  Object.keys(groups).forEach(function(name) {
    var members = groups[name];
    if (members.length < 2) return;
    var node = members[0].parentElement;
    var best = null;
    while (node && node !== document.body) {
      var descendants = Array.from(node.querySelectorAll("input[type='radio'], input[type='checkbox']"));
      var uniqueNames = {};
      descendants.forEach(function(input) { uniqueNames[input.name || '__unnamed'] = true; });
      var sameGroupCount = descendants.filter(function(input) { return input.name === members[0].name; }).length;
      if (sameGroupCount === members.length && Object.keys(uniqueNames).length === 1) best = node;
      if (descendants.length > members.length || Object.keys(uniqueNames).length > 1) break;
      node = node.parentElement;
    }
    if (!best) best = members[0].closest('table, fieldset, li, .question, .item') || members[0].parentElement;
    if (best && result.indexOf(best) === -1) result.push(best);
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 3.1 登录与图形验证码
// 账号密码只保存在 Tampermonkey 的 GM 存储，不写入源码、日志或页面 localStorage。
// ═══════════════════════════════════════════════════════════════
var LoginController = {
  _worker: null,
  _busy: false,
  _attempts: 0,

  getCredentials: function() {
    var saved = Store.g(CONFIG.keys.credentials, null);
    if (!saved || typeof saved !== 'object') return null;
    return {
      username: String(saved.username || ''),
      password: String(saved.password || ''),
      autoLogin: saved.autoLogin !== false
    };
  },

  saveCredentials: function(username, password, autoLogin) {
    Store.s(CONFIG.keys.credentials, {
      username: String(username || '').trim(),
      password: String(password || ''),
      autoLogin: autoLogin !== false,
      updatedAt: Date.now()
    });
  },

  revealPasswordLogin: function() {
    var more = document.getElementById('show_type_more');
    if (more && more.offsetParent !== null) more.click();
    var passwordTab = document.getElementById('type_pwd');
    if (passwordTab) passwordTab.click();
  },

  setNativeValue: function(input, value) {
    if (!input) return;
    input.focus();
    // 网站用 input 事件维护闭包 realValue 和隐藏字段，必须先清空再逐次触发。
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  preprocessCaptcha: function(img) {
    var scale = 4;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth || img.width || 100) * scale;
    canvas.height = Math.max(1, img.naturalHeight || img.height || 46) * scale;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    for (var i = 0; i < data.length; i += 4) {
      var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      var value = gray < 175 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  },

  recognizeCaptcha: async function(img) {
    if (!img) throw new Error('未找到验证码图片');
    if (!img.complete || !img.naturalWidth) {
      await new Promise(function(resolve, reject) {
        var timer = setTimeout(function() { reject(new Error('验证码加载超时')); }, 10000);
        img.addEventListener('load', function() { clearTimeout(timer); resolve(); }, { once: true });
        img.addEventListener('error', function() { clearTimeout(timer); reject(new Error('验证码加载失败')); }, { once: true });
      });
    }
    if (typeof Tesseract === 'undefined' || !Tesseract.createWorker) {
      throw new Error('OCR 组件未加载');
    }
    if (!this._worker) {
      log('[登录] 首次初始化本地 OCR...');
      this._worker = await Tesseract.createWorker('eng', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
        workerBlobURL: true,
        logger: function(message) {
          if (message && message.status === 'recognizing text' && message.progress >= 0.99) {
            log('[登录] OCR 识别完成');
          }
        }
      });
      await this._worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM ? Tesseract.PSM.SINGLE_LINE : '7',
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        preserve_interword_spaces: '0'
      });
    }
    var canvas = this.preprocessCaptcha(img);
    var result = await this._worker.recognize(canvas);
    var text = String(result && result.data ? result.data.text : '')
      .replace(/[^0-9A-Za-z]/g, '').trim();
    if (text.length < 4 || text.length > 6) {
      throw new Error('OCR 结果长度异常');
    }
    return text;
  },

  refreshCaptcha: function() {
    var img = document.getElementById('yzm_img');
    if (img) img.src = '/secure/CheckCode.aspx?r=' + Math.random();
  },

  getLoginErrorText: function() {
    var selectors = [
      '.layui-layer-content', '.layui-layer-dialog', '.el-message', '.ant-message',
      '.toast', '.message', '.error', '.tips', '.login_tips'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (!nodes[j].offsetWidth && !nodes[j].offsetHeight && !nodes[j].getClientRects().length) continue;
        var text = (nodes[j].innerText || nodes[j].textContent || '').trim();
        if (/验证码|用户名|密码|账号|错误|失败|不存在|锁定/.test(text)) return text;
      }
    }
    return '';
  },

  shouldRetryLogin: function(errorText) {
    if (!errorText) return true;
    if (/验证码/.test(errorText)) return true;
    if (/用户名|账号|密码|不存在|锁定/.test(errorText)) return false;
    return true;
  },

  fillAndSubmit: async function(credentials) {
    if (this._busy) return;
    this._busy = true;
    try {
      this.revealPasswordLogin();
      var username = document.getElementById('txt_user_name');
      var password = document.getElementById('txt_user_pwd');
      var captchaInput = document.getElementById('txt_img_code');
      var captchaImage = document.getElementById('yzm_img');
      var agreement = document.getElementById('agree1');
      var submit = document.querySelector('.btn_login[data-login-type="1"]');
      if (!username || !password || !captchaInput || !captchaImage || !agreement || !submit) {
        throw new Error('登录表单尚未加载完整');
      }
      this.setNativeValue(username, credentials.username);
      this.setNativeValue(password, credentials.password);
      var realPassword = document.getElementById('txt_user_pwd_real');
      if (realPassword) this.setNativeValue(realPassword, credentials.password);
      if (!agreement.checked) {
        agreement.checked = true;
        agreement.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var code = await this.recognizeCaptcha(captchaImage);
      this.setNativeValue(captchaInput, code);
      this._attempts++;
      log('[登录] 已填写账号与验证码，提交第 ' + this._attempts + ' 次登录');
      submit.click();
      var self = this;
      setTimeout(function() {
        if (location.pathname.toLowerCase().indexOf('/secure/login') >= 0 && self._attempts < 5) {
          var errorText = self.getLoginErrorText();
          if (!self.shouldRetryLogin(errorText)) {
            log('[登录] 服务端拒绝账号密码，停止自动重试：' + errorText);
            return;
          }
          log('[登录] 页面仍在登录页，刷新验证码后重试' + (errorText ? '：' + errorText : ''));
          self.refreshCaptcha();
          setTimeout(function() { self.fillAndSubmit(credentials); }, 1800);
        }
      }, 6500);
    } catch (error) {
      log('[登录] ' + error.message);
      if (this._attempts < 5) {
        this.refreshCaptcha();
        var self = this;
        setTimeout(function() { self._busy = false; self.fillAndSubmit(credentials); }, 2500);
        return;
      }
    } finally {
      this._busy = false;
    }
  },

  createSetupPanel: function() {
    if (document.getElementById('HY_loginSetup')) return;
    var saved = this.getCredentials() || { username: '', password: '', autoLogin: true };
    var panel = document.createElement('section');
    panel.id = 'HY_loginSetup';
    panel.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;width:290px;padding:14px;' +
      'background:#102a36;color:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:13px/1.5 sans-serif';
    var title = document.createElement('strong');
    title.textContent = '华医助手 · 自动登录设置';
    panel.appendChild(title);
    function field(type, placeholder, value) {
      var input = document.createElement('input');
      input.type = type;
      input.placeholder = placeholder;
      input.value = value || '';
      input.style.cssText = 'display:block;box-sizing:border-box;width:100%;margin-top:9px;padding:8px;border:1px solid #54717d;border-radius:5px';
      panel.appendChild(input);
      return input;
    }
    var userInput = field('text', '用户名/手机号', saved.username);
    var passwordInput = field('password', '密码', saved.password);
    var autoLabel = document.createElement('label');
    autoLabel.style.cssText = 'display:block;margin:9px 0';
    var autoInput = document.createElement('input');
    autoInput.type = 'checkbox';
    autoInput.checked = saved.autoLogin !== false;
    autoLabel.appendChild(autoInput);
    autoLabel.appendChild(document.createTextNode(' 保存后自动识别验证码并登录'));
    panel.appendChild(autoLabel);
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = '保存并登录';
    button.style.cssText = 'width:100%;padding:9px;border:0;border-radius:5px;background:#19a7ce;color:white;cursor:pointer';
    var self = this;
    button.onclick = function() {
      var creds = { username: userInput.value.trim(), password: passwordInput.value, autoLogin: autoInput.checked };
      if (!creds.username || !creds.password) { log('[登录] 账号或密码为空'); return; }
      self.saveCredentials(creds.username, creds.password, creds.autoLogin);
      self.fillAndSubmit(creds);
    };
    panel.appendChild(button);
    document.body.appendChild(panel);
  },

  handle: function() {
    this.revealPasswordLogin();
    this.createSetupPanel();
    var credentials = this.getCredentials();
    if (credentials && credentials.username && credentials.password && credentials.autoLogin) {
      this.fillAndSubmit(credentials);
    } else {
      log('[登录] 请在右上角保存一次账号密码；后续会自动登录');
    }
  }
};

// 生成题目指纹 (无视序号随机)
function getQuestionFingerprint(qEl) {
  var texts = [];
  
  // 方式1: class q_name 或 class question 元素
  var nameEl = qEl.querySelector(".q_name, .question, td[class*='q'], th, [class*='q_name']");
  if (nameEl) texts.push(nameEl.textContent || '');
  
  // 方式2: 表格第一个td或前两个td
  if (qEl.tagName === 'TABLE') {
    var firstRow = qEl.querySelector('tr');
    if (firstRow) {
      var cells = firstRow.querySelectorAll('td, th');
      if (cells.length > 0) {
        texts.push(cells[0].textContent || '');
        if (cells.length > 1) texts.push(cells[1].textContent || '');
      }
    }
  }
  
  // 方式3: 容器内文本(移除选项部分)
  var fullText = qEl.textContent || '';
  // 尝试在选项前截断 (A. B. C. D. 之前的内容是题目)
  var optMatch = fullText.match(/([^]*?)(?:A[、.．]|A )[^]*/);
  if (optMatch && optMatch[1].trim().length > 5) {
    texts.push(optMatch[1].trim());
  }
  
  // 方式4: 整个文本
  texts.push(fullText);
  
  // 取最长的非空文本
  var best = '';
  for (var i = 0; i < texts.length; i++) {
    var t = (texts[i] || '').trim();
    if (t.length > best.length && t.length > 5) best = t;
  }
  
  // 清理序号前缀和空白
  return best.replace(/^\s*[\d]+[、.，,\s)\]]+/, '').replace(/\s+/g, ' ').trim();
}

// 提取选项
function extractOptions(qEl) {
  var options = [];
  
  // 策略1: label内的radio/checkbox
  var labels = qEl.querySelectorAll("label");
  for (var i = 0; i < labels.length; i++) {
    var inp = labels[i].querySelector("input[type='radio'], input[type='checkbox']");
    if (inp) {
      var text = (labels[i].textContent || '').trim();
      // 清理前缀 (A. A、A)
      text = text.replace(/^\s*[A-Za-z][、.，,)\s]*/, '').trim();
      if (text) options.push({ el: labels[i], text: text, input: inp, checked: inp.checked });
    }
  }
  
  // 策略2: td内的radio + 文本
  if (options.length === 0) {
    var tds = qEl.querySelectorAll("td");
    for (var j = 0; j < tds.length; j++) {
      var inp = tds[j].querySelector("input[type='radio'], input[type='checkbox']");
      if (inp) {
        var text = (tds[j].textContent || '').trim();
        text = text.replace(/^\s*[A-Za-z][、.，,)\s]*/, '').trim();
        if (text) options.push({ el: tds[j], text: text, input: inp, checked: inp.checked });
      }
    }
  }
  
  // 策略3: 直接找input父元素
  if (options.length === 0) {
    var inputs = qEl.querySelectorAll("input[type='radio'], input[type='checkbox']");
    for (var k = 0; k < inputs.length; k++) {
      var inp = inputs[k];
      var parent = inp.parentElement;
      var text = (parent.textContent || parent.innerText || '').trim();
      text = text.replace(/^\s*[A-Za-z][、.，,)\s]*/, '').trim();
      if (text) options.push({ el: parent, text: text, input: inp, checked: inp.checked });
    }
  }
  
  return options;
}

// 智能评分 (15维特征, 不依赖云端API)
function smartScore(text) {
  var score = 0;
  var t = text.trim();
  
  if (!t) return -100;
  
  // === 正向特征 ===
  // 1. "以上都是/都对" 通常是正确答案
  if (/以上都(是|对|正|正确|包括)/.test(t)) score += 18;
  if (/以上均(是|对|正确|包括)/.test(t)) score += 18;
  // 2. 全面性表述
  if (/^(全部|所有|凡是)/.test(t)) score += 8;
  // 3. 肯定性短表述 (通常是正确选项)
  if (/^(是|正确|对|可以|应该|需要)$/.test(t)) score += 5;
  if (/^(是|正确|对|可以|应该|需要)/.test(t) && t.length < 10) score += 3;
  // 4. 必然性词
  if (/必须|一定|肯定|必然|绝对/.test(t)) score += 1;
  // 5. 长答案可能更详细准确
  if (t.length > 30) score += 2;
  if (t.length > 60) score += 2;
  // 6. 含具体数字/剂量/百分比
  if (/\d+/.test(t)) score += 2;
  // 7. 专业术语
  if (/临床|诊断|治疗|预防|监测|评估|管理|风险|综合征|机制/.test(t)) score += 1;
  
  // === 负向特征 ===
  // 8. "都不/全错" 通常是错误选项 (但偶尔是正确)
  if (/都不(是|对|正|正确)/.test(t)) score -= 12;
  if (/以上都不(是|对|正确)/.test(t)) score -= 12;
  // 9. 否定表述
  if (/不影响|不是|不可以|不正确|错误|不属于|不包括/.test(t)) score -= 4;
  // 10. 绝对化禁词
  if (/绝不|严禁|禁忌|禁止|不得/.test(t)) score -= 2;
  // 11. 模糊词
  if (/可能|或许|大概|也许/.test(t)) score -= 1;
  // 12. 否/无/不必
  if (/^否|没有|无需|不必/.test(t)) score -= 2;
  // 13. 仅/只/唯一 (过于绝对)
  if (/^(仅|只|唯一)/.test(t)) score -= 1;
  // 14. 极短答案 (1-2个字)
  if (t.length <= 4) score -= 5;
  // 15. 选项含否定前缀
  if (/^(不|无|非|未)/.test(t)) score -= 3;
  
  // === 医学知识增强 (v3.4.1) ===
  // 16. 题目问'不是/错误/除外'时, 答案评分反转
  // (这个逻辑在answerQuestions中处理, 这里只是基础评分)
  // 17. 含具体医学指标 (更可能正确)
  if (/PaO2|FiO2|PEEP|pH|PO2|PCO2|SpO2|GCS|APACHE|SOFA|mmHg|cmH2O/.test(t)) score += 3;
  // 18. 含规范/标准/指南 (通常正确)
  if (/指南|规范|标准|共识|推荐/.test(t)) score += 2;
  // 19. 含'增加/升高'与'减少/降低'对比时
  if (/增高|升高|增加|增多/.test(t) && /降低|减少|下降/.test(t)) score += 0; // 中性
  // 20. 含剂量/频率 (具体数字+单位, 通常正确)
  if (/\d+\s*(mg|ug|ml|次|天|日|小时|分钟|秒|mmol|mEq)/.test(t)) score += 2;
  // 21. 长选项含多个分号或逗号 (更全面的答案)
  if ((t.match(/[；;]/g) || []).length >= 2) score += 2;
  if ((t.match(/[，,]/g) || []).length >= 3) score += 1;
  // 22. 选项含'均可/都能/同时' (全面性)
  if (/均可|都能|同时|两者|三者/.test(t)) score += 3;
  // 23. 反向题标记: 如果题目问'错误/不是/除外', 否定选项反而可能正确
  // (在answerQuestions中根据题干调整)
  
  return score;
}


function getCurrentExamKey() {
  var href = location.href || '';
  var match = href.match(/[?&](?:cwid|cid)=([^&#]+)/i);
  return match ? decodeURIComponent(match[1]) : location.pathname;
}

function chooseExamOptionWithStrategy(args) {
  var options = args.options || [];
  var tried = args.tried || [];
  var strategy = args.strategy || {};
  var baseline = strategy.baseline || {};
  var storeKey = args.storeKey;
  var baselineText = baseline[storeKey];
  var probeIndex = Number(strategy.probeIndex || 0);
  if (args.questionCount > 0) probeIndex = ((probeIndex % args.questionCount) + args.questionCount) % args.questionCount;

  function findByText(text) {
    if (!text) return null;
    for (var i = 0; i < options.length; i++) {
      if (options[i].text === text) return options[i];
    }
    return null;
  }
  function hasTried(text) {
    for (var i = 0; i < tried.length; i++) {
      if (text === tried[i] || text.indexOf(tried[i]) >= 0 || tried[i].indexOf(text) >= 0) return true;
    }
    return false;
  }
  function bestUntried() {
    var candidates = [];
    for (var i = 0; i < options.length; i++) {
      if (!hasTried(options[i].text)) candidates.push(options[i]);
    }
    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) {
      if (args.isNegativeQ) return smartScore(a.text) - smartScore(b.text);
      return smartScore(b.text) - smartScore(a.text);
    });
    return candidates[0];
  }

  // 若已有基线且本题不是当前探测题，保持基线答案，避免失败后所有题同时换答案。
  if (baselineText && args.questionIndex !== probeIndex) {
    var baselineOption = findByText(baselineText);
    if (baselineOption) return baselineOption;
  }

  var chosen = bestUntried();
  if (chosen) return chosen;

  var fallbackBaseline = findByText(baselineText);
  if (fallbackBaseline) return fallbackBaseline;
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}

function getExamProbeStrategy(questionCount) {
  var examKey = getCurrentExamKey();
  var strategy = Store.g('HY_examProbeStrategy', {});
  if (!strategy || strategy.examKey !== examKey || !strategy.baseline) {
    strategy = { examKey: examKey, baseline: {}, probeIndex: 0, updatedAt: Date.now() };
  }
  if (questionCount > 0) strategy.probeIndex = ((Number(strategy.probeIndex || 0) % questionCount) + questionCount) % questionCount;
  return strategy;
}

// 答题核心
function answerQuestions(rightAnswers, allAnswers, currentTries, round) {
  var questions = findQuestions();
  log("[考试] 处理 " + questions.length + " 道题, 第" + round + "轮");
  
  var delaySoFar = 0;
  var answered = 0;
  var submittedAnswers = {};
  var examStrategy = getExamProbeStrategy(questions.length);
  
  for (var qi = 0; qi < questions.length; qi++) {
    var qEl = questions[qi];
    var qFingerprint = getQuestionFingerprint(qEl);
    var options = extractOptions(qEl);
    
    if (options.length === 0 || !qFingerprint || qFingerprint.length < 3) continue;
    
    var storeKey = qFingerprint.substring(0, 50);
    var chosen = null;
    
    // 策略1: 已知正确答案 (按文本匹配, 无视选项顺序)
    if (rightAnswers[storeKey]) {
      var known = rightAnswers[storeKey].replace(/^\s*[A-Za-z][、.，,)\s]+/, '').trim();
      for (var oi = 0; oi < options.length; oi++) {
        // 精确匹配
        if (options[oi].text === known) {
          chosen = options[oi];
          log("[考试] ✅ 精确匹配: " + known.substring(0, 20));
          break;
        }
      }
      if (!chosen) {
        // 包含匹配
        for (var oi2 = 0; oi2 < options.length; oi2++) {
          var t1 = options[oi2].text.replace(/\s+/g, '');
          var t2 = known.replace(/\s+/g, '');
          if (t1.indexOf(t2) >= 0 || t2.indexOf(t1) >= 0) {
            chosen = options[oi2];
            log("[考试] ✅ 模糊匹配: " + known.substring(0, 20));
            break;
          }
        }
      }
    }
    
    // 策略2: 试错 - 从未尝试的选项中选择评分最高的
    // 检测是否反向题 (问'不是/错误/除外/不正确')
    var isNegativeQ = /不是|不属于|不包括|不是|错误|除外|不正确|哪项错/.test(qFingerprint);
    
    if (!chosen) {
      var tried = currentTries[storeKey] || [];
      chosen = chooseExamOptionWithStrategy({
        storeKey: storeKey,
        questionIndex: qi,
        questionCount: questions.length,
        options: options,
        tried: tried,
        strategy: examStrategy,
        isNegativeQ: isNegativeQ,
        round: round
      });
      if (chosen) {
        var existsTried = false;
        for (var ti = 0; ti < tried.length; ti++) {
          if (chosen.text === tried[ti] || chosen.text.indexOf(tried[ti]) >= 0 || tried[ti].indexOf(chosen.text) >= 0) { existsTried = true; break; }
        }
        if (!existsTried) tried.push(chosen.text);
        currentTries[storeKey] = tried;
        if (!examStrategy.baseline[storeKey]) examStrategy.baseline[storeKey] = chosen.text;
        log((examStrategy.baseline[storeKey] === chosen.text && qi !== examStrategy.probeIndex ? "[考试] 📌 基线: " : "[考试] 🔎 探测: ") + chosen.text.substring(0, 20));
      }
    }
    
    if (chosen) {
      submittedAnswers[storeKey] = chosen.text;
      (function(opt) {
        setTimeout(function() {
          try {
            // click() 会切换 checked；旧版先设 true 再 click 会把答案反向取消。
            if (opt.input && !opt.input.checked) {
              opt.input.click();
            } else if (opt.el) {
              opt.el.click();
            }
          } catch(e) { try { opt.el.click(); } catch(e2) {} }
        }, delaySoFar);
      })(chosen);
      delaySoFar += 200 + Math.random() * 300;
      answered++;
    }
  }
  
  window.__HY_examState = {
    rightAnswers: rightAnswers,
    currentTries: currentTries,
    examStrategy: examStrategy,
    round: round
  };
  Store.s('HY_examProbeStrategy', examStrategy);
  Store.s('HY_LastSubmittedAnswers', submittedAnswers);
  
  log("[考试] 已答 " + answered + " 题");
}

function submitExam() {
  log("[考试] 提交答案...");
  
  var state = window.__HY_examState;
  if (state && state.rightAnswers) {
    Store.s(CONFIG.keys.rightAnswers, state.rightAnswers);
  }
  if (state && state.currentTries) {
    Store.s("HY_examTries", state.currentTries);
  }
  if (state && state.examStrategy) {
    state.examStrategy.probeIndex = Number(state.examStrategy.probeIndex || 0) + 1;
    state.examStrategy.updatedAt = Date.now();
    Store.s('HY_examProbeStrategy', state.examStrategy);
  }
  
  // 查找提交/交卷按钮
  var submitBtn = null;
  var btns = document.querySelectorAll("input[type='button'], input[type='submit'], input[type='image'], button");
  
  for (var i = 0; i < btns.length; i++) {
    var t = (btns[i].value || btns[i].textContent || btns[i].id || '').trim();
    if (t.indexOf('交卷') >= 0 || t.indexOf('提交') >= 0 || t.indexOf('确定') >= 0) {
      submitBtn = btns[i];
      break;
    }
  }
  
  // 特定ID查找
  if (!submitBtn) {
    submitBtn = document.getElementById('btn_submit') || 
               document.getElementById('submitBtn') || 
               document.querySelector('input[type="submit"]');
  }
  
  if (submitBtn) {
    submitBtn.click();
    log("[考试] 提交按钮已点击");
    
    // 确认交卷
    setTimeout(function() {
      var confirmBtn = document.querySelector("input[value*='确定']");
      if (!confirmBtn) {
        var confirmButtons = document.querySelectorAll('button');
        for (var ci = 0; ci < confirmButtons.length; ci++) {
          if ((confirmButtons[ci].textContent || '').trim().indexOf('确定') >= 0) {
            confirmBtn = confirmButtons[ci];
            break;
          }
        }
      }
      if (confirmBtn) {
        confirmBtn.click();
        log("[考试] 已确认交卷");
      }
    }, 2000);
  } else {
    log("[考试] 未找到提交按钮, 尝试表单提交");
    var form = document.getElementById('form1') || document.querySelector('form');
    if (form) {
      try { form.submit(); log("[考试] 表单直接提交"); } catch(e) {}
    }
  }
}

function learnFailedSubmittedAnswersFromResult() {
  var pageText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
  if (pageText.indexOf('考试未通过') < 0 || pageText.indexOf('您的答案') < 0) return 0;
  var currentTries = Store.g('HY_examTries', {});
  var count = 0;
  var normalized = pageText.replace(/\r/g, '\n').replace(/\s+/g, ' ');
  function cleanQ(text) {
    return String(text || '')
      .replace(/^\s*\d+[、.，,\s)\]]+/, '')
      .replace(/\s+/g, ' ').trim().substring(0, 50);
  }
  function cleanA(letter, text) {
    return String((text || '').trim() || letter || '')
      .replace(/^\s*[A-Za-z][、.，,)\s]*/, '')
      .replace(/\s+/g, ' ').trim();
  }
  var pattern = /(\d+[、.]\s*[^【]+?)\s*【您的答案[：:]\s*([A-Z])[、.，,)\s]*([^】]+)】/g;
  var match;
  while ((match = pattern.exec(normalized))) {
    var q = cleanQ(match[1]);
    var a = cleanA(match[2], match[3]);
    if (!q || !a) continue;
    if (!currentTries[q]) currentTries[q] = [];
    var exists = currentTries[q].some(function(old) {
      return old === a || old.indexOf(a) >= 0 || a.indexOf(old) >= 0;
    });
    if (!exists) {
      currentTries[q].push(a);
      count++;
    }
  }
  if (count > 0) {
    Store.s('HY_examTries', currentTries);
    log('[考试结果] 已从未通过结果页记录 ' + count + ' 个失败选项，下一轮自动避开');
  }
  return count;
}

// 处理考试结果
function doResult(callback) {
  log("[考试结果] 解析结果并保存可验证的正确答案...");

  function cleanQuestion(text) {
    return String(text || '')
      .replace(/^\s*\d+[、.，,\s)\]]+/, '')
      .replace(/（[^）]*(?:正确|错误|得分)[^）]*）/g, '')
      .replace(/\s+/g, ' ').trim().substring(0, 50);
  }
  function cleanAnswer(text) {
    return String(text || '').replace(/^\s*[A-Za-z][、.，,)\s]+/, '').replace(/\s+/g, ' ').trim();
  }

  try {
    var right = Store.g(CONFIG.keys.rightAnswers, {});
    var submitted = Store.g('HY_LastSubmittedAnswers', {});
    var saved = 0;
    learnFailedSubmittedAnswersFromResult();

    function submittedFor(question) {
      if (submitted[question]) return submitted[question];
      var keys = Object.keys(submitted);
      for (var si = 0; si < keys.length; si++) {
        if (keys[si].indexOf(question) >= 0 || question.indexOf(keys[si]) >= 0) return submitted[keys[si]];
      }
      return '';
    }
    function save(question, answer) {
      var q = cleanQuestion(question);
      var a = cleanAnswer(answer);
      if (!q || !a || a.length > 500) return;
      if (right[q] !== a) {
        right[q] = a;
        saved++;
      }
    }

    // 当前站点结果页的每题结构。只在明确“正确”图标/文字或明确“正确答案”字段时学习。
    var items = document.querySelectorAll('.state_cour_lis, [data-question-result], .question-result, .exam-result-item');
    for (var ii = 0; ii < items.length; ii++) {
      var item = items[ii];
      var questionEl = item.querySelector('[data-question], .q_name, .question-text, p[title], p');
      var question = cleanQuestion(questionEl ? (questionEl.getAttribute('title') || questionEl.textContent) : '');
      if (!question) continue;
      var itemText = (item.textContent || '').replace(/\s+/g, ' ');
      var explicit = itemText.match(/正确答案\s*[：:]\s*(?:[A-Za-z][、.，,)\s]*)?(.+?)(?:您的答案|$)/);
      if (explicit && explicit[1]) {
        save(question, explicit[1]);
        continue;
      }
      var icon = item.querySelector('img');
      var iconSignal = icon ? [icon.src, icon.alt, icon.title, icon.className].join(' ') : '';
      var isCorrect = /bar_img|right|correct|success|dui|正确/i.test(iconSignal) ||
        /(?:^|\s)(?:回答正确|答对|正确)(?:\s|$)/.test(itemText);
      var isWrong = /wrong|error|incorrect|错误|答错/i.test(iconSignal) || /回答错误|答错/.test(itemText);
      if (isCorrect && !isWrong) save(question, submittedFor(question));
    }

    // 兼容表格结果页，但必须存在明确的“正确答案：”标签。
    var rows = document.querySelectorAll('table tr');
    for (var ri = 0; ri < rows.length; ri++) {
      var rowText = (rows[ri].textContent || '').replace(/\s+/g, ' ').trim();
      var answerMatch = rowText.match(/正确答案\s*[：:]\s*(?:[A-Za-z][、.，,)\s]*)?(.+?)(?:您的答案|得分|$)/);
      if (!answerMatch) continue;
      var qNode = rows[ri].querySelector('.q_name, .question-text, [data-question], td');
      if (qNode) save(qNode.textContent, answerMatch[1]);
    }

    if (saved > 0) {
      Store.s(CONFIG.keys.rightAnswers, right);
      log("[考试结果] 已保存 " + saved + " 道经结果页验证的正确答案");
    } else {
      log("[考试结果] 本页没有可验证的新答案");
    }
    Store.d('HY_LastSubmittedAnswers');
  } catch(error) {
    log("[考试结果] 出错: " + error.message);
  }

  if (callback) setTimeout(callback, 3000);
}

// ═══════════════════════════════════════════════════════════════
// 8. 控制面板 (完全重新设计)
// ═══════════════════════════════════════════════════════════════
// 采用DOM API创建, 避免内联HTML脆弱性
// ═══════════════════════════════════════════════════════════════

var _panelInstance = null;

function createControlPanel() {
  if (document.getElementById("HY_controlPanel")) return;
  
  var panel = document.createElement("div");
  panel.id = "HY_controlPanel";
  panel.style.cssText = "position:fixed;top:80px;right:10px;z-index:999999;" +
    "background:rgba(25,25,30,.92);border:1px solid rgba(76,176,249,.35);" +
    "border-radius:10px;padding:0;box-shadow:0 4px 24px rgba(0,0,0,.4);" +
    "font-size:12px;font-family:Microsoft YaHei,sans-serif;" +
    "min-width:220px;color:#e0e0e0;";
  
  // Header
  var header = document.createElement("div");
  header.id = "HY_header";
  header.style.cssText = "background:linear-gradient(135deg,#1565C0,#0D47A1);" +
    "padding:8px 12px;border-radius:10px 10px 0 0;cursor:move;" +
    "font-size:13px;font-weight:bold;display:flex;align-items:center;" +
    "justify-content:space-between;user-select:none;";
  
  var titleSpan = document.createElement("span");
  titleSpan.textContent = '\u{1F916} 华医小助手 v' + HY_VERSION;
  
  var minBtn = document.createElement("span");
  minBtn.id = "HY_minBtn";
  minBtn.textContent = '\u2212';
  minBtn.style.cssText = "cursor:pointer;font-size:16px;opacity:.8;padding:0 4px;";
  
  header.appendChild(titleSpan);
  header.appendChild(minBtn);
  
  // Body container
  var body = document.createElement("div");
  body.id = "HY_body";
  body.style.cssText = "padding:8px 12px;";
  
  // Status bar
  var statusRow = document.createElement("div");
  statusRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
  
  var statusDot = document.createElement("span");
  statusDot.id = "HY_statusDot";
  statusDot.style.cssText = "width:8px;height:8px;border-radius:50%;background:#4caf50;display:inline-block;";
  
  var statusLabel = document.createElement("span");
  statusLabel.id = "HY_statusLabel";
  statusLabel.style.cssText = "color:#aaa;font-size:11px;";
  statusLabel.textContent = '\u{1F7E2} 就绪';
  
  statusRow.appendChild(statusDot);
  statusRow.appendChild(statusLabel);
  
  // Credit status display (v3.5.0)
  var creditBox = document.createElement("div");
  creditBox.id = "HY_creditBox";
  creditBox.style.cssText = "background:rgba(255,255,255,.05);border-radius:4px;padding:4px 6px;margin-bottom:6px;font-size:11px;";
  creditBox.innerHTML = '<span style="color:#888">学分:</span> <span id="HY_creditEarned" style="color:#4caf50;font-weight:bold">--</span>/<span id="HY_creditTarget" style="color:#aaa">25</span>';
  
  // Task progress display
  var taskBox = document.createElement("div");
  taskBox.id = "HY_taskBox";
  taskBox.style.cssText = "background:rgba(255,255,255,.05);border-radius:4px;padding:4px 6px;margin-bottom:6px;font-size:11px;";
  taskBox.innerHTML = '<span style="color:#888">进度:</span> <span id="HY_taskProgress" style="color:#2196f3">0/0</span>';
  
  // Mode selector
  var modeSelect = document.createElement("select");
  modeSelect.id = "HY_modeSelect";
  modeSelect.style.cssText = "width:100%;padding:4px 6px;margin-bottom:6px;" +
    "border:1px solid rgba(255,255,255,.15);border-radius:4px;" +
    "background:rgba(255,255,255,.08);color:#e0e0e0;font-size:12px;";
  
  var modes = [
    { v: 'auto', l: '\u{1F916} 智能规划' },
    { v: 'full', l: '\u{1F4DD} 视频+考试' },
    { v: 'video', l: '\u{1F4FA} 仅视频' },
    { v: 'plan', l: '\u{1F4CB} 仅规划' }
  ];
  for (var mi = 0; mi < modes.length; mi++) {
    var opt = document.createElement("option");
    opt.value = modes[mi].v;
    opt.textContent = modes[mi].l;
    if (modes[mi].v === 'auto') opt.selected = true;
    modeSelect.appendChild(opt);
  }
  
  // Button rows
  var btnRow1 = document.createElement("div");
  btnRow1.style.cssText = "display:flex;gap:4px;margin-bottom:4px;";
  
  var makePlanBtn = createBtn('\u{1F3AF} 计划', '#1565C0', function() {
    if (!URL.isVueSPA() && !URL.isCME && !URL.isStudyList) {
      log('[UI] 跳转到课程列表页生成计划...');
      Store.s('__HY_startRequested', true);
      safeNavigate('/cme/index');
      return;
    }
    var analysis = CreditPlanner.analyze();
    if (analysis) {
      log('[学分] 已获: ' + analysis.totalEarned + '/' + analysis.targetTotal);
      var plan = CreditPlanner.generatePlan(analysis);
      if (plan) log('[UI] 计划已生成: ' + plan.tasks.length + ' 个任务');
      SmartEngine.showTasks();
    }
  });
  
  var startBtn = createBtn('\u25B6 执行', '#2e7d32', function() {
    SmartEngine.start();
  });
  
  var stopBtn = createBtn('\u23F8 暂停', '#c62828', function() {
    SmartEngine.stop();
  });
  
  btnRow1.appendChild(makePlanBtn);
  btnRow1.appendChild(startBtn);
  btnRow1.appendChild(stopBtn);
  
  // Second button row
  var btnRow2 = document.createElement("div");
  btnRow2.style.cssText = "display:flex;gap:4px;";
  
  var logBtn = createBtn('\u{1F4DD} 日志', '#546e7a', function() {
    var logEl = document.getElementById("HY_log");
    if (logEl) logEl.style.display = logEl.style.display === "none" ? "block" : "none";
  });
  
  var statusBtn = createBtn('\u{1F4CA} 状态', '#6a1b9a', function() {
    var analysis = CreditPlanner.analyze();
    if (analysis) {
      log('[学分] 已获: ' + analysis.totalEarned + '/' + analysis.targetTotal +
          ' 公需: ' + analysis.publicEarned + '/' + analysis.publicTarget);
    }
  });
  
  var refreshBtn = createBtn('\u21BB', '#e65100', function() {
    log('[UI] 刷新页面');
    location.reload();
  });
  
  btnRow2.appendChild(logBtn);
  btnRow2.appendChild(statusBtn);
  btnRow2.appendChild(refreshBtn);
  
  // Log area
  var logArea = document.createElement("div");
  logArea.id = "HY_log";
  logArea.style.cssText = "display:block;background:rgba(0,0,0,.7);color:#0f0;" +
    "padding:6px;border-radius:4px;max-height:180px;overflow-y:auto;" +
    "font-family:monospace;font-size:10px;margin-top:6px;white-space:pre-wrap;line-height:1.4;";
  
  // Assemble body
  body.appendChild(statusRow);
  body.appendChild(creditBox);
  body.appendChild(taskBox);
  body.appendChild(modeSelect);
  body.appendChild(btnRow1);
  body.appendChild(btnRow2);
  body.appendChild(logArea);
  
  // Assemble panel
  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);
  
  // === Event handlers ===
  minBtn.onclick = function() {
    body.style.display = body.style.display === "none" ? "block" : "none";
    minBtn.textContent = body.style.display === "none" ? "+" : "\u2212";
  };
  
  modeSelect.onchange = function() {
    Store.s(CONFIG.keys.mode, this.value);
    log('[UI] 模式: ' + this.value);
  };
  
  // Drag
  header.onpointerdown = function(e) {
    e.preventDefault();
    var ox = panel.offsetLeft;
    var oy = panel.offsetTop;
    var sx = e.clientX;
    var sy = e.clientY;
    
    function onMove(ev) {
      var left = Math.max(0, Math.min(ox + ev.clientX - sx, window.innerWidth - panel.offsetWidth));
      var top = Math.max(0, Math.min(oy + ev.clientY - sy, window.innerHeight - panel.offsetHeight));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
    }
    
    function onUp() {
      panel.removeEventListener('pointermove', onMove);
      panel.removeEventListener('pointerup', onUp);
      panel.removeEventListener('pointercancel', onUp);
    }
    
    panel.addEventListener('pointermove', onMove, { passive: true });
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', onUp);
  };
  
  // Restore saved position
  var savedLeft = Store.g('HY_panelLeft', '');
  var savedTop = Store.g('HY_panelTop', '');
  if (savedLeft) { panel.style.left = savedLeft; panel.style.right = 'auto'; }
  if (savedTop) panel.style.top = savedTop;
  
  // Expose state control
  // v3.5.0: Update credit display
  window.HY_updateCredits = function(earned, target, publicEarned, publicTarget) {
    var el = document.getElementById('HY_creditEarned');
    var el2 = document.getElementById('HY_creditTarget');
    if (el) el.textContent = earned;
    if (el2) el2.textContent = target || 25;
  };
  
  // v3.5.0: Update task progress
  window.HY_updateTaskProgress = function(current, total) {
    var el = document.getElementById('HY_taskProgress');
    if (el) el.textContent = current + '/' + total;
  };
  
  window.HY_setPanelState = function(state, label) {
    var states = {
      idle:    { c: '#9e9e9e', l: '\u{1F7E2} 等待中' },
      ready:   { c: '#4caf50', l: '\u{1F7E2} 就绪' },
      navigating: { c: '#2196f3', l: '\u{1F535} 导航中' },
      video:   { c: '#2196f3', l: '\u{1F535} 刷视频' },
      exam:    { c: '#ff9800', l: '\u{1F7E1} 考试中' },
      survey:  { c: '#9c27b0', l: '\u{1F7E3} 问卷中' },
      paused:  { c: '#f44336', l: '\u{1F534} 已暂停' },
      done:    { c: '#4caf50', l: '\u{1F7E2} 已完成' },
      error:   { c: '#f44336', l: '\u{1F534} 出错' }
    };
    var s = states[state] || states.ready;
    var dot = document.getElementById('HY_statusDot');
    var lbl = document.getElementById('HY_statusLabel');
    if (dot) dot.style.background = s.c;
    if (lbl) lbl.textContent = label || s.l;
  };
  
  window.HY_setPanelState('ready');
  _panelInstance = panel;
}

function createBtn(text, color, onClick) {
  var btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = "flex:1;padding:5px;border:none;border-radius:4px;" +
    "color:#fff;cursor:pointer;font-size:11px;background:" + color + ";" +
    "transition:opacity .2s;";
  btn.onmouseenter = function() { btn.style.opacity = '.8'; };
  btn.onmouseleave = function() { btn.style.opacity = '1'; };
  btn.onclick = onClick;
  return btn;
}

// ═══════════════════════════════════════════════════════════════
// 9. 主路由 - 页面类型分发
// ═══════════════════════════════════════════════════════════════
// 基于真实URL和DOM特征自动判断处理方式
// ═══════════════════════════════════════════════════════════════

function mainRouter() {
  log('[路由] ' + URL.full.substring(0, 100));

  if (URL.isLogin) {
    LoginController.handle();
    return;
  }
  
  // 创建UI
  createControlPanel();

  if (Store.g(CONFIG.keys.paused, false)) {
    SmartEngine._running = false;
    SmartEngine.updateUI('paused');
    log('[路由] 自动流程已暂停，等待用户点击执行');
    return;
  }
  
  // 清理页面限制
  cleanupRestrictions();
  fixWindowOpenLinks();
  
  // 处理页面
  try {
    if (URL.isSurvey) {
      // 问卷页 - 自动处理
      log('[路由] 检测到问卷页');
      SmartEngine.handleSurvey();
    }
    else if (URL.isVideo) {
      // 视频页 - 等待播放
      log('[路由] 视频页');
      SmartEngine.handleVideo();
    }
    else if (URL.isExam) {
      // 考试页 - 答题
      log('[路由] 考试页');
      SmartEngine.handleExam();
    }
    else if (URL.isExamResult) {
      // 考试结果页
      log('[路由] 考试结果页');
      SmartEngine.handleExamResult();
    }
    else if (URL.isInteractiveCase) {
      // Interactive case page (hdbl.91huayi.com) - Vue SPA
      log('[路由] 互动病例页');
      SmartEngine.handleInteractiveCase();
    }
    else if (URL.isHDExamResult) {
      // HD exam result page
      log('[路由] HD考试结果页');
      SmartEngine.handleExamResult();
    }
    else if (URL.isCertificateApply) {
      // 申请证书页 - 自动点击申请按钮
      log('[路由] 申请证书页');
      SmartEngine.handleCertificateApply();
    }
    else if (URL.isCardSelect) {
      log('[路由] 培训卡选择页');
      SmartEngine.handleCardSelect();
    }
    else if (URL.isCourseDetail) {
      // 课程详情页
      log('[路由] 课程详情页');
      if (SmartEngine._running) {
        SmartEngine.handleCurrentPage();
      } else {
        // 自动进入课件模式: 扫描课件并进入第一个未完成的
        setTimeout(function() {
          var cws = VueCourseScanner.scanFromCourseDetail();
          if (cws.length > 0) {
            // 找第一个未完成的课件
            var found = null;
            for (var i = 0; i < cws.length; i++) {
              if (!cws[i].completed) {
                found = cws[i];
                break;
              }
            }
            if (found) {
              log('[路由] 自动进入课件: ' + found.name + ' (' + found.status + ')');
              safeNavigate(found.href);
            } else {
              // All coursewares completed but course may need exam
              // Enter first courseware to reach video page with #jrks exam button
              log('[路由] 所有课件已完成, 进入第一个课件查找考试入口');
              if (cws.length > 0 && cws[0].href) {
                Store.s('__HY_lookingForExam', true);
                safeNavigate(cws[0].href);
              }
            }
          }
        }, 2000);
      }
    }
    else if (URL.isVueSPA() || URL.isCME) {
      // Vue SPA主页面 - 课程列表
      log('[路由] Vue SPA课程页面 (等待Vue渲染)');
      // 立即重写btn67链接(ASP.NET组件可能嵌入Vue页面)
      fixWindowOpenLinks();
      // 多次尝试扫描, 等待Vue渲染完成
      var retryCount = 0;
      var maxRetries = 6;
      var seenVuePages = {};
      var vuePageWaits = 0;
      var vuePagesScanned = 0;
      function tryVueScan() {
        if (SmartEngine._running) {
          SmartEngine.handleCurrentPage();
          return;
        }
        var analysis = CreditPlanner.analyze();
        if (Store.g('__HY_needMoreCourses', false) && analysis && analysis.courses.length > 0) {
          var currentCards = VueCourseScanner.scanFromVueSPA();
          var signature = currentCards.map(function(course) { return course.link || course.name; }).sort().join('|');
          if (signature && seenVuePages[signature]) {
            vuePageWaits++;
            if (vuePageWaits <= 4) {
              setTimeout(tryVueScan, 1500);
              return;
            }
          } else if (signature) {
            seenVuePages[signature] = true;
            vuePageWaits = 0;
            vuePagesScanned++;
          }
          if (vuePagesScanned < 100 && VueCourseScanner.advanceVuePage()) {
            log('[课程发现] 已扫描第 ' + vuePagesScanned + ' 页，继续下一页');
            setTimeout(tryVueScan, 2500);
            return;
          }
          log('[课程发现] 分页扫描完成，共发现 ' + analysis.courses.length + ' 门课程');
        }
        if (analysis && !analysis.met) {
          log('[学分] 缺口: ' + analysis.totalRemaining + '分 (公需' + analysis.publicRemaining + ', 其他' + analysis.otherRemaining + ')');
          CreditPlanner.showQuickStatus(analysis);
          if (!SmartEngine._running) {
            if (Store.g('__HY_needMoreCourses', false)) {
              Store.d('__HY_needMoreCourses');
              log('[引擎] 从学习记录页转来, 寻找新课程补充计划...');
              var discoveredPlan = CreditPlanner.generatePlan(analysis);
              if (discoveredPlan && discoveredPlan.tasks.length > 0) {
                SmartEngine._running = true;
                log('[引擎] 已从完整课程目录生成 ' + discoveredPlan.tasks.length + ' 项任务');
                SmartEngine.showTasks();
                var firstTask = SmartEngine.getCurrentTask();
                if (firstTask) SmartEngine.navigateToTask(firstTask);
              } else {
                log('[引擎] 无可用新课程');
                SmartEngine._running = false;
                SmartEngine.updateUI('done');
              }
            } else {
              log('[引擎] 发现课程, 自动开始执行计划');
              SmartEngine.start();
            }
          }
        } else if (!analysis || analysis.total === 0) {
          retryCount++;
          if (retryCount <= maxRetries) {
            var delay = retryCount * 3000;
            log('[路由] Vue未渲染完成, ' + Math.round(delay/1000) + '秒后重试(' + retryCount + '/' + maxRetries + ')');
            setTimeout(tryVueScan, delay);
          }
        }
      }
      setTimeout(tryVueScan, 2000);
    }
    else if (URL.isStudyList) {
      log('[路由] 学习记录页(ASP.NET)');
      var studyCredits = VueCourseScanner.scanCreditsFromASP();
      if (studyCredits) {
        log('[学分] ASP.NET表格: 已获' + studyCredits.total + '分, 待处理' + studyCredits.courses.filter(function(c){return !c.completed;}).length + '门课');
      }
      // If start was requested, continue with plan generation
      if (Store.g('__HY_startRequested', false) && !SmartEngine._running) {
        Store.d('__HY_startRequested');
        log('[引擎] 从学习记录页开始执行...');
        SmartEngine.start();
      } else if (SmartEngine._running) {
        SmartEngine.handleCurrentPage();
      }
    }
    else if (URL.isError) {
      log('[路由] 错误页, 15秒后刷新');
      setTimeout(function() { location.reload(); }, 15000);
    }
    else {
      log('[路由] 其他页面: ' + URL.last);
    }
  } catch(e) {
    log('[路由] 处理错误: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. 初始化
// ═══════════════════════════════════════════════════════════════
function init() {
  // 全局错误捕获
  try {
    window.addEventListener('error', function(e) {
      console.log('[HYv3] [错误] ' + e.message);
    });
  } catch(e) {}
  
  // 启动主路由
  mainRouter();
}

// 测试入口只暴露纯解析/状态组件，不启动计时器和页面导航。
if (window.__HY_TEST_MODE__) {
  window.__HY_TEST_API__ = {
    CONFIG: CONFIG,
    Store: Store,
    URL: URL,
    VueCourseScanner: VueCourseScanner,
    parseVueCourseCard: VueCourseScanner.parseVueCourseCard.bind(VueCourseScanner),
    CreditPlanner: CreditPlanner,
    SmartEngine: SmartEngine,
    LoginController: LoginController,
    shouldRetryLogin: LoginController.shouldRetryLogin.bind(LoginController),
    findQuestions: findQuestions,
    getQuestionFingerprint: getQuestionFingerprint,
    extractOptions: extractOptions,
    smartScore: smartScore,
    chooseExamOptionWithStrategy: chooseExamOptionWithStrategy,
    getExamProbeStrategy: getExamProbeStrategy,
    doResult: doResult,
    learnFailedSubmittedAnswersFromResult: learnFailedSubmittedAnswersFromResult,
    fillSurveyForm: fillSurveyForm,
    isElementEnabled: isElementEnabled,
    findInteractiveAction: findInteractiveAction
  };
}
// 根据DOM就绪状态启动
else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    // Vue SPA需要额外等待Vue渲染
    if (window.location.href.indexOf('/cme/') !== -1) {
      setTimeout(init, 1500);
    } else {
      setTimeout(init, 800);
    }
  });
} else {
  if (window.location.href.indexOf('/cme/') !== -1) {
    setTimeout(init, 1500);
  } else {
    setTimeout(init, 800);
  }
}

}

// 启动脚本
__HY_main();

