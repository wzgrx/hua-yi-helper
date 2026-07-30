#!/usr/bin/env node
'use strict';

const { loadConfig, publicConfig } = require('./config');
const { runHermes } = require('./runner');
const { superviseHermes } = require('./supervisor');

async function main() {
  const config = loadConfig(process.argv.slice(2));
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

main().catch(error => {
  console.error('[Hermes]', error.message);
  process.exitCode = 1;
});
