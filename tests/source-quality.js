const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const sourceRoot = path.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(sourceRoot).filter(file => file.endsWith('.js'));
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${path.relative(root, file)} 语法错误：${check.stderr}`);
}

const allSource = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
assert(!allSource.includes('.waitForTimeout('), '不得使用 Puppeteer 22 已移除的 waitForTimeout');
assert(!allSource.includes(':contains('), '不得使用浏览器不支持的 CSS :contains');
assert(!allSource.includes('ghp_'), '源码不得包含 GitHub token');
assert(!allSource.includes('17795547652'), '源码不得硬编码用户账号');
assert(!allSource.includes('HYW+zjx+2212'), '源码不得硬编码用户密码');
assert(!new RegExp('playback' + 'Rate', 'i').test(allSource), '项目不得包含违规播放速率控制');
assert(!new RegExp('--' + 'speed\\b', 'i').test(allSource), '项目不得提供播放速率启动参数');
assert(!/currentTime\s*=/.test(allSource), '项目不得写入视频播放位置');
assert(!new RegExp('s2j_' + 'onPlayOver', 'i').test(allSource), '项目不得伪造视频播放完成');
assert(!new RegExp('pv-ask-' + 'skip', 'i').test(allSource), '项目不得绕过播放器互动步骤');
assert(!/@require\s+.*tesseract/i.test(allSource), '播放器页面不得加载无关OCR依赖');
assert(!allSource.includes('_obs.observe(document.documentElement'), 'document-start 不得观察可能为 null 的 documentElement');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const userscript = fs.readFileSync(path.join(sourceRoot, 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
assert(/btn\.type\s*=\s*["']button["']/.test(userscript), '控制面板按钮必须是 button，禁止误提交考试表单');
assert(/exam\.aspx\?cwid=/.test(userscript), '待考试课件必须能够直接进入真实考试地址');
const videoBridgeStart = userscript.indexOf('handleVideo: function()');
const videoBridgeEnd = userscript.indexOf('handleExam: function()', videoBridgeStart);
const videoBridge = videoBridgeStart >= 0 && videoBridgeEnd > videoBridgeStart ? userscript.slice(videoBridgeStart, videoBridgeEnd) : '';
assert(videoBridge && !/querySelector\(['"]video|\.play\(|\.muted|\.volume/.test(videoBridge), '播放器桥接不得控制媒体元素');
assert(!/window\.open\s*=/.test(userscript), '不得覆盖网站 window.open，避免触发异常插件检测');
assert(!/removeAttribute\(['"]on(?:contextmenu|copy)['"]\)/.test(userscript), '不得删除网站事件处理器，避免触发完整性检测');
assert(!userscript.includes("log('[引擎] 课程已完成')"), '视频页不得用全页“已完成”文本判断播放完成');
assert(/if \(URL\.isStudyList\) \{\s*this\.handleStudyList\(\);\s*return;/.test(userscript), '运行状态下学习记录页必须专门处理，禁止落入未知页面并跳课');
const version = userscript.match(/@version\s+(\S+)/);
assert(version, '油猴脚本缺少版本号');
assert.equal(version[1], pkg.version, 'package.json 与油猴脚本版本必须一致');

console.log(`\n✅ 源码质量检查通过：${files.length} 个 JavaScript 文件`);
