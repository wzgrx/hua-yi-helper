#!/usr/bin/env node
'use strict';

const { loadConfig, publicConfig } = require('./config');
const { runHermes } = require('./runner');

async function main() {
  const config = loadConfig(process.argv.slice(2));
  console.log('[Hermes] 配置', JSON.stringify(publicConfig(config), null, 2));
  const result = await runHermes(config, {
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
  if (result.status !== 'done' && result.status !== 'attention') process.exitCode = 2;
}

main().catch(error => {
  console.error('[Hermes]', error.message);
  process.exitCode = 1;
});
