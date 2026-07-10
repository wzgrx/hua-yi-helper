const fs = require('fs');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
const checks = [
  ['UserScript 元数据', /==UserScript==/.test(source)],
  ['v7 版本', /@version\s+7\.0\.0/.test(source)],
  ['顶层页面隔离', /@noframes/.test(source)],
  ['无外部依赖', !/@require\s/.test(source)],
  ['单一 v7 状态', /HY7_STATE/.test(source)],
  ['Shadow DOM UI', /attachShadow/.test(source)],
  ['面板按钮不提交表单', /type=\\?"button\\?"/.test(source) && /event\.preventDefault/.test(source)],
  ['学习记录路由', /handleStudy/.test(source)],
  ['课程详情路由', /handleCourse/.test(source)],
  ['原生播放器桥接', /handlePlayer/.test(source)],
  ['考试路由', /handleExam/.test(source)],
  ['结果路由', /handleResult/.test(source)],
  ['证书路由', /handleCertificate/.test(source)],
  ['培训卡路由', /handleCard/.test(source)],
  ['问卷路由', /handleSurvey/.test(source)],
  ['互动病例路由', /handleCase/.test(source)],
  ['课程目录路由', /handleCatalog/.test(source)],
  ['待考试直达真实 cwid', /exam\.aspx\?cwid=/.test(source)],
  ['确定性考试组合', /examState\.attempt/.test(source)],
  ['真实验证题库', /var VERIFIED/.test(source)]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
assert.equal(failed, 0, `${failed} 项检查失败`);
console.log(`v7 模块检查通过：${checks.length} 项`);
