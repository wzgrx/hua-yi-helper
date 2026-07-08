/**
 * 智能学分规划器
 * 分析学习记录 → 计算学分缺口 → 生成最优学习计划
 */

class CreditPlanner {
  constructor(config) {
    this.config = config;
  }

  // 分析学习记录页的学分数据
  async analyze(page) {
    console.log('[CreditPlanner] 分析学分数据...');

    const result = await page.evaluate((targetYear) => {
      function extractProjects() {
        const projects = [];

        // 尝试从表格解析
        const tables = document.querySelectorAll('table');
        let table = null;
        for (const t of tables) {
          if (t.innerHTML.includes('项目名称') || t.innerHTML.includes('项目')) {
            table = t;
            break;
          }
        }

        if (table) {
          const rows = table.querySelectorAll('tr');
          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td, th');
            if (cells.length < 4) continue;

            const nameEl = cells[0].querySelector('a') || cells[0];
            const name = (nameEl.innerText || '').trim();
            if (!name) continue;

            let credit = 0;
            let status = '';
            let isPublic = false;

            for (const cell of cells) {
              const text = cell.innerText.trim();
              const cm = text.match(/([\d.]+)\s*分/);
              if (cm) credit = parseFloat(cm[1]);

              if (text === '未学习' || text === '学习中' || text.includes('播放至') ||
                  text === '已完成' || text === '已申请' || text === '学习完毕' ||
                  text === '待考试' || text === '已过期') {
                status = text;
              }

              if (text.includes('公需') || text.includes('必修')) {
                isPublic = true;
              }
            }

            const link = nameEl.href || '';
            const completed = status === '已完成' || status === '已申请' ||
                              status === '学习完毕' || status === '已通过';

            projects.push({
              name, credit, status, isPublic, completed, link
            });
          }
        } else {
          // 从div/li布局解析
          const items = document.querySelectorAll('.project-item, .course-item, li, div.row, div.item');
          for (const item of items) {
            const text = item.innerText || '';
            if (text.length < 10) continue;

            const cm = text.match(/([\d.]+)\s*分/);
            if (!cm) continue;
            const credit = parseFloat(cm[1]);

            const isPublic = text.includes('公需');
            const completed = text.includes('已完成') || text.includes('已申请');

            const linkEl = item.querySelector('a');
            projects.push({
              name: text.substring(0, 50),
              credit,
              status: completed ? '已完成' : '学习中',
              isPublic,
              completed,
              link: linkEl ? linkEl.href : ''
            });
          }
        }

        return projects;
      }

      const projects = extractProjects();
      let earned = 0;
      let publicEarned = 0;
      let otherEarned = 0;

      for (const p of projects) {
        if (p.completed) {
          earned += p.credit;
          if (p.isPublic) publicEarned += p.credit;
          else otherEarned += p.credit;
        }
      }

      return {
        projects,
        earned,
        publicEarned,
        otherEarned,
        remaining: Math.max(0, 25 - earned),
        publicRemaining: Math.max(0, 5 - publicEarned),
        otherRemaining: Math.max(0, 20 - otherEarned),
        met: earned >= 25
      };
    }, this.config.targetYear);

    return result;
  }

  // 生成最优学习计划
  generatePlan(analysis) {
    if (!analysis || analysis.met) {
      return { tasks: [], totalCredits: 0, met: true };
    }

    const unfinished = analysis.projects.filter(p => !p.completed);
    const tasks = [];
    let accumulated = 0;

    // 优先级: 未学习 > 播放至x% > 学习中 > 待考试
    function priority(p) {
      if (p.status === '未学习') return 0;
      if (p.status && p.status.includes('播放至')) return 1;
      if (p.status === '学习中' || p.status === '已暂停') return 2;
      if (p.status === '待考试') return 3;
      return 4;
    }

    unfinished.sort((a, b) => {
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return b.credit - a.credit;
    });

    const needOther = analysis.otherRemaining;
    const needPublic = analysis.publicRemaining;

    for (const p of unfinished) {
      if (accumulated >= analysis.remaining) break;
      if (p.isPublic && needPublic <= 0 && accumulated >= needOther) continue;
      if (!p.isPublic && needOther <= 0 && p.isPublic) continue;

      tasks.push({
        name: p.name,
        credit: p.credit,
        status: p.status,
        link: p.link,
        isPublic: p.isPublic,
        action: p.status === '待考试' ? '考试' : '学习',
        estimatedMinutes: p.credit * 30
      });
      accumulated += p.credit;
    }

    // 如果学分不够, 提醒添加新课
    if (accumulated < analysis.remaining) {
      const gap = analysis.remaining - accumulated;
      tasks.push({
        name: `[需选新课程] 缺口${gap}分`,
        credit: gap,
        status: '新课程',
        link: '',
        isPublic: false,
        action: '请手动从"继续教育"或"全员专项"添加课程',
        estimatedMinutes: 0
      });
    }

    return { tasks, totalCredits: accumulated, met: false };
  }
}

module.exports = CreditPlanner;
