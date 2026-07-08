const fs = require('fs');
const f = 'src/tampermonkey/hua-yi-helper.user.js';
let c = fs.readFileSync(f, 'utf8');
const crlf = c.includes('\r\n');
c = c.replace(/\r\n/g, '\n');

// Replace handleCertificateApply with skip version
const oldCert = c.indexOf('handleCertificateApply: function() {');
if (oldCert >= 0) {
  const startLine = c.indexOf('handleCertificateApply: function() {');
  const nextMethod = c.indexOf('// 更新UI状态', startLine);
  if (nextMethod >= 0) {
    const newBlock = 'handleCertificateApply: function() {\n    log(\'[引擎] 申请证书页 - 需要卡密, 跳过此课程\');\n    log(\'[引擎] 证书申请需要卡密(card key), 不自动操作\');\n    var self = this;\n    setTimeout(function() {\n      self.nextTask();\n      self._running = false;\n      setTimeout(function() {\n        var nextTask = self.getCurrentTask();\n        if (nextTask && nextTask.url) {\n          log(\'[引擎] 跳过证书申请, 进入下一个任务: \' + nextTask.name);\n          self._running = true;\n          safeNavigate(nextTask.url);\n        } else {\n          log(\'[引擎] 所有任务完成, 返回学习记录页\');\n          safeNavigate(\'/pages/study_info_list.aspx\');\n        }\n      }, 2000);\n    }, 1000);\n  },\n  ';
    c = c.substring(0, startLine) + newBlock + c.substring(nextMethod);
    console.log('[OK] Replaced handleCertificateApply');
  }
}

c = c.replace('// @version      4.0.2', '// @version      4.1.0');
c = c.replace('var HY_VERSION = "4.0.2";', 'var HY_VERSION = "4.1.0";');

if (crlf) c = c.replace(/\n/g, '\r\n');
fs.writeFileSync(f, c, 'utf8');
console.log('[OK] Done');
