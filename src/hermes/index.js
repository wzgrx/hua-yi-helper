/**
 * Hermes v6 - 华医网可视化诊断运行器 (Node.js + Puppeteer)
 * ============================================================
 * CLI入口
 * 用法: node index.js [options]
 *
 * Options:
 *   --mode <mode>      运行模式: full/video/brush/plan (默认: full)
 *   --headless         无头模式 (默认: false)
 *   --chrome-path      自定义Chrome路径
 *   --target-year      目标年份 (默认: 当前年份)
 *   --target-credits   目标学分 (默认: 25)
 * ============================================================
 */

const Bot = require('./bot');

async function main() {
  const args = process.argv.slice(2);
  const config = {
    mode: 'full',
    headless: false,
    chromePath: '',
    targetYear: new Date().getFullYear(),
    targetCredits: 25,
    publicCredits: 5,
    baseUrl: 'https://cme28.91huayi.com'
  };

  // Parse CLI args
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
      case '-m':
        config.mode = args[++i] || 'full';
        break;
      case '--headless':
      case '-h':
        config.headless = true;
        break;
      case '--chrome-path':
      case '-c':
        config.chromePath = args[++i] || '';
        break;
      case '--target-year':
      case '-y':
        config.targetYear = parseInt(args[++i]) || new Date().getFullYear();
        break;
      case '--target-credits':
      case '-t':
        config.targetCredits = parseInt(args[++i]) || 25;
        break;
      case '--help':
        console.log(`
Hermes v6 - 华医网可视化诊断运行器

用法: node index.js [options]

Options:
  --mode <mode>        运行模式: full/video/brush/plan (默认: full)
  --headless           无头模式
  --chrome-path <path> 自定义Chrome/Edge路径
  --target-year <y>    目标年份 (默认: 当前年份)
  --target-credits <n> 目标学分 (默认: 25)
  --help               显示帮助

模式说明:
  full   全自动: 学分规划→刷视频→考试 (默认)
  video  仅刷视频, 跳过考试
  brush  同video
  plan   仅生成学习计划, 不执行

示例:
  node index.js --mode full
  node index.js --mode video --headless
  node index.js --mode plan --target-year ${new Date().getFullYear()} --target-credits 25
`);
        process.exit(0);
    }
  }

  console.log(`[Hermes] v6 启动 | 模式: ${config.mode} | 正常顺序播放: 1× | 目标: ${config.targetYear}年 ${config.targetCredits}学分`);

  const bot = new Bot(config);
  try {
    await bot.run();
  } catch (err) {
    console.error(`[Hermes] 致命错误: ${err.message}`);
    console.error(err.stack);
  }

  console.log('[Hermes] 完成, 浏览器保持打开');
}

main().catch(err => {
  console.error(`[Hermes] 错误: ${err.message}`);
  process.exit(1);
});
