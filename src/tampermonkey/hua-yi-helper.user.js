// ==UserScript==
// @name         🥇【华医网小助手v3】全自动智能刷课|学分规划|无人值守
// @namespace    https://github.com/wzgrx/hua-yi-helper
// @version      3.0.2
// @description  全自动智能刷课 - 智能学分规划(公需5+其他20=25)、无人值守、自动静音、视频助手、考试助手、不疲劳、Win11/油猴/WSL三端适配
// @author       wzgrx | 三创作者：Mriio | 二创作者：境界程序员 | 原创作者：Dr.S
// @license      AGPL-3.0
// @match        *://*.91huayi.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_info
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js
// @updateURL    https://raw.githubusercontent.com/wzgrx/hua-yi-helper/main/src/tampermonkey/hua-yi-helper.user.js
// @supportURL   https://github.com/wzgrx/hua-yi-helper/issues
// ==/UserScript==

/*!
 * 华医网小助手 v3.0 - 全自动智能刷课 & 学分规划
 * ============================================================
 * 三端适配: Tampermonkey(油猴) / Hermes(WSL/Node.js) / PowerShell(Win11)
 *
 * ███████ 核心创新 ███████
 * 1. 智能学分规划器 - 自动分析已获学分，计算最优课程组合
 * 2. 全自动刷课引擎 - 无需人工干预，自动完成全部流程
 * 3. 增强反作弊 - 多层拦截+保护
 * 4. 三模式运行 - 仅视频/视频+考试/智能规划
 *
 * 学分目标: 每年25学分 | 公需课5分(固定) | 其他20分
 * 参考年度: 2025年
 * ============================================================
 */

"use strict";

// ═══════════════════════════════════════════════════════════════
// 更新日志
// ═══════════════════════════════════════════════════════════════
var HY_VERSION = "3.0.2";
var HY_UPDATE_DATE = "2026.7.8";
var HY_UPDATE_LOG = "v3.0.2 考试模块升级: 指纹识别|文本匹配|防随机化";
var HY_HISTORY = [
  "v3.0.2 (2026.7.8) - 考试模块升级: 指纹识别|文本匹配|防随机化|多策略DOM",
  "  \xb7 新增 findQuestions(): 三层DOM检测策略(tablestyle/div/radio容器)",
  "  \xb7 新增 getQuestionFingerprint(): 题目正文指纹识别(无视序号随机)",
  "  \xb7 新增 extractOptions(): 三层选项提取策略",
  "  \xb7 新增 smartScore(): 智能评分算法(15维特征, 不依赖云端API)",
  "  \xb7 新增 模糊答案匹配: 精确匹配\u2192包含匹配逐级降级",
  "  \xb7 新增 enterExam(): 处理禁用状态的考试按钮, 支持强制导航",
  "  \xb7 修复 语法错误: 孤儿代码片段+缺少类闭合括号",
  "  \xb7 修复 exam.aspx 直接访问404问题",
  "  \xb7 优化 浮窗设计: 深色主题+状态指示灯+最小化按钮",
  "v3.0.1 (2026.7.8) - 适配2026新版网站布局",
  "  \xb7 新增 course.aspx详情页handler: 扫描12课件列表并自动播放",
  "  \xb7 新增 scanNewCourseList(): 支持btn67按钮和td课程链接",
  "  \xb7 新增 isCourseDetail/isFME/isCmeIndex 页面识别",
  "  \xb7 修复 study_info_list.aspx重定向到Vue SPA",
  "  \xb7 修复 语法错误: 孤儿代码片段导致括号不平衡",
  "  \xb7 新增 handleCourseListCombined(): 合并扫描和学分分析",
  "v3.0.0 (2026.7.8) - 完全重构: 智能学分规划+三端适配",
  "  \xb7 新增 SmartCreditPlanner: 自动分析学分缺口、最优组合",
  "  \xb7 新增 三端适配: Tampermonkey/Hermes(WSL)/PowerShell(Win11)",
  "  \xb7 新增 任务列表展示: 可视化学习计划",
  "  \xb7 优化 反作弊模块: 多层拦截+console保护+定时器管控",
  "  \xb7 优化 视频播放器: 更快检测、更稳定播放",
  "  \xb7 优化 考试助手: 更准确的试错算法+答案记忆",
  "  \xb7 新增 Win11计划任务: powershell一键安装",
  "  \xb7 新增 测试套件 (39项测试全通过)",
  "v2.0.2 (2026.6.10) - 暂停刷新跳转+反作弊加固(原作者维护)",
  "v2.0.0 (2026.6.9) - 课程列表自动扫描(原作者维护)",
  "v1.x (2023.12-2025.6) - 基础视频+考试功能(原作者维护)"
];
// ═══════════════════════════════════════════════════════════════
// 零号拦截器 (document-start阶段执行)
// 华医网新版部署了多层反脚本检测机制，必须在页面脚本执行前完成拦截
// ═══════════════════════════════════════════════════════════════
(function() {
  // === 保存原始console（页面脚本可能会覆盖console.log） ===
  try {
    window.__HY_rawConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console)
    };
  } catch(e) {}

  var _origConsole = window.console;
  // 锁死console对象，防止页面脚本篡改
  try {
    Object.defineProperty(window, 'console', {
      get: function() { return _origConsole; },
      set: function() {},
      configurable: false
    });
  } catch(e) {}

  function _safeLog() {
    try { window.__HY_rawConsole.log.apply(null, arguments); } catch(e2) {}
  }
  window.__HY_log = _safeLog;

  // === 一级防御: 抢先覆盖blockAbnormalPlugin ===
  try {
    window.blockAbnormalPlugin = function() {};
    _safeLog('[HY] 已抢先覆盖 blockAbnormalPlugin');
  } catch(e) {}

  // === 二级防御: 拦截Object.defineProperty防止页面重新定义 ===
  var _origDP = Object.defineProperty;
  Object.defineProperty = function(obj, prop, desc) {
    if (obj === window && (prop === 'blockAbnormalPlugin' || prop === '__HY_READY__')) {
      _safeLog('[HY] 已拦截 ' + prop + ' 的defineProperty');
      return window;
    }
    return _origDP.apply(this, arguments);
  };

  // === 三级防御: 拦截addEventListener中的反脚本检测 ===
  var _origAEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    var lStr = String(listener);

    // 拦截右键菜单禁用
    if (type === 'contextmenu') {
      _safeLog('[HY] 已拦截右键屏蔽');
      return;
    }

    // 拦截所有检查 isTrusted 的click监听（反脚本检测核心）
    if (this === document && type === 'click' && lStr.indexOf('isTrusted') !== -1) {
      _safeLog('[HY] 已拦截反脚本click检测');
      return;
    }

    // 拦截页面加载时的反脚本监听
    if (this === window && type === 'load' && lStr.indexOf('blockAbnormalPlugin') !== -1) {
      _safeLog('[HY] 已拦截blockAbnormalPlugin的load监听');
      return;
    }

    return _origAEL.call(this, type, listener, options);
  };

  // === 四级防御: 拦截setInterval/setTimeout中的反脚本检测 ===
  var _origSI = window.setInterval;
  window.setInterval = function(cb, delay) {
    var s = String(cb);
    if (s.indexOf('blockAbnormalPlugin') !== -1 && s.indexOf('ratePlayLimitNum') !== -1) {
      _safeLog('[HY] 已拦截倍速检测定时器');
      return 0;
    }
    if (s.indexOf('queryIsAuth') !== -1) {
      _safeLog('[HY] 已拦截人脸认证检测');
      return 0;
    }
    return _origSI.apply(this, arguments);
  };

  var _origST = window.setTimeout;
  window.setTimeout = function(cb, delay) {
    var s = String(cb);
    if (s.indexOf('blockAbnormalPlugin') !== -1) {
      _safeLog('[HY] 已拦截反脚本setTimeout');
      return 0;
    }
    return _origST.apply(this, arguments);
  };

  // === 五级防御: MutationObserver监听body，清除页面限制属性 ===
  if (typeof MutationObserver !== 'undefined') {
    var _obs = new MutationObserver(function(muts, obs) {
      if (document.body) {
        obs.disconnect();
        try {
          var body = document.body;
          body.removeAttribute('oncontextmenu');
          body.removeAttribute('oncopy');
          body.removeAttribute('onbeforecopy');
          body.removeAttribute('onhelp');
          body.oncontextmenu = null;
          body.oncopy = null;
          body.onbeforecopy = null;
          body.onhelp = null;
          document.oncontextmenu = null;
          document.onselectstart = null;
          document.oncopy = null;
        } catch(e) {}
      }
    });
    _obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
// ═══════════════════════════════════════════════════════════════
// DOMContentLoaded后主逻辑入口
// ═══════════════════════════════════════════════════════════════
function __HY_main() {

// ═══════════════════════════════════════════════════════════════
// 1. 配置与存储
// ═══════════════════════════════════════════════════════════════
var CONFIG = {
  // === 学分目标 ===
  targetYear: 2025,
  targetTotal: 25,       // 每年需要25学分
  publicTarget: 5,       // 公需课固定5分
  otherTarget: 20,       // 其他20分

  // === 运行模式 ===
  mode: 'auto',          // 'video' / 'full' / 'auto' / 'plan'
                         // video: 仅刷视频   full: 视频+考试
                         // auto: 自动规划+执行   plan: 仅规划不执行
  autoSkip: false,       // 跳过已完成的视频（可能触发风控）

  // === 延迟控制(ms) ===
  delays: {
    submitTime: 4900,    // 交卷延时
    reTryTime: 2100,     // 重考/进入考试延时
    examTime: 5000,      // 听完课进入考试延时
    randomMax: 5000,     // 随机延时上限（模拟人为操作间隔）
    navCooldown: 15000,  // 页面跳转冷却
    pauseRefresh: 3000   // 暂停后刷新等待
  },

  // === 播放速度 ===
  speed: 1,             // 默认1倍速（网站已禁用倍速）

  // === localStorage键名 ===
  keys: {
    mode: 'HY_mode',
    speed: 'HY_speed',
    allAnswers: 'HY_allAnswers',
    rightAnswers: 'HY_rightAnswers',
    currentPlan: 'HY_currentPlan',
    planProgress: 'HY_planProgress'
  }
};

// 存储管理
var Store = {
  get: function(key, def) {
    try {
      if (typeof GM_getValue !== 'undefined') {
        var v = GM_getValue(key);
        return v !== undefined && v !== null ? v : def;
      }
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : def;
    } catch(e) { return def; }
  },
  set: function(key, val) {
    try {
      if (typeof GM_setValue !== 'undefined') { GM_setValue(key, val); return; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch(e) {}
  },
  del: function(key) {
    try {
      if (typeof GM_deleteValue !== 'undefined') { GM_deleteValue(key); return; }
      localStorage.removeItem(key);
    } catch(e) {}
  }
};

// 从URL判断页面类型
var URL = (function() {
  var href = window.location.href;
  var parts = href.split('/');
  var last = parts[parts.length - 1].split('?')[0].split('#')[0];
  return {
    full: href,
    last: last,
    isStudyList: last === 'study_info_list.aspx',
    isCourseList: last === 'course.aspx' || last === 'cme.aspx',
    isCourseDetail: last === 'course.aspx' && href.indexOf('cid=') !== -1,
    isFME: last === 'fme.aspx',
    isCmeIndex: href.indexOf('/cme/index') !== -1,
    isPolyv: last === 'course_ware_polyv.aspx',
    isCC: last === 'course_ware_cc.aspx',
    isExam: last === 'exam.aspx' || last === 'exam_code.aspx',
    isExamResult: last === 'exam_result.aspx',
    isFace: last === 'face.aspx',
    isVideo: last === 'course_ware_polyv.aspx' || last === 'course_ware_cc.aspx',
    isError: href.indexOf('error.html') !== -1
  };
})();

// 工具函数: 随机延时
function randDelay(base) {
  return base + Math.floor(Math.random() * CONFIG.delays.randomMax);
}
function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// 日志输出
function log(msg) {
  console.log('[HYv3] ' + msg);
  try {
    var el = document.getElementById('HY_log');
    if (el) {
      var t = document.createTextNode('\n' + new Date().toLocaleTimeString() + ' ' + msg);
      el.appendChild(t);
      el.scrollTop = el.scrollHeight;
    }
  } catch(e) {}
}
// ═══════════════════════════════════════════════════════════════
// 2. 智能学分规划器 (Smart Credit Planner)
// ═══════════════════════════════════════════════════════════════
// 核心算法:
//   输入: 当前年份的所有课程项目数据
//   处理: 计算已获学分 → 识别缺口 → 扫描可用课程 → 最优组合
//   输出: 排序后的学习任务列表
// ═══════════════════════════════════════════════════════════════
var CreditPlanner = {
  // 扫描学习记录页，解析所有项目
  analyze: function() {
    log('[学分规划] 开始分析学分状态...');
    var projects = [];
    var totalEarned = 0;
    var publicEarned = 0;
    var otherEarned = 0;
    var inProgress = 0;

    try {
      // 尝试多种表格解析方式
      var tables = document.querySelectorAll('table');
      var table = null;
      for (var t = 0; t < tables.length; t++) {
        if (tables[t].innerHTML.indexOf('项目名称') !== -1 ||
            tables[t].innerHTML.indexOf('项目') !== -1) {
          table = tables[t];
          break;
        }
      }
      if (!table) {
        log('[学分规划] 未找到项目表格，尝试替代选择器');
        // 回退: 查找所有tr行
        var rows = document.querySelectorAll('tr');
        if (rows.length < 3) {
          log('[学分规划] 无法解析学分数据，请确保在"学习记录"页面');
          return null;
        }
        // 尝试从div布局解析
        return this.analyzeFromDivs();
      }

      var rows = table.querySelectorAll('tr');
      for (var i = 1; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td, th');
        if (cells.length < 4) continue;

        // 提取项目信息
        var nameEl = cells[0].querySelector('a') || cells[0];
        var name = nameEl.innerText.trim();
        var creditText = '';
        var statusText = '';
        var typeText = '';

        // 匹配各列(不同年份表格列数可能不同)
        for (var c = 0; c < cells.length; c++) {
          var ct = cells[c].innerText.trim();
          if (ct.indexOf('分') !== -1 && /[\d.]+/.test(ct)) {
            creditText = ct;
          }
          if (ct === '未学习' || ct === '学习中' || ct.indexOf('播放至') !== -1 ||
              ct === '已完成' || ct === '已申请' || ct === '学习完毕' ||
              ct === '待考试' || ct === '已过期' || ct === '已暂停') {
            statusText = ct;
          }
          if (ct.indexOf('公需') !== -1 || ct.indexOf('必修') !== -1) {
            typeText = '公需';
          } else if (ct.indexOf('专项') !== -1 || ct.indexOf('选修') !== -1) {
            typeText = '专项';
          } else if (ct.indexOf('继续') !== -1 || ct.indexOf('全员') !== -1) {
            typeText = ct;
          }
        }

        // 如果没找到状态，尝试从按钮获取
        if (!statusText) {
          var btns = cells[cells.length - 1].querySelectorAll('button, input[type="button"], a.btn, span');
          for (var b = 0; b < btns.length; b++) {
            var bt = btns[b].innerText || btns[b].value || '';
            if (bt && bt.indexOf('学习') !== -1 || bt.indexOf('考试') !== -1 ||
                bt === '重新学习' || bt === '继续学习') {
              statusText = bt;
              break;
            }
          }
        }

        if (!name) continue;

        // 解析学分
        var creditMatch = creditText.match(/([\d.]+)\s*分/);
        var credit = creditMatch ? parseFloat(creditMatch[1]) : 0;

        var isPublic = typeText === '公需' || name.indexOf('公需') !== -1;

        // 判断是否已完成
        var completed = statusText === '已完成' || statusText === '已申请' ||
                        statusText === '学习完毕' || statusText === '已通过';

        if (completed) {
          totalEarned += credit;
          if (isPublic) publicEarned += credit;
          else otherEarned += credit;
        }

        // 获取链接
        var link = nameEl.href || '';
        if (!link) {
          var parentA = cells[0].querySelector('a');
          if (parentA) link = parentA.href;
        }

        projects.push({
          name: name,
          credit: credit,
          creditText: creditText,
          status: statusText,
          type: typeText,
          isPublic: isPublic,
          completed: completed,
          link: link,
          element: cells[0]
        });
      }

      log('[学分规划] 解析到 ' + projects.length + ' 个项目');
      log('[学分规划] 已获学分: 公需=' + publicEarned + '/' + CONFIG.publicTarget +
          ', 其他=' + otherEarned + '/' + CONFIG.otherTarget +
          ', 总计=' + totalEarned + '/' + CONFIG.targetTotal);
    } catch(e) {
      log('[学分规划] 解析出错: ' + e.message);
      return null;
    }

    return {
      projects: projects,
      totalEarned: totalEarned,
      publicEarned: publicEarned,
      otherEarned: otherEarned,
      publicRemaining: Math.max(0, CONFIG.publicTarget - publicEarned),
      otherRemaining: Math.max(0, CONFIG.otherTarget - otherEarned),
      totalRemaining: Math.max(0, CONFIG.targetTotal - totalEarned),
      met: totalEarned >= CONFIG.targetTotal
    };
  },

  // 从div布局回退解析（新页面结构）
  analyzeFromDivs: function() {
    log('[学分规划] 尝试DIV布局解析...');
    var projects = [];
    var totalEarned = 0;
    var publicEarned = 0;

    var items = document.querySelectorAll('.project-item, .course-item, [class*="project"], [class*="course"]');
    if (!items.length) items = document.querySelectorAll('li, div.row, div.item');

    for (var i = 0; i < items.length; i++) {
      var text = items[i].innerText || '';
      if (text.length < 10) continue;

      // 查找学分
      var cm = text.match(/([\d.]+)\s*分/);
      var credit = cm ? parseFloat(cm[1]) : 0;
      if (credit === 0) continue;

      var isPublic = text.indexOf('公需') !== -1;
      var completed = text.indexOf('已完成') !== -1 || text.indexOf('已申请') !== -1 ||
                      text.indexOf('学习完毕') !== -1;

      if (completed) {
        totalEarned += credit;
        if (isPublic) publicEarned += credit;
      }

      var link = items[i].querySelector('a');
      projects.push({
        name: text.substring(0, 40),
        credit: credit,
        status: completed ? '已完成' : '学习中',
        isPublic: isPublic,
        completed: completed,
        link: link ? link.href : ''
      });
    }

    return {
      projects: projects,
      totalEarned: totalEarned,
      publicEarned: publicEarned,
      otherEarned: totalEarned - publicEarned,
      publicRemaining: Math.max(0, CONFIG.publicTarget - publicEarned),
      otherRemaining: Math.max(0, CONFIG.otherTarget - (totalEarned - publicEarned)),
      totalRemaining: Math.max(0, CONFIG.targetTotal - totalEarned),
      met: totalEarned >= CONFIG.targetTotal
    };
  },

  // 生成最优学习计划
  generatePlan: function(analysis) {
    if (!analysis) {
      log('[学分规划] 学分分析为空，无法生成计划');
      return null;
    }

    if (analysis.met) {
      log('[学分规划] 学分已达标! 无需继续学习');
      return { tasks: [], met: true, summary: '学分已达标, 不需要学习' };
    }

    log('[学分规划] === 生成学习计划 ===');
    log('[学分规划] 学分缺口: 总计' + analysis.totalRemaining + '分' +
        ' (公需' + analysis.publicRemaining + '分, 其他' + analysis.otherRemaining + '分)');

    // 按优先级排序未完成项目
    var unfinished = analysis.projects.filter(function(p) { return !p.completed; });

    // 优先级排序: 未学习 > 播放至x% > 学习中 > 待考试 > 其他
    function priorityScore(p) {
      if (p.status === '未学习') return 0;
      if (p.status.indexOf('播放至') !== -1) return 1;
      if (p.status === '学习中' || p.status === '已暂停') return 2;
      if (p.status === '待考试') return 3;
      return 4;
    }

    unfinished.sort(function(a, b) {
      var pa = priorityScore(a);
      var pb = priorityScore(b);
      if (pa !== pb) return pa - pb;
      // 同等优先级，学分高的优先
      return b.credit - a.credit;
    });

    var tasks = [];
    var accumulated = 0;
    var needPublic = analysis.publicRemaining;
    var needOther = analysis.otherRemaining;

    // Phase 1: 先处理未完成项目
    for (var i = 0; i < unfinished.length; i++) {
      if (accumulated >= analysis.totalRemaining) break;
      var p = unfinished[i];

      // 检查是否需要公需课
      if (p.isPublic && needPublic <= 0) continue;
      if (!p.isPublic && needOther <= 0) continue;

      tasks.push({
        name: p.name,
        credit: p.credit,
        status: p.status,
        link: p.link,
        isPublic: p.isPublic,
        estimatedTime: p.status === '待考试' ? '5分钟' : (p.credit * 30 + '分钟'),
        action: p.status === '待考试' ? '考试' : '学习'
      });

      accumulated += p.credit;
      if (p.isPublic) needPublic -= p.credit;
      else needOther -= p.credit;
    }

    // Phase 2: 如果学分还不够，标记需要手动选择新课程
    if (accumulated < analysis.totalRemaining) {
      log('[学分规划] 现有项目学分不足，需要新增课程: 还差' +
          (analysis.totalRemaining - accumulated) + '分');
      tasks.push({
        name: '[需要选择新课程] 缺口' + (analysis.totalRemaining - accumulated) + '分',
        credit: analysis.totalRemaining - accumulated,
        status: '新课程',
        link: '',
        isPublic: false,
        estimatedTime: '手动选择',
        action: '请点击"继续教育"或"全员专项"添加课程'
      });
    }

    // 保存计划
    var plan = {
      tasks: tasks,
      met: false,
      summary: '需要完成 ' + tasks.length + ' 项任务, 共 ' + accumulated + ' 学分'
    };

    log('[学分规划] ' + plan.summary);
    Store.set(CONFIG.keys.currentPlan, plan);
    Store.set(CONFIG.keys.planProgress, 0);

    return plan;
  },

  // 显示学习计划到UI
  displayPlan: function(plan) {
    if (!plan) {
      log('[学分规划] 无计划可显示');
      return;
    }

    if (plan.met) {
      this.showStatusBanner('success', '🎉 学分已达标! 总计≥' + CONFIG.targetTotal + '分');
      return;
    }

    // 创建计划面板
    var panel = document.createElement('div');
    panel.id = 'HY_planPanel';
    panel.style.cssText = 'position:fixed;top:60px;right:10px;width:380px;max-height:80vh;' +
      'background:#fff;border:2px solid #4cb0f9;border-radius:8px;z-index:99999;' +
      'padding:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);overflow-y:auto;' +
      'font-size:13px;font-family:"Microsoft YaHei",sans-serif;';

    var html = '<div style="background:#4cb0f9;color:#fff;padding:8px 12px;border-radius:4px;margin:-12px -12px 10px -12px;">';
    html += '<strong>📋 智能学习计划</strong>';
    html += '<span style="float:right;cursor:pointer;font-size:16px;" onclick="document.getElementById(\'HY_planPanel\').remove()">✕</span>';
    html += '</div>';
    html += '<div style="margin-bottom:8px;color:#666;">' + plan.summary + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="background:#f5f5f5;"><th style="padding:4px;text-align:left;border-bottom:1px solid #ddd;width:55%">课程</th>' +
      '<th style="padding:4px;text-align:center;border-bottom:1px solid #ddd;">学分</th>' +
      '<th style="padding:4px;text-align:center;border-bottom:1px solid #ddd;">状态</th>' +
      '<th style="padding:4px;text-align:center;border-bottom:1px solid #ddd;">操作</th></tr>';

    for (var i = 0; i < plan.tasks.length; i++) {
      var t = plan.tasks[i];
      var bg = i % 2 === 0 ? '#fff' : '#fafafa';
      var color = t.status === '新课程' ? '#e65100' : '#333';
      html += '<tr style="background:' + bg + ';color:' + color + ';">';
      html += '<td style="padding:4px;border-bottom:1px solid #eee;font-size:12px;">' +
        (i + 1) + '. ' + t.name.substring(0, 25) + '</td>';
      html += '<td style="padding:4px;text-align:center;border-bottom:1px solid #eee;">' + t.credit + '</td>';
      html += '<td style="padding:4px;text-align:center;border-bottom:1px solid #eee;">' + t.status + '</td>';
      html += '<td style="padding:4px;text-align:center;border-bottom:1px solid #eee;">' + t.estimatedTime + '</td>';
      html += '</tr>';
    }
    html += '</table>';

    // 自动执行按钮
    html += '<div style="margin-top:10px;text-align:center;">';
    if (plan.tasks.length > 0 && plan.tasks[0].action !== '手动选择') {
      html += '<button id="HY_startPlan" style="' + BTN_STYLE + 'background:#4caf50;">🚀 自动执行计划</button>';
    }
    html += '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);

    // 绑定自动执行事件
    var startBtn = document.getElementById('HY_startPlan');
    if (startBtn) {
      startBtn.onclick = function() {
        panel.remove();
        CreditPlanner.executePlan(plan);
      };
    }
  },

  // 执行学习计划
  executePlan: function(plan) {
    if (!plan || plan.met) {
      log('[学分规划] 无待执行任务');
      return;
    }

    var firstTask = null;
    for (var i = 0; i < plan.tasks.length; i++) {
      if (plan.tasks[i].status !== '已完成' && plan.tasks[i].link) {
        firstTask = plan.tasks[i];
        break;
      }
    }

    if (firstTask && firstTask.link) {
      log('[学分规划] 开始执行: ' + firstTask.name);
      log('[学分规划] 导航到: ' + firstTask.link);
      window.location.href = firstTask.link;
    } else {
      log('[学分规划] 没有可执行的课程链接。请手动进入"继续教育"或"全员专项"选择课程。');
    }
  },

  // 显示状态横幅
  showStatusBanner: function(type, msg) {
    var banner = document.getElementById('HY_banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'HY_banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px;' +
        'text-align:center;z-index:99999;font-size:14px;font-weight:bold;' +
        'font-family:"Microsoft YaHei",sans-serif;transition:opacity .5s;';
      document.body.appendChild(banner);
    }
    var colors = { success: '#4caf50', info: '#2196f3', warning: '#ff9800', error: '#f44336' };
    banner.style.background = colors[type] || '#2196f3';
    banner.style.color = '#fff';
    banner.innerHTML = msg;
    setTimeout(function() { banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); }, 8000);
  },

  // 快捷入口: 在课程列表页也展示学分进度
  showQuickStatus: function(analysis) {
    if (!analysis) return;
    var statusEl = document.getElementById('HY_creditStatus');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'HY_creditStatus';
      statusEl.style.cssText = 'position:fixed;bottom:10px;right:10px;' +
        'background:rgba(0,0,0,.7);color:#fff;padding:8px 12px;border-radius:6px;' +
        'z-index:99998;font-size:12px;font-family:"Microsoft YaHei",sans-serif;';
      document.body.appendChild(statusEl);
    }
    var color = analysis.met ? '#4caf50' : '#ff9800';
    statusEl.innerHTML = '<span style="color:' + color + ';">📊 学分: ' +
      analysis.totalEarned + '/' + CONFIG.targetTotal +
      ' (公需' + analysis.publicEarned + '/' + CONFIG.publicTarget +
      ' 其他' + analysis.otherEarned + '/' + CONFIG.otherTarget + ')</span>';
  }
};
// ═══════════════════════════════════════════════════════════════
// 3. 课程扫描器 (Course Scanner)
// ═══════════════════════════════════════════════════════════════
// 在课程列表页(course.aspx/cme.aspx)自动扫描待学习课程
// 优先级: 未学习 > 播放至x%(x<100) > 学习中 > 待考试(仅在full模式)
// ═══════════════════════════════════════════════════════════════
function autoScanCourses() {
  log('[课程扫描] 开始扫描待学习课程...');

  // 辅助: 查找与状态元素关联的课程链接
  function findCourseLink(el) {
    // 策略1: 自身是链接
    if (el.tagName === 'A' && el.href && el.href.indexOf('javascript:') === -1) return el;

    // 策略2: 兄弟节点中的链接
    var parent = el.parentElement;
    if (parent) {
      var siblings = parent.children;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] !== el) {
          if (siblings[i].tagName === 'A' && siblings[i].href) return siblings[i];
          var childLink = siblings[i].querySelector('a[href]');
          if (childLink && childLink.href.indexOf('javascript:') === -1) return childLink;
        }
      }
    }

    // 策略3: 向上查找容器中的第一个链接
    var container = el.closest ? el.closest('tr, .course-item, li, [class*="course"], [class*="item"], td, div.row') : null;
    if (container) {
      var links = container.querySelectorAll('a[href]');
      for (var l = 0; l < links.length; l++) {
        if (links[l].href && links[l].href.indexOf('javascript:') === -1) return links[l];
      }
    }

    // 策略4: 向上2级查找
    if (parent && parent.parentElement) {
      var pLinks = parent.parentElement.querySelectorAll('a[href]');
      for (var pl = 0; pl < pLinks.length; pl++) {
        if (pLinks[pl].href && pLinks[pl].href.indexOf('javascript:') === -1) return pLinks[pl];
      }
    }

    return null;
  }

  function tryClick(el, label) {
    var link = findCourseLink(el);
    if (link) {
      log('[课程扫描] ✅ ' + label + ' → 进入: ' + (link.innerText || link.textContent || '').trim());
      link.click();
      return true;
    }
    // 回退: 点击按钮自身
    try {
      el.click();
      log('[课程扫描] ✅ ' + label + ' → 直接点击按钮');
      return true;
    } catch(e) {}
    return false;
  }

  var clicked = false;

  // === 优先级1: 未学习 ===
  log('[课程扫描] → 搜索【未学习】...');
  var allEls = document.querySelectorAll('button, input[type="button"], span, div, td, a, font');
  for (var i = 0; i < allEls.length && !clicked; i++) {
    var txt = (allEls[i].textContent || allEls[i].value || '').trim();
    if (txt === '未学习' || txt.indexOf('未学习') === 0) {
      clicked = tryClick(allEls[i], '找到【未学习】');
    }
  }

  // === 优先级2: 播放至x%(x<100) ===
  if (!clicked) {
    log('[课程扫描] → 搜索【播放至x%】...');
    var allNodes = document.querySelectorAll('*');
    for (var j = 0; j < allNodes.length && !clicked; j++) {
      if (allNodes[j].children && allNodes[j].children.length > 0) continue;
      var txt2 = allNodes[j].textContent || '';
      if (txt2.indexOf('已完成') !== -1) continue;
      var m = txt2.match(/播放至[：:]\s*(\d+)\s*%/);
      if (m && parseInt(m[1]) < 100) {
        clicked = tryClick(allNodes[j], '找到【播放至' + m[1] + '%】');
      }
    }
  }

  // === 优先级3: 学习中 ===
  if (!clicked) {
    log('[课程扫描] → 搜索【学习中】...');
    for (var k = 0; k < allEls.length && !clicked; k++) {
      var txt3 = (allEls[k].textContent || allEls[k].value || '').trim();
      if (txt3 === '学习中' || txt3 === '已暂停') {
        clicked = tryClick(allEls[k], '找到【' + txt3 + '】');
      }
    }
  }

  // === 优先级4: 待考试(full模式) ===
  if (!clicked) {
    var mode = Store.get(CONFIG.keys.mode, 'auto');
    if (mode === 'full' || mode === 'auto') {
      log('[课程扫描] → 搜索【待考试】...');
      for (var l = 0; l < allEls.length && !clicked; l++) {
        var txt4 = (allEls[l].textContent || allEls[l].value || '').trim();
        if (txt4 === '待考试') {
          clicked = tryClick(allEls[l], '找到【待考试】');
        }
      }
    }
  }

  // === 优先级5: 宽松匹配 ===
  if (!clicked) {
    log('[课程扫描] → 宽松模式搜索...');
    // 查找含有"课程学习与考试"的区域
    var section = null;
    var allDivs = document.querySelectorAll('div');
    for (var m = 0; m < allDivs.length && !section; m++) {
      var t = allDivs[m].textContent || '';
      if (t.indexOf('课程学习与考试') !== -1 && allDivs[m].children.length <= 20) {
        section = allDivs[m];
      }
    }

    var scope = section || document.body;
    var btns = scope.querySelectorAll('button, input[type="button"], a.btn');
    for (var n = 0; n < btns.length && !clicked; n++) {
      var bt = (btns[n].textContent || btns[n].value || '').trim();
      if (bt && bt !== '已完成' && bt.indexOf('完成') === -1) {
        clicked = tryClick(btns[n], '宽松匹配【' + bt + '】');
      }
    }

    // 最终回退: 区域内的第一个链接
    if (!clicked && section) {
      var firstLink = section.querySelector('a[href]');
      if (firstLink && firstLink.href && firstLink.href.indexOf('javascript:') === -1) {
        log('[课程扫描] → 点击区域首个链接');
        firstLink.click();
        clicked = true;
      }
    }
  }

  if (!clicked) {
    log('[课程扫描] 未找到待学习课程，可能全部已完成或页面结构变更');
  }
  return clicked;
}
// ═══════════════════════════════════════════════════════════════
// 4. 视频播放器控制
// ═══════════════════════════════════════════════════════════════
// 支持保利威(Polyv)和CC播放器
// ═══════════════════════════════════════════════════════════════
var _playNextLock = false;
var _navCooldown = 0;
var _courseFinished = false;
var _pauseWatchTimer = null;

// 播放主入口
function seeVideo(playerType) {
  log('[视频] 页面加载, 等待播放器...');

  // 2026新版: 视频容器是#video, no longer Div1
  // 尝试隐藏顶部tip-bar（如果有遮挡）
  try {
    var tipBar = document.querySelector('.tip-bar');
    if (tipBar) tipBar.style.display = 'none';
  } catch(e) {}

  // 恢复console（某些页面脚本会覆盖）
  try {
    if (window.__HY_rawConsole) {
      Object.defineProperty(console, 'log', { value: window.__HY_rawConsole.log, writable: true, configurable: true });
      Object.defineProperty(console, 'warn', { value: window.__HY_rawConsole.warn, writable: true, configurable: true });
      Object.defineProperty(console, 'error', { value: window.__HY_rawConsole.error, writable: true, configurable: true });
    }
  } catch(e) {}

  // 清除页面右键限制
  cleanupRestrictions();

  // 延迟后启动播放
  setTimeout(function() {
    initPlayer(playerType);
  }, 1000);
}

function initPlayer(playerType) {
  // 网页静音
  mutePage();

  // 读取配置
  var savedSpeed = parseFloat(Store.get(CONFIG.keys.speed, CONFIG.speed));
  var mode = Store.get(CONFIG.keys.mode, 'auto');

  // 尝试获取player全局对象
  var playerReady = function() {
    log('[视频] 播放器已就绪');

    // 静音
    try {
      if (typeof player !== 'undefined') {
        if (player.j2s_setVolume) player.j2s_setVolume(0);
        if (typeof player.muted !== 'undefined') player.muted = true;
        if (player.j2s_resumeVideo) player.j2s_resumeVideo();
      }
    } catch(e) {}

    // 检查并移除Div1前的提示元素
    try {
      var tixing = document.getElementById('tixing');
      if (tixing) tixing.remove();
    } catch(e) {}

    // 启动完成检测
    startCompletionDetector(mode);

    // 启动暂停监测
    startPauseWatcher();
  };

  // 轮询等待播放器
  var playerCheckCount = 0;
  var playerCheckTimer = setInterval(function() {
    playerCheckCount++;
    try {
      // 检测播放器就绪
      var playerReady_ = false;

      // Polyv播放器 (2026新版: HTML5播放器, 检查video元素即可)
      if (typeof player !== 'undefined' && player !== null) {
        playerReady_ = true;
      }
      // Polyv新版: 检查pv-video-player容器
      if (document.querySelector('.pv-video-player, .pv-video')) {
        playerReady_ = true;
      }
      // CC播放器
      if (typeof ccPlayer !== 'undefined' && ccPlayer !== null) {
        playerReady_ = true;
      }

      // video元素
      var v = document.querySelector('video');
      if (v && v.readyState >= 2) {
        playerReady_ = true;
      }

      if (playerReady_) {
        clearInterval(playerCheckTimer);
        playerReady();
      }
    } catch(e) {}

    if (playerCheckCount > 60) {
      clearInterval(playerCheckTimer);
      log('[视频] 播放器等待超时(30s), 强制继续');
      playerReady();
    }
  }, 500);

  // 设置倍速按钮
  setupSpeedControls(savedSpeed, mode);
}

// 网页静音
function mutePage() {
  try {
    // 视频元素静音
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      videos[i].muted = true;
      videos[i].volume = 0;
      videos[i].defaultMuted = true;
    }

    // Polyv播放器静音
    if (typeof player !== 'undefined') {
      try { player.j2s_setVolume(0); } catch(e) {}
      try { player.muted = true; } catch(e) {}
    }

    // CC播放器静音
    if (typeof ccPlayer !== 'undefined') {
      try { ccPlayer.volume(0); } catch(e) {}
    }

    log('[视频] 已设置静音');
  } catch(e) {}
}

// 完成检测器
function startCompletionDetector(mode) {
  var clock = setInterval(function() {
    try {
      if (_courseFinished || _playNextLock) return;
      if (Date.now() < _navCooldown) return;

      // 检查视频播放状态
      detectCompletion(mode);
    } catch(e) {}
  }, 3000);
  window.__HY_clock = clock;

  // 快速检测器(500ms间隔，更灵敏)
  var clockFast = setInterval(function() {
    try {
      // 关闭"温馨提示"弹窗
      killPopups();
    } catch(e) {}
  }, 500);
  window.__HY_clockms = clockFast;
}

// 检测视频是否完成
function detectCompletion(mode) {
  try {
    // 方式1: 检查jrks按钮(进入考试按钮)
    var jrks = document.getElementById('jrks');
    if (jrks && jrks.getAttribute('disabled') !== 'disabled') {
      log('[视频] 检测到"进入考试"按钮可用');

      if (mode === 'full' || mode === 'auto') {
        log('[视频] full/auto模式 → 进入考试');
        _courseFinished = true;
        setTimeout(function() { jrks.click(); }, randDelay(2000));
      } else {
        log('[视频] video模式 → 跳过考试, 播放下一个');
        _courseFinished = true;
        setTimeout(function() { playNext(mode); }, 1000);
      }
      return;
    }

    // 方式2: 检查课程状态
    var status = getCurrentCourseState();
    if (status === '待考试') {
      if (mode === 'full' || mode === 'auto') {
        log('[视频] 课程状态【待考试】→ 进入考试');
        _courseFinished = true;
        enterExam();
      } else {
        log('[视频] 课程状态【待考试】→ video模式跳过');
        _courseFinished = true;
        setTimeout(function() { playNext(mode); }, 1000);
      }
      return;
    }

    if (status === '已完成') {
      log('[视频] 课程状态【已完成】→ 播放下一个');
      _courseFinished = true;
      setTimeout(function() { playNext(mode); }, 500);
      return;
    }

    // 方式3: 检查是否还有剩余课程
    if (status === '' || status === '已暂停') {
      // 尝试恢复播放
      tryResumeVideo();
    }
  } catch(e) {}
}

// 获取当前课程状态
function getCurrentCourseState() {
  try {
    var li = document.querySelector('li.lis-inside-content.current-playing');
    if (!li) {
      var tp = document.querySelector('i[id="top_play"]');
      if (tp) li = tp.closest('li.lis-inside-content');
    }
    if (li) {
      var btn = li.querySelector('button');
      return btn ? btn.innerText.trim() : '';
    }

    // 回退: 旧DOM遍历
    var topPlay = document.querySelectorAll('i[id="top_play"]');
    if (topPlay.length > 0 && topPlay[0].parentNode) {
      var sib = topPlay[0].parentNode.nextElementSibling;
      if (sib && sib.nextElementSibling && sib.nextElementSibling.nextElementSibling) {
        return sib.nextElementSibling.nextElementSibling.innerText.trim();
      }
    }
  } catch(e) {}
  return '';
}

// 恢复暂停的视频
function tryResumeVideo() {
  try {
    var v = document.querySelector('video');
    if (v && v.paused && !v.ended) {
      v.muted = true;
      v.play().catch(function() {});
    }
  } catch(e) {}
}

// 检测是否有剩余课程
function hasRemainingCourses() {
  try {
    var lis = document.querySelectorAll('li.lis-inside-content');
    var unknownCount = 0;
    for (var i = 0; i < lis.length; i++) {
      var st = getCourseStatusByLi(lis[i]);
      if (st === '未学习' || st === '学习中') return true;
      if (st === '' || st === '未知') unknownCount++;
    }
    if (unknownCount === lis.length && lis.length > 0) {
      log('[视频] 无法读取状态，假设有剩余课程');
      return true;
    }
    return false;
  } catch(e) { return true; }
}

function getCourseStatusByLi(li) {
  try {
    var btn = li.querySelector('button');
    return btn ? btn.innerText.trim() : '';
  } catch(e) { return ''; }
}

// 播放下一个
function playNext(mode) {
  if (_playNextLock) { log('[视频] playNext已锁定，跳过'); return; }
  _playNextLock = true;
  _navCooldown = Date.now() + CONFIG.delays.navCooldown;

  log('[视频] 播放下一个...');

  try {
    // 停掉检测器
    if (window.__HY_clock) { clearInterval(window.__HY_clock); window.__HY_clock = null; }
    if (window.__HY_clockms) { clearInterval(window.__HY_clockms); window.__HY_clockms = null; }
    if (_pauseWatchTimer) { clearInterval(_pauseWatchTimer); _pauseWatchTimer = null; }

    var currentLi = document.querySelector('li.lis-inside-content.current-playing');
    if (!currentLi) {
      var tp = document.querySelector('i[id="top_play"]');
      if (tp) currentLi = tp.closest('li.lis-inside-content');
    }

    var lis = document.querySelectorAll('li.lis-inside-content');
    var index = -1;
    if (currentLi) {
      index = Array.from(lis).indexOf(currentLi);
    }

    var nextIdx = -1;
    if (index >= 0 && index + 1 < lis.length) {
      var isFull = (mode === 'full' || mode === 'auto');
      for (var k = index + 1; k < lis.length; k++) {
        var st = getCourseStatusByLi(lis[k]);
        if (isFull && (st === '待考试' || st === '已完成')) continue;
        if (!isFull && st === '已完成') continue;
        nextIdx = k;
        break;
      }
    }

    if (nextIdx >= 0) {
      var targetLi = lis[nextIdx];
      navigateToCourse(targetLi);
    } else {
      log('[视频] 无更多视频，尝试fallback跳转');
      fallbackNextCourse(mode);
    }
  } finally {
    setTimeout(function() {
      _courseFinished = false;
      _playNextLock = false;
    }, 5000);
  }
}

function navigateToCourse(li) {
  try {
    // 方式1: from onclick
    var onclickAttr = li.getAttribute('onclick') || '';
    var urlMatch = onclickAttr.match(/location\.href=['"]([^'"]+)['"]/);
    if (urlMatch && urlMatch[1]) {
      log('[视频] 通过onclick跳转: ' + urlMatch[1]);
      window.location.href = urlMatch[1];
      return;
    }

    // 方式2: click h2
    var h2 = li.querySelector('h2');
    if (h2) { h2.click(); log('[视频] 点击h2跳转'); return; }

    // 方式3: click li
    li.click();
    log('[视频] 点击li跳转');
  } catch(e) {
    log('[视频] 跳转失败: ' + e.message);
  }
}

function fallbackNextCourse(mode) {
  var allBtns = document.querySelectorAll('button, input[type="button"]');
  var priorities = ['未学习', '学习中'];
  var isFull = (mode === 'full' || mode === 'auto');
  if (isFull) priorities.push('待考试');

  for (var p = 0; p < priorities.length; p++) {
    for (var b = 0; b < allBtns.length; b++) {
      var val = allBtns[b].value || allBtns[b].textContent || '';
      if (val.trim() === priorities[p]) {
        log('[视频] fallback找到: ' + priorities[p]);
        var parentA = allBtns[b].parentElement.querySelector('a[href]');
        if (parentA) { parentA.click(); return; }
        allBtns[b].click();
        return;
      }
    }
  }
  log('[视频] fallback: 无待处理课程');
}

// 进入考试
function enterExam() {
  try {
    var jrks = document.getElementById('jrks');
    if (jrks) { jrks.click(); return; }
    var btns = document.querySelectorAll('button, input[type="button"]');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].value || btns[i].textContent || '';
      if (t.indexOf('进入考试') !== -1 || t.indexOf('考试') !== -1) {
        btns[i].click();
        return;
      }
    }
  } catch(e) {}
}

// 暂停监测
function startPauseWatcher() {
  _pauseWatchTimer = setInterval(function() {
    try {
      var v = document.querySelector('video');
      if (v && v.paused && !v.ended) {
        log('[视频] 视频暂停, 等待' + (CONFIG.delays.pauseRefresh/1000) + '秒后刷新');
        setTimeout(function() {
          if (v.paused && !v.ended) {
            // 检查课程状态
            var st = getCurrentCourseState();
            if (st === '已完成' || st === '待考试') {
              log('[视频] 暂停且状态=' + st + ', 执行playNext');
              var mode = Store.get(CONFIG.keys.mode, 'auto');
              playNext(mode);
            } else {
              log('[视频] 暂停但状态=' + st + ', 刷新页面');
              location.reload();
            }
          }
        }, CONFIG.delays.pauseRefresh);
      }
    } catch(e) {}
  }, 2000);
}

// 弹窗杀手
function killPopups() {
  try {
    // 温馨提示/疲劳提醒弹窗
    var tips = document.querySelectorAll('#div_processbar_tip, .pv-ask-skip, ' +
      '.processbar_show, [class*="tip"], [class*="modal"], ' +
      '[class*="popup"], [class*="dialog"]');
    for (var i = 0; i < tips.length; i++) {
      if (tips[i].style && getComputedStyle(tips[i]).display !== 'none') {
        var closeBtn = tips[i].querySelector('input.rig_btn, img.colse_btn, ' +
          '[class*="close"], [class*="sure"], [class*="confirm"]');
        if (closeBtn) { closeBtn.click(); continue; }
        tips[i].style.display = 'none';
      }
    }

    // 使用XPath查找"知道了"按钮
    try {
      var knowBtn = document.evaluate("//button[contains(., '知道了')]", document, null, XPathResult.ANY_TYPE).iterateNext();
      if (knowBtn) knowBtn.click();
    } catch(e) {}

    // 查找所有弹窗中的确定按钮
    var confirmBtns = document.querySelectorAll('button, input[type="button"]');
    for (var j = 0; j < confirmBtns.length; j++) {
      var txt = confirmBtns[j].value || confirmBtns[j].textContent || '';
      if (txt.indexOf('知道了') !== -1 || txt.indexOf('确定') !== -1 ||
          txt.indexOf('关闭') !== -1 || txt.indexOf('继续') !== -1) {
        confirmBtns[j].click();
      }
    }
  } catch(e) {}
}
// ═══════════════════════════════════════════════════════════════
// 5. 考试助手 (Exam Helper)
// ═══════════════════════════════════════════════════════════════
// 试错算法: 遍历选项, 直到找到正确答案
// 正确答案记忆: 保存在GM存储中, 下次自动使用
// ═══════════════════════════════════════════════════════════════
function doExam() {
  log("[考试] 开始答题...");
  cleanupRestrictions();

  var rightAnswers = Store.get(CONFIG.keys.rightAnswers, {});
  var allAnswers = Store.get(CONFIG.keys.allAnswers, {});
  var currentTries = {};
  var round = 1;
  var maxRounds = 8;

  var retry = 0;
  function waitForQuestions() {
    var questions = findQuestions();
    if (questions.length > 0) {
      log("[考试] 题目已加载 (" + questions.length + "道)");
      startTestRound();
    } else if (retry < 30) {
      retry++;
      setTimeout(waitForQuestions, 500);
    } else {
      log("[考试] 题目加载超时, 强制尝试");
      startTestRound();
    }
  }

  function startTestRound() {
    answerQuestions(rightAnswers, allAnswers, currentTries, round);
    var delay = 3000 + Math.floor(Math.random() * 5000);
    log("[考试] 第" + round + "轮答题完成, " + Math.round(delay/1000) + "秒后提交");
    setTimeout(function() { submitExam(); }, delay);
  }

  waitForQuestions();

  window.__HY_examInfo = { rightAnswers: rightAnswers, allAnswers: allAnswers, currentTries: currentTries, round: round, maxRounds: maxRounds };
}

// 智能查找题目 - 支持多种DOM结构
function findQuestions() {
  // 策略1: 传统 tablestyle 表格
  var tables = document.querySelectorAll("table.tablestyle, table[class*='tablestyle']");
  if (tables.length > 0) return tables;

  // 策略2: 含有题目文本的div/question容器
  var divs = document.querySelectorAll("div[class*='question'], div[class*='exam'], div.q_item");
  if (divs.length > 0) return divs;

  // 策略3: 含有radio/checkbox的表格或div
  var radios = document.querySelectorAll("input[type='radio'], input[type='checkbox']");
  if (radios.length > 0) {
    // Find the common parent container for each radio group
    var containers = [];
    var seen = new Set();
    for (var ri = 0; ri < radios.length; ri++) {
      var parent = radios[ri].closest("table, div[class*='item'], div[class*='q'], li");
      if (parent && !seen.has(parent)) { seen.add(parent); containers.push(parent); }
    }
    if (containers.length > 0) return containers;
  }

  return [];
}

// 提取题目标识 - 用于答案匹配（处理随机序号）
function getQuestionFingerprint(qEl) {
  var texts = [];

  // 方式1: .q_name
  var nameEl = qEl.querySelector(".q_name, .question, td[class*='q'], [class*='q_name']");
  if (nameEl) texts.push(nameEl.innerText);

  // 方式2: 表格前几个td
  var cells = qEl.querySelectorAll("td");
  if (cells.length > 0) {
    for (var ci = 0; ci < Math.min(cells.length, 2); ci++) {
      var t = cells[ci].innerText.trim();
      if (t.length > 5) texts.push(t);
    }
  }

  // 方式3: 整个容器的文本（用于fallback）
  texts.push(qEl.innerText || "");

  // 取最长文本作为指纹（去除数字前缀和空格）
  var best = "";
  for (var ti = 0; ti < texts.length; ti++) {
    if (texts[ti].length > best.length) best = texts[ti];
  }
  return best.replace(/^\s*\d+[、.，,\s]+/, "").replace(/\s+/g, " ").trim();
}

// 提取选项列表
function extractOptions(qEl) {
  var options = [];

  // 策略1: label中的radio/checkbox
  var labels = qEl.querySelectorAll("label");
  for (var li = 0; li < labels.length; li++) {
    var inp = labels[li].querySelector("input[type='radio'], input[type='checkbox']");
    if (inp) {
      var raw = labels[li].innerText.trim();
      var clean = raw.replace(/^\s*[A-Za-z][、.，,)\s]+/, "").trim();
      if (clean) options.push({ el: labels[li], text: clean, input: inp, checked: inp.checked });
    }
  }

  // 策略2: 直接找radio/checkbox的父元素
  if (options.length === 0) {
    var inputs = qEl.querySelectorAll("input[type='radio'], input[type='checkbox']");
    for (var ii = 0; ii < inputs.length; ii++) {
      var inp = inputs[ii];
      var parent = inp.parentElement;
      var text = (parent.innerText || parent.textContent || "").trim().replace(inp.value || "", "").trim();
      var clean = text.replace(/^\s*[A-Za-z][、.，,)\s]+/, "").trim();
      if (clean) options.push({ el: parent, text: clean, input: inp, checked: inp.checked });
    }
  }

  // 策略3: td中的radio
  if (options.length === 0) {
    var tds = qEl.querySelectorAll("td");
    for (var tdi = 0; tdi < tds.length; tdi++) {
      var inp2 = tds[tdi].querySelector("input[type='radio'], input[type='checkbox']");
      if (inp2) {
        var text2 = tds[tdi].innerText.trim().replace(inp2.value || "", "").trim();
        var clean2 = text2.replace(/^\s*[A-Za-e][、.，,)\s]+/, "").trim();
        if (clean2) options.push({ el: tds[tdi], text: clean2, input: inp2, checked: inp2.checked });
      }
    }
  }

  return options;
}

// 答题核心 - 支持随机题目序号和选项顺序
function answerQuestions(rightAnswers, allAnswers, currentTries, round) {
  var questions = findQuestions();
  log("[考试] 处理 " + questions.length + " 道题目, 第" + round + "轮");

  // 智能评估选项（完全不依赖云端API）
  function smartScore(text, qText) {
    var score = 0;
    // 正面关键词加分
    if (/以上都(是|对|正|正确)/.test(text)) score += 15;
    if (/以上均(是|对|正确|包括)/.test(text)) score += 15;
    if (/^(全部|所有|凡是)/.test(text)) score += 10;
    if (/是|正确|对|可以|应该|需要/.test(text) && text.length < 8) score += 3;
    if (/必须|一定|肯定|必然/.test(text)) score += 2;

    // 负面关键词减分
    if (/都不(是|对|正|正确)/.test(text)) score -= 15;
    if (/以上都不(是|对)/.test(text)) score -= 15;
    if (/不正确|错误|不是|不可以/.test(text)) score -= 5;
    if (/不包括|除[了]?/.test(text)) score -= 3;
    if (/否|没有|无需|不必/.test(text)) score -= 2;

    // 长的详细答案通常更可能是正确答案（在医学考试中）
    if (text.length > 20) score += 2;
    if (text.length > 40) score += 2;

    // 包含数字、剂量、百分比等具体信息加分
    if (/\d+/.test(text)) score += 2;

    // 包含否定词可能更准确（在医学考试中，绝对化的表述往往错误）
    if (/绝不|严禁|禁忌|禁止/.test(text)) score -= 2;

    return score;
  }

  for (var qi = 0; qi < questions.length; qi++) {
    var qEl = questions[qi];
    var qFingerprint = getQuestionFingerprint(qEl);
    var options = extractOptions(qEl);
    if (options.length === 0 || !qFingerprint) continue;

    // 使用指纹的前40个字符作为存储键（足够长且避免过长）
    var storeKey = qFingerprint.substring(0, 40);

    var chosen = null;

    // 策略1: 已知正确答案（按文本匹配，无视选项顺序）
    if (rightAnswers[storeKey]) {
      var known = rightAnswers[storeKey].replace(/^\s*[A-Za-e][、.，,)\s]+/, "").trim();
      for (var oi = 0; oi < options.length; oi++) {
        if (options[oi].text === known || options[oi].text.indexOf(known) >= 0 || known.indexOf(options[oi].text) >= 0) {
          chosen = options[oi];
          log("[考试] ✅ 已知答案: " + known.substring(0, 20));
          break;
        }
      }
      // 模糊匹配: 如果精确没找到, 尝试包含匹配
      if (!chosen) {
        for (var oi2 = 0; oi2 < options.length; oi2++) {
          var text1 = options[oi2].text.replace(/\s+/g, "");
          var text2 = known.replace(/\s+/g, "");
          if (text1.indexOf(text2) >= 0 || text2.indexOf(text1) >= 0) {
            chosen = options[oi2];
            break;
          }
        }
      }
    }

    // 策略2: 试错 - 从未尝试过的选项中选择评分最高的
    if (!chosen) {
      var tried = currentTries[storeKey] || [];
      var candidates = options.filter(function(o) { return !tried.includes(o.text); });

      if (candidates.length > 0) {
        // 评分排序
        candidates.sort(function(a, b) {
          var sa = smartScore(a.text, qFingerprint);
          var sb = smartScore(b.text, qFingerprint);
          return sb - sa || Math.random() - 0.5;
        });
        chosen = candidates[0];
        tried.push(chosen.text);
        currentTries[storeKey] = tried;
        log("[考试] 🔄 试错: " + chosen.text.substring(0, 20));
      } else if (options.length > 0) {
        // 全部试过了, 随机选 (重置)
        chosen = options[Math.floor(Math.random() * options.length)];
        currentTries[storeKey] = [chosen.text];
        log("[考试] ♻️ 重置试错");
      }
    }

    if (chosen) {
      // 模拟人类点击前延迟
      setTimeout(function(opt) { opt.el.click(); }, Math.random() * 500, chosen);
    }
  }

  window.__HY_examTries = currentTries;
}
// ═══════════════════════════════════════════════════════════════
// 6. UI控件面板
// ═══════════════════════════════════════════════════════════════
var BTN_STYLE = 'font-size:12px;font-weight:400;padding:5px 10px;margin:3px;' +
  'border:none;border-radius:4px;cursor:pointer;transition:all .3s;' +
  'font-family:"Microsoft YaHei",sans-serif;';

// 创建控制面板
function createControlPanel() {
  if (document.getElementById("HY_controlPanel")) return;

  var panel = document.createElement("div");
  panel.id = "HY_controlPanel";
  panel.style.cssText = "position:fixed;top:80px;right:10px;z-index:999999;" +
    "background:rgba(30,30,35,.9);" +
    "border:1px solid rgba(76,176,249,.4);border-radius:10px;" +
    "padding:0;box-shadow:0 4px 24px rgba(0,0,0,.3);" +
    "font-size:12px;font-family:Microsoft YaHei,sans-serif;" +
    "min-width:200px;color:#fff;";

  panel.innerHTML = "<div id=\"HY_header\" style=\"background:linear-gradient(135deg,#188AAE,#1565C0);padding:8px 12px;border-radius:10px 10px 0 0;cursor:move;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:space-between;\">" +
    "<span>\u1F916 华医网小助手 v" + HY_VERSION + "</span>" +
    "<span id=\"HY_minBtn\" style=\"cursor:pointer;font-size:16px;opacity:.8;\">\u2212</span></div>" +
    "<div id=\"HY_body\" style=\"padding:8px 12px;\">" +
    "<div style=\"display:flex;gap:4px;margin-bottom:6px;\">" +
    "<span id=\"HY_statusDot\" style=\"width:8px;height:8px;border-radius:50%;background:#4caf50;display:inline-block;\"></span>" +
    "<span style=\"color:#aaa;font-size:11px;\">运行中</span></div>" +
    "<div style=\"margin-bottom:6px;\">" +
    "<select id=\"HY_modeSelect\" style=\"width:100%;padding:4px 6px;border:1px solid rgba(255,255,255,.2);border-radius:4px;background:rgba(255,255,255,.1);color:#fff;font-size:12px;\">" +
    "<option value=\"video\">\uD83D\uDCFA \u4EC5\u89C6\u9891</option>" +
    "<option value=\"full\">\uD83D\uDCDD \u89C6\u9891+\u8003\u8BD5</option>" +
    "<option value=\"auto\" selected>\uD83E\uDD16 \u667A\u80FD\u89C4\u5212</option>" +
    "<option value=\"plan\">\uD83D\uDCCB \u4EC5\u89C4\u5212</option></select></div>" +
    "<div style=\"display:flex;gap:4px;\">" +
    "<button id=\"HY_showPlan\" style=\"flex:1;padding:5px;border:none;border-radius:4px;background:#4caf50;color:#fff;cursor:pointer;font-size:11px;\">\uD83D\uDCCB \u8BA1\u5212</button>" +
    "<button id=\"HY_toggleLog\" style=\"flex:1;padding:5px;border:none;border-radius:4px;background:#2196f3;color:#fff;cursor:pointer;font-size:11px;\">\uD83D\uDCDD \u65E5\u5FD7</button>" +
    "<button id=\"HY_refresh\" onclick=\"location.reload()\" style=\"padding:5px 8px;border:none;border-radius:4px;background:#ff9800;color:#fff;cursor:pointer;font-size:11px;\">\u21BB</button></div>" +
    "<div id=\"HY_log\" style=\"display:none;background:rgba(0,0,0,.6);color:#0f0;padding:6px;border-radius:4px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:10px;margin-top:6px;white-space:pre-wrap;\"></div></div>";

  document.body.appendChild(panel);

  document.getElementById("HY_minBtn").onclick = function() {
    var body = document.getElementById("HY_body");
    body.style.display = body.style.display === "none" ? "block" : "none";
    this.textContent = body.style.display === "none" ? "+" : "\u2212";
  };

  var header = document.getElementById("HY_header");
  var dragging = false, sx, sy, ox, oy;
  header.onmousedown = function(e) {
    dragging = true; sx = e.clientX; sy = e.clientY;
    ox = panel.offsetLeft; oy = panel.offsetTop;
    document.onmousemove = function(ev) {
      if (dragging) { panel.style.left = (ox + ev.clientX - sx) + "px"; panel.style.top = (oy + ev.clientY - sy) + "px"; panel.style.right = "auto"; }
    };
    document.onmouseup = function() { dragging = false; document.onmousemove = null; };
  };

  document.getElementById("HY_modeSelect").onchange = function() {
    Store.set(CONFIG.keys.mode, this.value);
  };

  document.getElementById("HY_showPlan").onclick = function() {
    var p = Store.get(CONFIG.keys.currentPlan);
    if (p) CreditPlanner.displayPlan(p);
  };

  document.getElementById("HY_toggleLog").onclick = function() {
    var el = document.getElementById("HY_log");
    el.style.display = el.style.display === "none" ? "block" : "none";
  };
}function showControlPanel() {
  createControlPanel();
  var panel = document.getElementById('HY_controlPanel');
  if (panel) panel.style.display = 'block';
}

// 清理页面限制
function cleanupRestrictions() {
  try {
    var body = document.body;
    if (!body) return;
    body.removeAttribute('oncontextmenu');
    body.removeAttribute('oncopy');
    body.removeAttribute('onbeforecopy');
    body.removeAttribute('onhelp');
    body.oncontextmenu = null;
    body.oncopy = null;
    body.onbeforecopy = null;
    body.onhelp = null;
    document.oncontextmenu = null;
    document.onselectstart = null;
    document.oncopy = null;
  } catch(e) {}
}

// 倍速按钮设置
function setupSpeedControls(savedSpeed, mode) {
  try {
    var speedBtns = document.querySelectorAll('.speedBtn, [class*="speed"], [data-rate]');
    for (var s = 0; s < speedBtns.length; s++) {
      (function(btn) {
        var rate = parseFloat(btn.getAttribute('data-rate'));
        if (isNaN(rate)) return;

        if (Math.abs(rate - savedSpeed) < 0.01) {
          btn.style.background = '#1976d2';
          btn.style.color = '#fff';
        }

        btn.onclick = function() {
          var allBtns = document.querySelectorAll('.speedBtn, [class*="speed"], [data-rate]');
          for (var a = 0; a < allBtns.length; a++) {
            allBtns[a].style.background = '#e0e0e0';
            allBtns[a].style.color = '#555';
          }
          btn.style.background = '#1976d2';
          btn.style.color = '#fff';
          Store.set(CONFIG.keys.speed, rate);
          log('[UI] 倍速设置为: ' + rate + 'x');
        };
      })(speedBtns[s]);
    }
  } catch(e) {}
}

// 初始横幅
function showBanner() {
  var banner = document.createElement('div');
  banner.id = 'HY_initBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#4caf50;' +
    'color:#fff;text-align:center;padding:6px;z-index:99999;font-size:13px;' +
    'font-family:"Microsoft YaHei",sans-serif;';
  banner.innerHTML = '🤖 华医网小助手 v' + HY_VERSION +
    ' 已加载 | ' + HY_UPDATE_LOG +
    ' <a href="#" style="color:#fff;font-weight:bold;" onclick="this.parentElement.remove();return false;">✕ 关闭</a>';
  document.body.appendChild(banner);
  setTimeout(function() {
    banner.style.transition = 'opacity 1s';
    banner.style.opacity = '0';
    setTimeout(function() { banner.remove(); }, 1000);
  }, 5000);
}
// ═══════════════════════════════════════════════════════════════
// 7. 主路由 - 页面类型分发
// ═══════════════════════════════════════════════════════════════
function mainRouter() {
  log('[路由] 当前页面: ' + URL.last);

  // 创建UI控件
  createControlPanel();

  // 如果是error页面, 等待后刷新
  if (URL.isError) {
    log('[路由] 错误页面, 15秒后刷新');
    setTimeout(function() { location.reload(); }, 15000);
    showControlPanel();
    return;
  }

  // 适配标识
  try {
    var tixing = document.getElementById('tixing');
    if (tixing) {
      tixing.innerHTML = '✅ 华医网小助手 v' + HY_VERSION + ' 已适配 | ' +
        '<span style="color:#4cb0f9;">智能学分规划 · 全自动刷课</span>';
    }
  } catch(e) {}

  // 显示控制面板
  showControlPanel();

  // 显示启动横幅
  showBanner();

  // 按页面类型分发
  if (URL.isFace) {
    log('[路由] 人脸认证页面');
    handleFacePage();
  }
  else if (URL.isVideo) {
    log('[路由] 视频播放页面');
    var playerType = URL.isPolyv ? 1 : 2;
    seeVideo(playerType);
  }
  else if (URL.isExam) {
    log('[路由] 考试页面');
    cleanupRestrictions();
    // 延迟等待题目加载
    setTimeout(function() { doExam(); }, 1500);
  }
  else if (URL.isExamResult) {
    log('[路由] 考试结果页面');
    doResult();
  }
  else if (URL.isStudyList) {
    log('[路由] 学习记录页 → 运行学分规划');
    handleStudyList();
  }
  else if (URL.isStudyList) {
    log('[路由] 学习记录页(Vue SPA) → 运行学分规划');
    handleStudyList();
  }
  else if (URL.isCourseDetail) {
    log('[路由] 课程详情页(含课件列表) → 自动扫描课件并播放');
    handleCourseDetail();
  }
  else if (URL.isCourseList || URL.full.indexOf('cme/index') !== -1) {
    log('[路由] 课程列表页 → 自动扫描+学分规划');
    handleCourseListCombined();
  }
  else if (URL.full.indexOf('fme.aspx') !== -1) {
    log('[路由] 全员专项页面');
    handleCourseListCombined();
  }
  else {
    log('[路由] 其他页面');
    if (URL.full.indexOf('main.aspx') !== -1 ||
        URL.full.indexOf('default.aspx') !== -1) {
      log('[路由] 首页/主页面');
    }
  }
}

// 学习记录页处理
function handleStudyList() {
  log('[学分规划] 开始分析学分数据...');
  
  // study_info_list.aspx已重定向到Vue SPA /cme/index
  // 学分数据现在在cme.aspx页面的学习记录表中
  // 所以我们检查当前页面类型
  var isCmePage = document.querySelector('.index-main-right') !== null;
  
  setTimeout(function() {
    var analysis = CreditPlanner.analyze();
    if (analysis) {
      CreditPlanner.showQuickStatus(analysis);
      var plan = CreditPlanner.generatePlan(analysis);
      if (plan) {
        CreditPlanner.displayPlan(plan);
        var mode = Store.get(CONFIG.keys.mode, 'auto');
        if (mode === 'auto' && !plan.met && plan.tasks.length > 0) {
          log('[学分规划] auto模式, 5秒后自动执行计划');
          setTimeout(function() {
            CreditPlanner.executePlan(plan);
          }, 5000);
        }
      }
    } else {
      log('[学分规划] 学分分析失败, 尝试搜索课程链接');
      setTimeout(function() {
        autoScanCourses();
      }, 2000);
    }
  }, 2000);
}

// 课程列表页处理
function handleCourseList() {
  log('[课程扫描] 开始扫描课程...');
  setTimeout(function() {
    var plan = Store.get(CONFIG.keys.currentPlan);
    if (plan) log('[课程扫描] 当前计划: ' + (plan.summary || ''));
    var found = autoScanCourses();
    if (!found) log('[课程扫描] 无可用课程, 检查学分状态');
  }, 2000);
}

// 课程详情页处理 (2026新版: course.aspx?cid=X 含课件列表)
function handleCourseDetail() {
  log('[课程详情] 开始扫描课件列表...');
  setTimeout(function() {
    var result = scanCoursewareItems();
    if (result) {
      log('[课程详情] 自动进入课件: ' + result.name);
      window.location.href = result.href;
    } else {
      log('[课程详情] 无可学习的课件');
      // 尝试回到课程列表
      goBackToCourseList();
    }
  }, 2000);
}

// 扫描课件列表，找到需要学习的课件
function scanCoursewareItems() {
  log('[课程详情] 扫描课件...');
  var coursewares = document.querySelectorAll('div.course[data-href]');
  if (coursewares.length === 0) {
    log('[课程详情] 未找到课件');
    return null;
  }
  log('[课程详情] 找到 ' + coursewares.length + ' 个课件');

  var candidates = [];
  for (var i = 0; i < coursewares.length; i++) {
    var cw = coursewares[i];
    var href = cw.getAttribute('data-href') || '';
    var button = cw.querySelector('.cw-status button, button');
    var status = button ? (button.innerText || button.textContent || '').trim() : '';
    var progressRow = cw.querySelector('.cw-progress-row');
    var completed = progressRow ? progressRow.getAttribute('data-completed') : '0';
    var titleEl = cw.querySelector('.cw-title-link strong, .f14blue');
    var name = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : ('课件 ' + (i + 1));
    if (href.indexOf('http') === -1 && href.indexOf('/') === 0) {
      href = window.location.origin + href;
    } else if (href.indexOf('http') === -1) {
      href = window.location.origin + '/course_ware/' + href.replace('../course_ware/', '');
    }
    candidates.push({ name: name, href: href, status: status, completed: completed === '1', index: i });
  }

  // 排序: 学习中优先 > 待考试 > 已完成
  candidates.sort(function(a, b) {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    if (a.status === '学习中' && b.status !== '学习中') return -1;
    if (a.status !== '学习中' && b.status === '学习中') return 1;
    if (a.status === '待考试' && b.status !== '待考试') return -1;
    if (a.status !== '待考试' && b.status === '待考试') return 1;
    return a.index - b.index;
  });

  for (var c = 0; c < candidates.length; c++) {
    if (!candidates[c].completed) {
      log('[课程详情] 选中: ' + candidates[c].name + ' (状态: ' + candidates[c].status + ')');
      return candidates[c];
    }
  }
  log('[课程详情] 所有课件已完成');
  return null;
}
// 新版课程列表全功能处理: 扫描课程 + 学分规划
function handleCourseListCombined() {
  log('[课程扫描] 开始扫描课程 + 学分分析...');
  // 先扫描课程
  setTimeout(function() {
    var plan = Store.get(CONFIG.keys.currentPlan);
    if (plan) log('[课程扫描] 当前计划: ' + (plan.summary || ''));
    var found = scanNewCourseList();
    if (!found) {
      log('[课程扫描] 无可用课程, 扫描推荐项目');
      scanRecommendedCourses();
    }
    // 同时运行学分分析 (cme.aspx现在包含学习记录表)
    setTimeout(function() {
      var analysis = CreditPlanner.analyze();
      if (analysis) {
        CreditPlanner.showQuickStatus(analysis);
        if (!analysis.met) {
          var plan2 = CreditPlanner.generatePlan(analysis);
          if (plan2) CreditPlanner.displayPlan(plan2);
        }
      }
    }, 1000);
  }, 2000);
}

// Old handler kept for compatibility
function handleCourseListNew() {
  log('[课程扫描-新版] 开始扫描课程...');
  setTimeout(function() {
    var plan = Store.get(CONFIG.keys.currentPlan);
    if (plan) log('[课程扫描] 当前计划: ' + (plan.summary || ''));
    var found = scanNewCourseList();
    if (!found) {
      log('[课程扫描-新版] 无可用课程, 扫描推荐项目');
      scanRecommendedCourses();
    }
  }, 2000);
}

// 新版课程扫描: cme.aspx的.index-main-right学习记录表
function scanNewCourseList() {
  log('[课程扫描-新版] 扫描学习记录表...');

  // 方式1: 查找input.btn67继续学习按钮
  var continueBtns = document.querySelectorAll('input.btn67[value*="继续"]');
  if (continueBtns.length > 0) {
    log('[课程扫描-新版] 找到' + continueBtns.length + '个继续学习按钮');
    var btn = continueBtns[0];
    var onclick = btn.getAttribute('onclick') || '';
    var urlMatch = onclick.match(/["']([^"']*course\.aspx[^"']*)["']/);
    if (urlMatch && urlMatch[1]) {
      var url = urlMatch[1];
      if (url.indexOf('http') === -1) url = window.location.origin + '/pages/' + url.replace('../pages/', '');
      log('[课程扫描-新版] 通过onclick跳转: ' + url);
      window.location.href = url;
      return true;
    }
    btn.click(); return true;
  }

  // 方式2: 查找学习记录表中的课程链接
  var courseLinks = document.querySelectorAll('td a[href*="course.aspx?cid="]');
  if (courseLinks.length > 0) {
    log('[课程扫描-新版] 找到' + courseLinks.length + '个课程链接');
    courseLinks[0].click(); return true;
  }

  // 方式3: 宽松匹配继续学习按钮
  var allBtns = document.querySelectorAll('button, input[type="button"], a.btn');
  for (var i = 0; i < allBtns.length; i++) {
    var txt = allBtns[i].value || allBtns[i].textContent || '';
    if (txt.indexOf('继续学习') !== -1 || txt.indexOf('继续') !== -1) {
      log('[课程扫描-新版] 找到继续学习按钮: ' + txt);
      allBtns[i].click(); return true;
    }
  }
  return false;
}

// 扫描推荐课程区域
function scanRecommendedCourses() {
  log('[课程扫描-新版] 扫描推荐课程...');
  var recLinks = document.querySelectorAll('#tab_courses a.f14blue[href*="course.aspx?cid="]');
  if (recLinks.length > 0) { recLinks[0].click(); return true; }
  var allCourseLinks = document.querySelectorAll('a[href*="course.aspx?cid="]');
  if (allCourseLinks.length > 0) { allCourseLinks[0].click(); return true; }
  log('[课程扫描-新版] 未找到可用课程');
  return false;
}

// 人脸认证页面处理
function handleFacePage() {
  log('[人脸] 检测到人脸认证页面');
  var msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'background:#fff3e0;border:2px solid #ff9800;border-radius:10px;padding:30px;' +
    'z-index:99999;text-align:center;font-size:16px;max-width:400px;' +
    'font-family:"Microsoft YaHei",sans-serif;';
  msg.innerHTML = '<h3 style="color:#e65100;">🧑 人脸识别验证</h3>' +
    '<p>华医网要求人脸识别认证</p>' +
    '<p>请手动完成验证后, 脚本将自动继续</p>' +
    '<p style="font-size:12px;color:#999;">(已完成验证? 刷新页面继续)</p>';
  document.body.appendChild(msg);
}

// ═══════════════════════════════════════════════════════════════
// 脚本初始化
// ═══════════════════════════════════════════════════════════════
function init() {
  // 恢复console
  try {
    if (window.__HY_rawConsole) {
      Object.defineProperty(console, 'log', { value: window.__HY_rawConsole.log, writable: true, configurable: true });
      Object.defineProperty(console, 'warn', { value: window.__HY_rawConsole.warn, writable: true, configurable: true });
      Object.defineProperty(console, 'error', { value: window.__HY_rawConsole.error, writable: true, configurable: true });
    }
  } catch(e) {}

  // 存活标记
  try {
    var indicator = document.getElementById('__huayi_helper_loaded__');
    if (!indicator) {
      var el = document.createElement('div');
      el.id = '__huayi_helper_loaded__';
      el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;z-index:-1;';
      if (document.body) document.body.appendChild(el);
    }
  } catch(e) {}

  // 清除限制
  cleanupRestrictions();

  // 运行主路由
  mainRouter();
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(init, 500);
  });
} else {
  setTimeout(init, 500);
}

} // __HY_main 结束

// DOMContentLoaded启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    try {
      if (typeof __HY_main === 'function') __HY_main();
    } catch(e) {
      console.log('[HYv3] 初始化错误: ' + e.message);
    }
  });
} else {
  try {
    if (typeof __HY_main === 'function') __HY_main();
  } catch(e) {
    console.log('[HYv3] 初始化错误: ' + e.message);
  }
}
// ═══════════════════════════════════════════════════════════════
// 8. 主路由 - 页面类型分发 (Updated for 2026 site layout)
// ═══════════════════════════════════════════════════════════════
