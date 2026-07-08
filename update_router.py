import os
path = "src/tampermonkey/hua-yi-helper.user.js"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Update handleStudyList
old1 = "function handleStudyList() {\n  log('[路由] 学习记录页 → 学分分析');\n  setTimeout(function() {\n    var analysis = CreditPlanner.analyze();\n    if (analysis) {\n      var plan = CreditPlanner.generatePlan(analysis);\n      if (plan) {\n        log('[学分] 计划: ' + plan.summary);\n      }\n    }\n  }, 2000);\n}"
new1 = "function handleStudyList() {\n  log('[路由] 学习记录页 → 智能学分规划');\n  setTimeout(function() {\n    var plan = SmartPlanner.makePlan();\n    if (plan) {\n      log('[学分] ' + plan.summary);\n    }\n  }, 2000);\n}"
c = c.replace(old1, new1)

# Update handleCourseListPage
old2 = "function handleCourseListPage() {\n  log('[路由] 课程列表 → 保存列表+学分分析');\n  setTimeout(function() {\n    saveCourseList();\n    var analysis = CreditPlanner.analyze();\n    if (analysis) {\n      var plan = CreditPlanner.generatePlan(analysis);\n      if (plan) log('[学分] 规划: ' + plan.summary);\n    }\n  }, 2000);\n}"
new2 = "function handleCourseListPage() {\n  log('[路由] 课程列表 → 智能规划');\n  setTimeout(function() {\n    saveCourseList();\n    var plan = SmartPlanner.makePlan();\n    if (plan) log('[学分] ' + plan.summary);\n  }, 2000);\n}"
c = c.replace(old2, new2)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
sz = os.path.getsize(path)
print("OK: %d bytes" % sz)
print("SmartPlanner:", "SmartPlanner" in c)
