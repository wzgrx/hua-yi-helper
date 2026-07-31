#!/usr/bin/env node
'use strict';

const { loadConfig, publicConfig } = require('./config');
const { runHermes } = require('./runner');
const { superviseHermes } = require('./supervisor');
const packageVersion = require('../../package.json').version;

function usage() {
  return `华医网学习助手 Hermes v${packageVersion}

用法：
  huayi-hermes [选项]

年度目标：
  --year YEAR                 目标年度（默认当前年度）
  --public-target NUMBER      公需学分目标（默认 5）
  --other-target NUMBER       其他学分目标（默认 20）
  --card-retry-minutes N      培训卡复查分钟数（默认 5）

运行方式：
  --data-dir PATH             状态、日志和浏览器资料目录
  --browser PATH              Edge/Chrome/Chromium 可执行文件
  --browser-url URL           连接已有 DevTools 浏览器
  --headless BOOL             无界面运行
  --supervise BOOL            启用监督、重启和单实例锁
  --restart-limit N           异常重启上限（默认 20）
  --restart-delay-ms N        重启等待毫秒数（默认 60000）
  --max-runtime-ms N          单轮最长运行毫秒数
  --keep-awake BOOL           Windows 运行期间保持唤醒

登录与验证码：
  --username VALUE            登录账号（推荐使用 HUAYI_USERNAME）
  --password VALUE            登录密码（推荐使用 HUAYI_PASSWORD）
  --captcha-auto BOOL         启用本机 OCR
  --captcha-max-attempts N    验证码最大尝试次数
  --captcha-port PORT         本机 OCR 端口

诊断与日志：
  --diagnostics BOOL          保存异常现场
  --diagnostics-dir PATH      异常现场目录
  --diagnostic-limit N        异常现场保留数
  --event-log-max-bytes N     单个事件日志上限
  --event-log-backups N       事件日志备份数

  -h, --help                  显示帮助
  -v, --version               显示版本`;
}

async function main(argv) {
  const cliArgs = argv || process.argv.slice(2);
  if (cliArgs.includes('-h') || cliArgs.includes('--help')) {
    console.log(usage());
    return;
  }
  if (cliArgs.includes('-v') || cliArgs.includes('--version')) {
    console.log(packageVersion);
    return;
  }
  const config = loadConfig(cliArgs);
  const controller = new AbortController();
  config.signal = controller.signal;
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('[Hermes] 配置', JSON.stringify(publicConfig(config), null, 2));
  const execute = config.supervise ? superviseHermes : runHermes;
  const result = await execute(config, {
    report(event) {
      if (event.state) {
        console.log(`[Hermes] ${event.state.phase}: ${event.state.message || ''}`);
      } else if (event.tasks) {
        console.log('[Hermes] 年度任务清单');
        event.tasks.forEach((task, index) => {
          console.log(`  ${index + 1}. [${task.type}] ${task.name} | ${task.credit}分 | ${task.source}`);
        });
      } else {
        console.log(`[Hermes] ${event.message}`);
      }
    }
  });
  console.log(`[Hermes] 结束状态：${result.status}`);
  if (result.status !== 'done' && result.status !== 'attention' && result.status !== 'stopped') process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Hermes]', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, usage };
