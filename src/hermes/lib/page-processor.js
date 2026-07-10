const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 页面处理器
 * 处理考试页面、考试结果页面、课程列表页面
 */

class PageProcessor {
  constructor(config, answerStore) {
    this.config = config;
    this.answerStore = answerStore;
  }

  // 弹窗清理
  async killPopups(page) {
    await page.evaluate(() => {
      try {
        // 温馨提示弹窗
        const tips = document.querySelectorAll('#div_processbar_tip, .pv-ask-skip, ' +
          '.processbar_show, [class*="tip"], [class*="modal"]');
        for (const tip of tips) {
          if (tip.style && getComputedStyle(tip).display !== 'none') {
            const closeBtn = tip.querySelector('input.rig_btn, img.colse_btn, ' +
              '[class*="close"], [class*="sure"]');
            if (closeBtn) { closeBtn.click(); continue; }
            tip.style.display = 'none';
          }
        }
        // 知道了按钮
        const knows = document.evaluate("//button[contains(., '知道了')]", document, null, XPathResult.ANY_TYPE);
        let btn = knows.iterateNext();
        while (btn) { btn.click(); btn = knows.iterateNext(); }
      } catch (e) {}
    });
  }

  // 考试页面处理
  async processExam(page) {
    console.log('[PageProcessor] 开始考试...');

    try {
      await page.waitForSelector('table.tablestyle', { timeout: 30000 });
    } catch (e) {
      console.log('[PageProcessor] 未找到题目表格');
      return false;
    }

    const allAnswers = this.answerStore.getAll();
    let triedData = {};
    let round = 1;
    const maxRounds = 6;

    while (round <= maxRounds) {
      console.log(`[PageProcessor] 第${round}轮答题`);

      triedData = await this._doExamRound(page, allAnswers, triedData, round);

      // 提交
      console.log('[PageProcessor] 提交答案...');
      await sleep(5000);

      await page.evaluate(() => {
        try {
          const btn = document.getElementById('btn_submit');
          if (btn) { btn.click(); return; }
          const btns = document.querySelectorAll('input[type="button"], button');
          for (const b of btns) {
            if ((b.value || b.textContent || '').includes('提交')) {
              b.click(); return;
            }
          }
        } catch (e) {}
      });

      await sleep(5000);

      // 检查结果
      const url = page.url();
      if (url.includes('exam_result.aspx')) {
        const passed = await this._handleExamResult(page);
        if (passed) {
          console.log('[PageProcessor] 🎉 考试通过!');
          return true;
        }
        round++;
      } else if (url.includes('exam_code.aspx')) {
        console.log('[PageProcessor] ⚠️ 需要验证码!');
        return false;
      } else {
        console.log(`[PageProcessor] 页面跳转: ${url}`);
        break;
      }
    }

    console.log('[PageProcessor] 考试结束 (最大轮次或失败)');
    return false;
  }

  // 单轮答题
  async _doExamRound(page, allAnswers, triedData, round) {
    await page.evaluate((answers, tried, r) => {
      const tables = document.querySelectorAll('table.tablestyle');
      const currentTries = tried || {};

      function scoreOption(text) {
        let s = 0;
        if (/以上都(是|对|正)/.test(text) || /以上均是/.test(text)) s += 10;
        if (/都不(是|对|正)/.test(text) || /以上都不/.test(text)) s -= 10;
        if (text.length > 15) s += 1;
        if (/是|正确|对/.test(text) && text.length < 5) s += 1;
        return s;
      }

      for (const table of tables) {
        const qEl = table.querySelector('.q_name');
        if (!qEl) continue;

        let qText = qEl.innerText.replace(/^\d+[、.，,]\s*/, '').replace(/\s*/g, '').trim();
        if (!qText) continue;

        const labels = table.querySelectorAll('label');
        const options = [];
        for (const label of labels) {
          const inp = label.querySelector('input[type="radio"], input[type="checkbox"]');
          if (inp) {
            let clean = label.innerText.trim().replace(/^\s*[A-Ea-e][、.，,)\s]\s*/, '').trim();
            if (clean) options.push({ label, text: clean });
          }
        }

        if (options.length === 0) continue;

        let chosen = null;

        // 已知答案
        if (answers[qText]) {
          const known = answers[qText].replace(/^\s*[A-Ea-e][、.，,)\s]\s*/, '').trim();
          for (const opt of options) {
            if (opt.text === known) { chosen = opt; break; }
          }
        }

        // 试错
        if (!chosen) {
          const triedList = currentTries[qText] || [];
          const candidates = options.filter(o => !triedList.includes(o.text));

          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              const d = scoreOption(b.text) - scoreOption(a.text);
              return d !== 0 ? d : Math.random() - 0.5;
            });
            chosen = candidates[0];
            triedList.push(chosen.text);
            currentTries[qText] = triedList;
          } else {
            chosen = options[Math.floor(Math.random() * options.length)];
            currentTries[qText] = [chosen.text];
          }
        }

        if (chosen) chosen.label.click();
      }

      window.__hermesTried = currentTries;
    }, allAnswers, triedData, round);

    // 读取试错状态
    return await page.evaluate(() => window.__hermesTried || {});
  }

  // 考试结果处理
  async _handleExamResult(page) {
    try {
      await page.waitForSelector('.tips_text, [class*="result"]', { timeout: 15000 });
    } catch (e) {}

    const result = await page.evaluate(() => {
      const tips = document.querySelector('.tips_text');
      const passText = tips ? tips.innerText.trim() : document.body.innerText;
      const isPass = passText.includes('考试通过') || passText.includes('完成项目') ||
                     passText.includes('合格');

      // 提取正确答案
      const dds = document.querySelectorAll('.state_cour_lis');
      const results = [];
      const bodyText = document.body.innerText;

      for (const dd of dds) {
        const img = dd.querySelector('img');
        const p = dd.querySelector('p');
        if (!img || !p) continue;

        const qText = (p.getAttribute('title') || p.innerText)
          .replace(/^\d+[、.，,]\s*/, '').replace(/\s*/g, '');
        const isCorrect = img.src.includes('bar_img') || img.src.includes('right') ||
                          img.src.includes('correct');
        const esc = qText.substring(0, 10).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = bodyText.match(new RegExp(esc + '[^】]*【您的答案：([^】]+)】'));
        const userAnswer = m && m[1] ?
          m[1].replace(/^\s*[A-Ea-e][、.，,)\s]\s*/, '').trim() : '';

        results.push({ question: qText, isCorrect, userAnswer });
      }

      return { isPass, results };
    });

    // 保存正确答案
    for (const r of result.results) {
      if (r.isCorrect && r.userAnswer) {
        this.answerStore.saveRight(r.question, r.userAnswer);
      }
    }

    console.log(`[PageProcessor] 考试结果: ${result.isPass ? '✅ 通过' : '❌ 未通过'}` +
      ` (正确: ${result.results.filter(r => r.isCorrect).length}/${result.results.length})`);

    if (!result.isPass) {
      // 点击重新考试
      await page.evaluate(() => {
        try {
          let btn = document.querySelector('input[type="button"][value="重新考试"]');
          if (!btn) {
            btn = Array.from(document.querySelectorAll('button')).find(
              button => (button.textContent || '').includes('重新考试')
            );
          }
          if (btn) btn.click();
          else location.reload();
        } catch (e) {}
      });
      await sleep(3000);
    }

    return result.isPass;
  }

    // 课程列表处理 (支持新版cme.aspx布局)
  async processCourseList(page) {
    console.log('[PageProcessor] 扫描课程列表...');
    await sleep(2000);

    // 方式1: 查找新版btn67继续学习按钮
    const foundBtn = await page.evaluate(() => {
      var btns = document.querySelectorAll('input.btn67[value*="继续"]');
      if (btns.length > 0) {
        var onclick = btns[0].getAttribute('onclick') || '';
        var m = onclick.match(/["']([^"']*course\\.aspx[^"']*)["']/);
        if (m && m[1]) {
          var url = m[1];
          if (url.indexOf('http') === -1) url = window.location.origin + '/pages/' + url.replace('../pages/', '');
          window.location.href = url;
          return true;
        }
        btns[0].click(); return true;
      }
      return false;
    });
    if (foundBtn) { console.log('[PageProcessor] 通过新版按钮进入课程'); await sleep(5000); return true; }

    // 方式2: 查找学习记录表链接
    const foundLink = await page.evaluate(() => {
      var links = document.querySelectorAll('td a[href*="course.aspx?cid="]');
      if (links.length > 0) { links[0].click(); return true; }
      return false;
    });
    if (foundLink) { console.log('[PageProcessor] 通过课程链接进入'); await sleep(5000); return true; }

    // 方式3: 传统扫描(兼容旧版)
    const found = await page.evaluate(() => {
      function findLink(el) {
        if (el.tagName === 'A' && el.href) return el;
        const parent = el.parentElement;
        if (parent) {
          for (const child of parent.children) {
            if (child !== el && child.tagName === 'A' && child.href) return child;
          }
        }
        const container = el.closest('tr, .course-item, li, [class*="course"]');
        if (container) {
          const a = container.querySelector('a[href]');
          if (a && !a.href.includes('javascript:')) return a;
        }
        return null;
      }
      const priorities = ['未学习', '学习中', '待考试'];
      const allEls = document.querySelectorAll('button, input[type="button"], span, div, td');
      for (const p of priorities) {
        for (const el of allEls) {
          const txt = (el.textContent || el.value || '').trim();
          if (txt === p) {
            const link = findLink(el);
            if (link) { link.click(); return true; }
            try { el.click(); return true; } catch (e) {}
          }
        }
      }
      return false;
    });
    if (found) {
      console.log('[PageProcessor] 通过传统扫描进入课程');
      await sleep(5000);
    } else {
      console.log('[PageProcessor] 未找到待学习课程');
    }
    return found;
  }
}
