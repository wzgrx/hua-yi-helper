import os, re

fpath = "src/tampermonkey/hua-yi-helper.user.js"
with open(fpath, 'r', encoding='utf-8') as f:
    code = f.read()

# Find insertion point: after CreditPlanner section, before "function autoScanCourses"
insert_marker = "function autoScanCourses()"
insert_pos = code.find(insert_marker)
print(f'Insert at position {insert_pos}, before: {code[insert_pos:insert_pos+50]}')

# The new modules to insert
new_modules = r"""
// ═══════════════════════════════════════════════════════════════
// 智能学分规划增强 — 课程发现 + 最优选课 + 自动执行
// ═══════════════════════════════════════════════════════════════

var HY_PLAN_KEY = "HY_CurrentPlanV2";
var HY_PLAN_INDEX_KEY = "HY_PlanIndex";
var HY_DISCOVERED_KEY = "HY_DiscoveredCourses";
var HY_EXECUTING_KEY = "HY_Executing";

var SmartPlanner = {
    // === 核心: 从当前页面发现可用课程 ===
    discoverCourses: function() {
        log("[发现] 扫描可用课程...");
        var courses = [];
        // 方式1: 从 cme.aspx 的学习记录表发现
        var links = document.querySelectorAll('td a[href*="course.aspx?cid="]');
        links.forEach(function(a) {
            var txt = a.textContent.trim();
            if (txt && txt.length > 2) {
                courses.push({ name: txt, link: a.href, source: 'record' });
            }
        });
        // 方式2: 从推荐课程区域
        var recLinks = document.querySelectorAll('#tab_courses a.f14blue[href*="course.aspx?cid="]');
        recLinks.forEach(function(a) {
            var txt = a.textContent.trim();
            if (txt && txt.length > 2 && !courses.some(function(c) { return c.link === a.href; })) {
                courses.push({ name: txt, link: a.href, source: 'recommend' });
            }
        });
        // 方式3: btn67 继续学习按钮
        var btns = document.querySelectorAll('input.btn67[value*="继续"]');
        btns.forEach(function(b) {
            var onclick = b.getAttribute('onclick') || '';
            var m = onclick.match(/["']([^"']*course\\.aspx[^"']*)["']/);
            if (m && m[1]) {
                var url = m[1];
                if (url.indexOf('http') === -1) url = window.location.origin + '/pages/' + url.replace('../pages/', '');
                courses.push({ name: '继续学习课程', link: url, source: 'btn67' });
            }
        });
        // 方式4: 从 fme.aspx 全员专项
        var fmeLinks = document.querySelectorAll('a[href*="course.aspx?cid="]');
        fmeLinks.forEach(function(a) {
            var txt = a.textContent.trim();
            if (txt && txt.length > 2 && !courses.some(function(c) { return c.link === a.href; })) {
                courses.push({ name: txt, link: a.href, source: 'fme' });
            }
        });
        if (courses.length > 0) {
            Store.s(HY_DISCOVERED_KEY, courses);
            log("[发现] 找到 " + courses.length + " 个可用课程");
        } else {
            log("[发现] 未发现新课程");
        }
        return courses;
    },

    // === 核心: 生成最优学习计划 ===
    generateOptimalPlan: function() {
        log("[计划] === 生成最优学习计划 ===");
        // 1. 分析当前学分状态
        var analysis = CreditPlanner.analyze();
        if (!analysis) { log("[计划] 学分分析失败"); return null; }
        if (analysis.met) { log("[计划] ✅ 学分已达标!"); return { tasks: [], met: true }; }

        // 2. 发现可用课程
        var discovered = Store.g(HY_DISCOVERED_KEY, []);

        // 3. 收集所有候选课程 (已有未完成 + 新发现)
        var candidates = [];
        analysis.projects.forEach(function(p) {
            if (!p.completed) candidates.push({
                name: p.name, credit: p.credit || 1, status: p.status || '未学习',
                isPublic: p.isPublic || false, link: p.link || '', source: 'existing',
                progress: p.status && p.status.indexOf('播放至') >= 0 ? 
                    parseInt(p.status.match(/播放至[：:]\\s*(\\d+)/)?.[1] || '0') : 0
            });
        });
        discovered.forEach(function(d) {
            if (!candidates.some(function(c) { return c.link === d.link; })) {
                candidates.push({
                    name: d.name, credit: 1, status: '未学习',
                    isPublic: d.name.indexOf('公需') >= 0, link: d.link || '',
                    source: 'discovered', progress: 0
                });
            }
        });

        if (candidates.length === 0) { log("[计划] 无可用课程"); return { tasks: [], met: false, error: 'no_courses' }; }

        // 4. 最优选课算法
        var needPublic = analysis.publicRemaining;
        var needOther = analysis.otherRemaining;
        var totalRemaining = analysis.totalRemaining;
        var selected = [];
        var accumulated = 0;

        // 优先级函数
        function priority(c) {
            if (c.status === '未学习' && c.progress === 0) return 0;
            if (c.progress > 0 && c.progress < 100) return 1;
            if (c.status === '学习中') return 2;
            if (c.status === '待考试') return 3;
            return 4;
        }

        // 排序: 公需优先, 然后按优先级, 学分从高到低
        candidates.sort(function(a, b) {
            if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1;
            var pa = priority(a), pb = priority(b);
            if (pa !== pb) return pa - pb;
            return (b.credit || 0) - (a.credit || 0);
        });

        // 选课
        for (var i = 0; i < candidates.length && accumulated < totalRemaining; i++) {
            var c = candidates[i];
            if (c.isPublic && needPublic <= 0) continue;
            if (!c.isPublic && needOther <= 0) continue;
            var estCredit = c.credit || 1;
            selected.push({
                name: c.name, credit: estCredit, status: c.status,
                link: c.link, isPublic: c.isPublic,
                progress: c.progress || 0, source: c.source || 'existing',
                action: c.status === '待考试' ? 'exam' : 'learn'
            });
            accumulated += estCredit;
            if (c.isPublic) needPublic -= estCredit; else needOther -= estCredit;
        }

        var plan = { 
            tasks: selected, met: false, accumulated: accumulated,
            totalNeeded: totalRemaining,
            summary: '需完成 ' + selected.length + ' 项任务, 共 ' + accumulated + '/' + totalRemaining + ' 学分'
        };

        // 保存计划
        Store.s(HY_PLAN_KEY, plan);
        Store.s(HY_PLAN_INDEX_KEY, 0);
        log("[计划] " + plan.summary);
        selected.forEach(function(t, idx) {
            log("[计划] " + (idx+1) + ". [" + t.action + "] " + t.name + " (" + t.credit + "分, " + t.status + ")");
        });
        return plan;
    },

    // === 启动自动执行 ===
    startExecution: function() {
        var plan = Store.g(HY_PLAN_KEY, null);
        if (!plan || plan.met || !plan.tasks || plan.tasks.length === 0) {
            log("[执行] 无待执行计划，请先生成计划");
            return;
        }
        var idx = Store.g(HY_PLAN_INDEX_KEY, 0);
        if (idx >= plan.tasks.length) {
            log("[执行] ✅ 所有任务已完成!");
            Store.s(HY_EXECUTING_KEY, false);
            return;
        }
        Store.s(HY_EXECUTING_KEY, true);
        log("[执行] 开始执行第 " + (idx+1) + "/" + plan.tasks.length + " 项任务");
        SmartPlanner.executeCurrentTask();
    },

    // === 执行当前任务 ===
    executeCurrentTask: function() {
        var plan = Store.g(HY_PLAN_KEY, null);
        var idx = Store.g(HY_PLAN_INDEX_KEY, 0);
        if (!plan || idx >= plan.tasks.length) {
            log("[执行] 所有任务完成!");
            Store.s(HY_EXECUTING_KEY, false);
            return;
        }
        var task = plan.tasks[idx];
        log("[执行] 任务 " + (idx+1) + ": " + task.name);

        if (task.link) {
            log("[执行] 导航到: " + task.link);
            window.location.href = task.link;
        } else {
            log("[执行] 课程无链接，跳过");
            SmartPlanner.advanceTask();
        }
    },

    // === 推进到下一个任务 ===
    advanceTask: function() {
        var idx = Store.g(HY_PLAN_INDEX_KEY, 0);
        Store.s(HY_PLAN_INDEX_KEY, idx + 1);
        log("[执行] 进度: " + (idx+1) + " → " + (idx+2));
        // 延迟后执行下一个
        setTimeout(function() { SmartPlanner.startExecution(); }, 2000);
    },

    // === 标记当前任务完成 ===
    completeTask: function() {
        var plan = Store.g(HY_PLAN_KEY, null);
        var idx = Store.g(HY_PLAN_INDEX_KEY, 0);
        if (plan && plan.tasks && plan.tasks[idx]) {
            plan.tasks[idx].completed = true;
            Store.s(HY_PLAN_KEY, plan);
        }
        SmartPlanner.advanceTask();
    },

    // === 停止执行 ===
    stopExecution: function() {
        Store.s(HY_EXECUTING_KEY, false);
        log("[执行] ⏸ 已暂停执行");
    }
};
"""

# Insert new modules before autoScanCourses
new_code = code[:insert_pos] + new_modules + code[insert_pos:]

# Verify the insertion worked correctly
if "SmartPlanner" in new_code:
    print("✅ SmartPlanner module inserted successfully")
else:
    print("❌ Insertion failed!")

with open(fpath, 'w', encoding='utf-8') as f:
    f.write(new_code)

print(f"File size: {os.path.getsize(fpath)} bytes")
print("Done!")
