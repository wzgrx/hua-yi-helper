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
assert(!allSource.includes('_obs.observe(document.documentElement'), 'document-start 不得观察可能为 null 的 documentElement');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const userscript = fs.readFileSync(path.join(sourceRoot, 'tampermonkey', 'hua-yi-helper.user.js'), 'utf8');
assert(/if \(URL\.isStudyList\) \{\s*this\.handleStudyList\(\);\s*return;/.test(userscript), '运行状态下学习记录页必须专门处理，禁止落入未知页面并跳课');
const version = userscript.match(/@version\s+(\S+)/);
assert(version, '油猴脚本缺少版本号');
assert.equal(version[1], pkg.version, 'package.json 与油猴脚本版本必须一致');

console.log(`\n✅ 源码质量检查通过：${files.length} 个 JavaScript 文件`);
