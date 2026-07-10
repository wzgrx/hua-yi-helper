/**
 * 华医网小助手 v3.1 - 测试套件
 * 测试模块完整性、关键函数存在性
 */

const fs = require('fs');
const path = require('path');

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \u2705 ${message}`);
    passed++;
  } else {
    console.log(`  \u274C ${message}`);
    failed++;
  }
}

console.log('========================================');
console.log('  华医网学习助手 v6.0.0 - 测试套件');
console.log('========================================\n');

// 1. 主文件存在性
console.log('\u{1F4C1} 文件完整性:');
const usPath = path.join(__dirname, '..', 'src/tampermonkey/hua-yi-helper.user.js');
assert(fs.existsSync(usPath), '主脚本存在');

const content = fs.readFileSync(usPath, 'utf8');

// 2. 元数据
console.log('\n\u{1F4DC} 油猴脚本元数据:');
assert(content.includes('==UserScript=='), 'UserScript头');
assert(content.includes('@match        *://*.91huayi.com/*'), '@match 91huayi');
assert(content.includes('@match        *://dcwj.91huayi.com/*'), '@match dcwj');
assert(content.includes('@version      6.0.4'), '版本号 6.0.4');
assert(content.includes('@run-at       document-start'), 'document-start');
assert(!content.includes('new MutationObserver'), 'document-start 不修改站点DOM完整性');
assert(content.includes('GM_getValue'), 'GM授权');
assert(content.includes('tesseract.js@5.1.1'), '本地图形验证码 OCR');

// 3. 核心模块
console.log('\n\u{1F9F0} 核心模块:');
assert(content.includes('function __HY_main()'), '主入口 __HY_main');
assert(content.includes('var CONFIG'), '配置模块');
assert(content.includes('var URL'), 'URL路由');
assert(content.includes('function safeNavigate'), '智能导航');
assert(content.includes('function killPopups'), '弹窗处理');
assert(content.includes('var LoginController'), '登录控制器');

// 4. Vue SPA课程扫描
console.log('\n\u{1F50D} Vue SPA扫描器:');
assert(content.includes('VueCourseScanner'), 'VueCourseScanner模块');
assert(content.includes('scanFromVueSPA'), 'Vue SPA课程扫描');
assert(content.includes('scanFromCourseDetail'), 'ASP.NET详情页扫描');
assert(content.includes('scanCreditsFromASP'), 'ASP.NET学分扫描');

// 5. 学分规划
console.log('\n\u{1F4CA} 学分规划:');
assert(content.includes('CreditPlanner'), 'CreditPlanner');
assert(content.includes('CreditPlanner.analyze'), 'analyze方法');
assert(content.includes('CreditPlanner.generatePlan'), 'generatePlan方法');
assert(content.includes('HY_PLAN_KEY'), '计划存储');

// 6. 执行引擎
console.log('\n\u{1F680} 执行引擎:');
assert(content.includes('SmartEngine'), 'SmartEngine');
assert(content.includes('SmartEngine.start'), 'start方法');
assert(content.includes('handleCourseDetail'), '课程详情处理');
assert(content.includes('handleVideo'), '视频处理');
assert(content.includes('handleExam'), '考试处理');
assert(content.includes('handleSurvey'), '问卷处理');
assert(content.includes('handleStudyList'), '学习记录续跑处理');

// 7. 考试模块
console.log('\n\u{1F4DD} 考试模块:');
assert(content.includes('function doExam'), 'doExam');
assert(content.includes('function findQuestions'), 'findQuestions');
assert(content.includes('function getQuestionFingerprint'), '题目指纹');
assert(content.includes('function extractOptions'), '选项提取');
assert(content.includes('function smartScore'), '智能评分');
assert(content.includes('function submitExam'), '提交考试');
assert(content.includes('function doResult'), '考试结果');

// 8. UI控制面板
console.log('\n\u{1F4F1} 控制面板:');
assert(content.includes('function createControlPanel'), 'createControlPanel');
assert(content.includes('HY_setPanelState'), '状态控制');
assert(content.includes('HY_modeSelect'), '模式选择');
assert(content.includes('HY_log'), '日志区域');

// 9. 路由
console.log('\n\u{1F4E1} 路由:');
assert(content.includes('function mainRouter'), 'mainRouter');
assert(content.includes('URL.isVueSPA'), 'Vue SPA检测');
assert(content.includes('URL.isCourseDetail'), '课程详情检测');
assert(content.includes('URL.isSurvey'), '问卷检测');
assert(content.includes('URL.isVideo'), '视频检测');
assert(content.includes('URL.isExam'), '考试检测');

// 10. 页面兼容
console.log('\n\u{1F6E1} 页面兼容:');
assert(!content.includes('window.blockAbnormalPlugin = function'), '不覆盖网站完整性检测');
assert(!content.includes('new MutationObserver'), '不注入DOM监听器');

// 总结
console.log(`\n========================================`);
console.log(`  结果: ${passed} \u2705, ${failed} \u274C`);
console.log(`  通过率: ${Math.round(passed/(passed+failed)*100)}%`);
console.log(`========================================`);

process.exit(failed > 0 ? 1 : 0);
