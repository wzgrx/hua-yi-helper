/**
 * 华医网小助手 v3.0 - 测试套件
 * 测试模块加载、学分规划逻辑、文件完整性
 */

const fs = require('fs');
const path = require('path');

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

console.log('========================================');
console.log('  华医网小助手 v3.0 - 测试套件');
console.log('========================================\n');

// 1. 文件完整性检查
console.log('📁 文件完整性检查:');

const requiredFiles = [
  'src/tampermonkey/hua-yi-helper.user.js',
  'src/hermes/index.js',
  'src/hermes/bot.js',
  'src/hermes/lib/answer-store.js',
  'src/hermes/lib/credit-planner.js',
  'src/hermes/lib/page-processor.js',
  'scripts/setup.ps1',
  'scripts/run-hermes.ps1',
  'package.json',
  'README.md',
  'LICENSE'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, '..', file));
  assert(exists, `文件存在: ${file}`);
});

// 2. Userscript元数据检查
console.log('\n📜 油猴脚本检查:');
const usPath = path.join(__dirname, '..', 'src/tampermonkey/hua-yi-helper.user.js');
if (fs.existsSync(usPath)) {
  const content = fs.readFileSync(usPath, 'utf8');
  assert(content.includes('==UserScript=='), '包含 ==UserScript== 头');
  assert(content.includes('@match'), '包含 @match 声明');
  assert(content.includes('@version      3.0.0'), '版本号 v3.0.0');
  assert(content.includes('@run-at       document-start'), 'document-start 运行');
  assert(content.includes('@grant        GM_getValue'), 'GM_getValue 授权');
  assert(content.includes('CreditPlanner'), '包含学分规划器');
  assert(content.includes('Smart Credit Planner'), '包含学分规划器注释');
  assert(content.includes('seeVideo'), '包含视频播放函数');
  assert(content.includes('doExam'), '包含考试函数');
  assert(content.includes('autoScanCourses'), '包含课程扫描函数');
  assert(content.includes('ANTI_CHEAT_SCRIPT') || content.includes('blockAbnormalPlugin'), '包含反作弊拦截');
}

// 3. Hermes入口检查
console.log('\n🤖 Hermes检查:');
const hpPath = path.join(__dirname, '..', 'src/hermes/index.js');
if (fs.existsSync(hpPath)) {
  const content = fs.readFileSync(hpPath, 'utf8');
  assert(content.includes('require'), '包含require');
  assert(content.includes('./bot'), '包含bot模块引用');
  assert(content.includes('--mode'), '包含CLI参数解析');
}

// 4. Bot模块检查
console.log('\n🦾 Bot模块检查:');
const botPath = path.join(__dirname, '..', 'src/hermes/bot.js');
if (fs.existsSync(botPath)) {
  const content = fs.readFileSync(botPath, 'utf8');
  assert(content.includes('class HermesBot'), '包含HermesBot类');
  assert(content.includes('processVideoPage'), '包含视频处理函数');
  assert(content.includes('ANTI_CHEAT_SCRIPT'), '包含反作弊注入');
  assert(content.includes('puppeteer-core'), '引用puppeteer');
}

// 5. 学分规划器检查
console.log('\n📊 学分规划器检查:');
const cpPath = path.join(__dirname, '..', 'src/hermes/lib/credit-planner.js');
if (fs.existsSync(cpPath)) {
  const content = fs.readFileSync(cpPath, 'utf8');
  assert(content.includes('class CreditPlanner'), '包含CreditPlanner类');
  assert(content.includes('generatePlan'), '包含计划生成方法');
  assert(content.includes('analyze'), '包含分析方法');
  assert(content.includes('targetYear'), '包含目标年份');
}

// 6. 答案存储检查
console.log('\n💾 答案存储检查:');
const asPath = path.join(__dirname, '..', 'src/hermes/lib/answer-store.js');
if (fs.existsSync(asPath)) {
  const content = fs.readFileSync(asPath, 'utf8');
  assert(content.includes('class AnswerStore'), '包含AnswerStore类');
  assert(content.includes('answers.json'), '写入answers.json');
}

// 7. Package.json检查
console.log('\n📦 Package.json检查:');
const pkgPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert(pkg.version === '3.0.0', '版本号 3.0.0');
  assert(pkg.dependencies && pkg.dependencies['puppeteer-core'], '包含puppeteer-core依赖');
}

// 8. PowerShell脚本检查
console.log('\n🪟 PowerShell脚本检查:');
const setupPath = path.join(__dirname, '..', 'scripts/setup.ps1');
if (fs.existsSync(setupPath)) {
  const content = fs.readFileSync(setupPath, 'utf8');
  assert(content.includes('ScheduledTask'), '包含计划任务功能');
  assert(content.includes('ChromeProfile'), '包含Chrome配置');
}

// 总结
console.log(`\n========================================`);
console.log(`  结果: ${passed} 通过, ${failed} 失败`);
console.log(`========================================`);

// exit moved to end


// 9. 新增函数检查 (2026年改版适配)
console.log('\n🔍 2026新版适配检查:');
if (fs.existsSync(usPath)) {
  const content = fs.readFileSync(usPath, 'utf8');
  assert(content.includes('scanNewCourseList'), '包含新版课程扫描函数');
  assert(content.includes('handleCourseListNew'), '包含新版课程列表处理函数');
  assert(content.includes('scanRecommendedCourses'), '包含推荐课程扫描函数');
  assert(content.includes('input.btn67'), '包含新版按钮选择器');
  assert(content.includes('isFME'), '包含FME页面识别');
  assert(content.includes('isCmeIndex'), '包含Vue SPA页面识别');
  assert(content.includes('.tip-bar'), '包含新版提示栏选择器');
  assert(content.includes('.pv-video-player'), '包含新版Polyv播放器选择器');
}

// 10. Hermes新版适配检查
console.log('\n🔍 Hermes新版适配检查:');
const ppPath = path.join(__dirname, '..', 'src/hermes/lib/page-processor.js');
if (fs.existsSync(ppPath)) {
  const content = fs.readFileSync(ppPath, 'utf8');
  assert(content.includes('btn67'), 'Hermes包含新版按钮选择器');
  assert(content.includes('course.aspx?cid='), 'Hermes包含新版课程链接选择器');
}

process.exit(failed > 0 ? 1 : 0);
