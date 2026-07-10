/**
 * Hermes Bot - 核心自动化引擎
 * ============================================================
 * 功能:
 * - 智能学分规划 (creditPlanner)
 * - 全自动视频播放 (Polyv + CC)
 * - 试错考试引擎
 * - 答案持久化存储
 * - 页面兼容与诊断
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CreditPlanner = require('./lib/credit-planner');
const AnswerStore = require('./lib/answer-store');
const PageProcessor = require('./lib/page-processor');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 只做无侵入的可用性清理。旧版覆盖 Object.defineProperty、setTimeout、
// setInterval 和 addEventListener，会破坏 Vue、播放器及站点鉴权逻辑。
const PAGE_COMPAT_SCRIPT = `
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    if (!document.body) return;
    document.body.removeAttribute('oncontextmenu');
    document.body.removeAttribute('oncopy');
  }, { once: true });
})();
`;

class HermesBot {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.answerStore = new AnswerStore(config);
    this.planner = new CreditPlanner(config);
    this.processor = new PageProcessor(config, this.answerStore);
    this.currentUrl = '';
    this.isRunning = false;
  }

  // 查找可用的 Chrome/Edge 路径
  _findChromePath() {
    if (this.config.chromePath) return this.config.chromePath;

    const candidates = [
      // Edge (WSL paths)
      '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
      // Chrome (WSL paths)
      '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      // Windows paths
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return '';
  }

  async launch() {
    const chromePath = this._findChromePath();
    if (!chromePath) {
      throw new Error('未找到Chrome/Edge浏览器。请使用 --chrome-path 参数指定路径。');
    }

    console.log(`[Hermes] 启动浏览器: ${chromePath}`);

    const userDataDir = path.join(os.homedir(), '.hermes', 'chrome-profile');
    fs.mkdirSync(path.join(os.homedir(), '.hermes'), { recursive: true });

    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: this.config.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--mute-audio',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      userDataDir: userDataDir,
      defaultViewport: null
    });

    // 在所有页面上注入反作弊脚本
    const pages = await this.browser.pages();
    for (const p of pages) {
      await p.evaluateOnNewDocument(PAGE_COMPAT_SCRIPT);
    }

    this.browser.on('targetcreated', async (target) => {
      try {
        const p = await target.page();
        if (p) {
          await p.evaluateOnNewDocument(PAGE_COMPAT_SCRIPT);
        }
      } catch (e) {}
    });

    this.page = pages[0] || await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });

    // 控制台日志转发
    this.page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[HY]') || text.includes('[Hermes]')) {
        console.log(`[Hermes:page] ${text}`);
      }
    });

    // 监听新页面/弹窗
    this.browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage) {
          await sleep(1000);
          await newPage.evaluateOnNewDocument(PAGE_COMPAT_SCRIPT);
        }
      }
    });
  }

  async goto(url, options = {}) {
    const opts = {
      waitUntil: 'networkidle2',
      timeout: 30000,
      ...options
    };
    console.log(`[Hermes] 导航: ${url}`);
    try {
      await this.page.goto(url, opts);
      await sleep(2000);
      this.currentUrl = this.page.url();
    } catch (err) {
      console.log(`[Hermes] 导航超时: ${url}, 继续...`);
    }
  }

  async run() {
    this.isRunning = true;
    await this.launch();

    const mode = this.config.mode;

    // 步骤1: 进入学习记录页进行学分分析
    console.log('[Hermes] === 步骤1: 学分分析 ===');
    await this.goto(`${this.config.baseUrl}/pages/study_info_list.aspx`);

    const analysisResult = await this.planner.analyze(this.page);

    if (!analysisResult) {
      console.log('[Hermes] 学分分析失败，尝试直接进入课程');
      await this.goto(`${this.config.baseUrl}/pages/cme.aspx`);
      await this.processor.processCourseList(this.page);
      return;
    }

    // 显示学分状态
    console.log('[Hermes] ======== 学分状态 ========');
    console.log(`  已获学分: ${analysisResult.earned}`);
    console.log(`  公需课: ${analysisResult.publicEarned}/${this.config.publicCredits}`);
    console.log(`  其他: ${analysisResult.otherEarned}/${this.config.targetCredits - this.config.publicCredits}`);
    console.log(`  缺口: ${analysisResult.remaining} 分`);
    console.log(`  状态: ${analysisResult.met ? '✅ 已达标' : '❌ 需要继续学习'}`);

    if (analysisResult.met) {
      console.log('[Hermes] 学分已达标, 无需学习!');
      return;
    }

    // 步骤2: 生成学习计划
    console.log('[Hermes] === 步骤2: 生成学习计划 ===');
    const plan = this.planner.generatePlan(analysisResult);

    if (!plan || plan.tasks.length === 0) {
      console.log('[Hermes] 没有可执行的任务');
      return;
    }

    console.log(`[Hermes] 计划: ${plan.tasks.length} 项任务, 约 ${plan.totalCredits} 学分`);
    plan.tasks.forEach((t, i) => {
      console.log(`  ${i+1}. [${t.action}] ${t.name} (${t.credit}分, ${t.status})`);
    });

    if (mode === 'plan') {
      console.log('[Hermes] plan模式: 仅生成计划, 不执行');
      return;
    }

    // 步骤3: 执行学习计划
    console.log('[Hermes] === 步骤3: 执行学习计划 ===');
    for (let i = 0; i < plan.tasks.length && this.isRunning; i++) {
      const task = plan.tasks[i];
      console.log(`[Hermes] 任务 ${i+1}/${plan.tasks.length}: ${task.name}`);

      // 跳过"新课程"虚拟任务
      if (task.status === '新课程') {
        console.log(`[Hermes] ⚠️ 需要手动选择新课程: ${task.action}`);
        break;
      }

      // 处理不同任务类型
      if (task.action === '考试' && task.link) {
        await this.goto(task.link);
        await sleep(3000);
        await this.processor.processExam(this.page);
        // 考试完成后等结果
        await sleep(3000);
      } else if (task.link) {
        await this.goto(task.link);
        await this.processVideoPage();
      }
    }

    console.log('[Hermes] 所有任务完成!');
  }

  // 视频页面处理
  async processVideoPage() {
    console.log('[Hermes] 等待视频播放器...');

    try {
      await this.page.waitForSelector('video', { timeout: 30000 });
    } catch (e) {
      console.log('[Hermes] 未找到视频元素');
      return;
    }

    // 静音 + 播放
    await this.page.evaluate((speed) => {
      try {
        const v = document.querySelector('video');
        if (v) {
          v.muted = true;
          v.defaultMuted = true;
          v.volume = 0;
          v.playbackRate = speed;
          v.play().catch(() => {});
        }
        if (typeof player !== 'undefined') {
          if (player.j2s_setVolume) player.j2s_setVolume(0);
          if (player.j2s_resumeVideo) player.j2s_resumeVideo();
        }
        if (typeof ccPlayer !== 'undefined') {
          if (ccPlayer.volume) ccPlayer.volume(0);
        }
      } catch (e) {}
    }, this.config.speed);

    console.log(`[Hermes] 视频已开始播放 (${this.config.speed}x, 静音)`);

    // 监控视频进度
    let completed = false;
    let monitorCount = 0;
    const maxWait = 3600; // ~5小时最大等待 (3600 * 5s)

    while (!completed && monitorCount < maxWait && this.isRunning) {
      monitorCount++;
      await sleep(5000);

      // 弹窗处理
      await this.processor.killPopups(this.page);

      // 恢复暂停
      await this.page.evaluate(() => {
        try {
          const v = document.querySelector('video');
          if (v && v.paused && !v.ended) {
            v.muted = true;
            v.play().catch(() => {});
          }
        } catch (e) {}
      });

      // 检查完成状态
      const state = await this.page.evaluate(() => {
        try {
          // 方式1: jrks按钮
          const jrks = document.getElementById('jrks');
          if (jrks && jrks.getAttribute('disabled') !== 'disabled') return 'jrks';

          // 方式2: 课程状态
          let li = document.querySelector('li.lis-inside-content.current-playing');
          if (!li) {
            const tp = document.querySelector('i[id="top_play"]');
            if (tp) li = tp.closest('li.lis-inside-content');
          }
          if (li) {
            const btn = li.querySelector('button');
            if (btn) return btn.innerText.trim();
          }

          // 方式3: video ended
          const v = document.querySelector('video');
          if (v && v.ended) return 'ended';

          return '';
        } catch (e) { return ''; }
      });

      if (state === 'jrks' || state === '待考试' || state === '已完成' || state === 'ended') {
        console.log(`[Hermes] 视频完成 (状态: ${state})`);
        completed = true;

        const mode = this.config.mode;
        if ((mode === 'full' || mode === 'auto') && (state === 'jrks' || state === '待考试')) {
          console.log('[Hermes] 进入考试');
          await this.page.evaluate(() => {
            try {
              const jrks = document.getElementById('jrks');
              if (jrks) { jrks.click(); return; }
              const btns = document.querySelectorAll('button, input[type="button"]');
              for (const b of btns) {
                const t = b.value || b.textContent || '';
                if (t.indexOf('考试') !== -1) { b.click(); return; }
              }
            } catch (e) {}
          });
          await sleep(5000);

          // 判断是否到了考试页
          const url = this.page.url();
          if (url.includes('exam.aspx')) {
            await this.processor.processExam(this.page);
          } else if (url.includes('exam_code.aspx')) {
            console.log('[Hermes] ⚠️ 需要验证码! 请手动处理');
          } else {
            await this.processNextVideo();
          }
        } else {
          await this.processNextVideo();
        }
      }

      // 每30次输出一次状态
      if (monitorCount % 60 === 0) {
        console.log(`[Hermes] 监控中... 已等待 ${Math.floor(monitorCount * 5 / 60)} 分钟`);
      }
    }

    if (!completed) {
      console.log('[Hermes] 视频监控超时');
    }
  }

  // 播放下一个视频
  async processNextVideo() {
    console.log('[Hermes] 查找下一个视频...');

    const navigated = await this.page.evaluate(() => {
      try {
        const lis = document.querySelectorAll('li.lis-inside-content');
        let cur = document.querySelector('li.lis-inside-content.current-playing');
        if (!cur) {
          const tp = document.querySelector('i[id="top_play"]');
          if (tp) cur = tp.closest('li.lis-inside-content');
        }
        if (!cur) return false;

        const curIdx = Array.from(lis).indexOf(cur);
        for (let k = curIdx + 1; k < lis.length; k++) {
          const btn = lis[k].querySelector('button');
          const st = btn ? btn.innerText.trim() : '';
          if (st === '待考试' || st === '已完成') continue;

          const onclick = lis[k].getAttribute('onclick') || '';
          const m = onclick.match(/location\.href=['"]([^'"]+)['"]/);
          if (m && m[1]) {
            window.location.href = m[1];
            return true;
          }
          const h2 = lis[k].querySelector('h2');
          if (h2) { h2.click(); return true; }
          lis[k].click();
          return true;
        }
        return false;
      } catch (e) { return false; }
    });

    if (navigated) {
      await sleep(5000);
      // 检查是否到了新的视频页
      const url = this.page.url();
      if (url.includes('course_ware') || url.includes('course.aspx')) {
        await this.processVideoPage();
      }
    } else {
      console.log('[Hermes] 无更多视频');
      // 返回课程列表
      await this.goto(`${this.config.baseUrl}/pages/study_info_list.aspx`);
    }
  }

  // 关闭
  async close() {
    this.isRunning = false;
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }
  }
}

module.exports = HermesBot;
