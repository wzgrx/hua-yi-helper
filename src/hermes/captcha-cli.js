#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs, numberSetting } = require('./config');
const { startCaptchaServer } = require('./captcha-server');
const packageVersion = require('../../package.json').version;

function usage() {
  return `华医网本机验证码服务 v${packageVersion}

用法：
  huayi-captcha [--port PORT] [--data-dir PATH] [--length N]

选项：
  --port PORT        监听端口（默认 17891，仅监听本机回环地址）
  --data-dir PATH    OCR 缓存目录的父目录
  --length N         预期验证码长度（默认 5）
  -h, --help         显示帮助
  -v, --version      显示版本`;
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
  const args = parseArgs(cliArgs);
  const port = numberSetting(args.port || process.env.HUAYI_CAPTCHA_PORT, 17891, {
    name: '验证码服务端口', integer: true, min: 0, max: 65535
  });
  const stateDir = path.resolve(args['data-dir'] || process.env.HUAYI_DATA_DIR || '.huayi-hermes');
  const expectedLength = numberSetting(args.length || process.env.HUAYI_CAPTCHA_LENGTH, 5, {
    name: '验证码长度', integer: true, min: 1, max: 12
  });
  const service = await startCaptchaServer({
    port,
    cachePath: path.join(stateDir, 'ocr-cache'),
    expectedLength
  });
  console.log(`[Captcha] 本机识别服务：${service.url}`);
  const close = async () => {
    await service.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Captcha]', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, usage };
