#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs } = require('./config');
const { startCaptchaServer } = require('./captcha-server');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port || process.env.HUAYI_CAPTCHA_PORT || 17891);
  const stateDir = path.resolve(args['data-dir'] || process.env.HUAYI_DATA_DIR || '.huayi-hermes');
  const service = await startCaptchaServer({
    port,
    cachePath: path.join(stateDir, 'ocr-cache'),
    expectedLength: Number(args.length || process.env.HUAYI_CAPTCHA_LENGTH || 5)
  });
  console.log(`[Captcha] 本机识别服务：${service.url}`);
  const close = async () => {
    await service.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

main().catch(error => {
  console.error('[Captcha]', error.message);
  process.exitCode = 1;
});
