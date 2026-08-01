#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const requiredFiles = [
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  '.github/CODEOWNERS',
  '.github/dependabot.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/dependency-review.yml',
  '.github/workflows/release.yml',
];

for (const relative of requiredFiles) {
  assert(fs.existsSync(path.join(root, relative)), `缺少仓库规范文件：${relative}`);
}

const pkg = JSON.parse(read('package.json'));
assert(pkg.private === true, 'package.json 必须设置 private=true，避免误发布到 npm');
assert(pkg.license === 'AGPL-3.0', 'package.json license 必须为 AGPL-3.0');
assert(pkg.repository?.url === 'git+https://github.com/wzgrx/hua-yi-helper.git', '缺少规范 repository.url');
assert(pkg.bugs?.url === 'https://github.com/wzgrx/hua-yi-helper/issues', '缺少规范 bugs.url');
assert(Array.isArray(pkg.files) && pkg.files.includes('src/'), 'package.json files 白名单缺少 src/');

const license = read('LICENSE');
assert(license.length > 30000, 'LICENSE 不是完整 AGPL-3.0 文本');
assert(license.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), 'LICENSE 标题错误');
assert(license.includes('END OF TERMS AND CONDITIONS'), 'LICENSE 缺少完整条款结尾');
assert(!license.includes('...full AGPL 3.0 text...'), 'LICENSE 仍含占位文本');

const codeOfConduct = read('CODE_OF_CONDUCT.md');
assert(!codeOfConduct.includes('[INSERT CONTACT METHOD]'), 'CODE_OF_CONDUCT.md 仍含联系方式占位符');

for (const workflow of [
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/dependency-review.yml',
  '.github/workflows/release.yml',
]) {
  const content = read(workflow);
  const mutableAction = /uses:\s*[\w.-]+\/[\w.-]+@v\d+\b/g.exec(content);
  assert(!mutableAction, `${workflow} 使用了可变 Actions 大版本标签：${mutableAction?.[0] || ''}`);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('仓库规范校验通过。');
}
