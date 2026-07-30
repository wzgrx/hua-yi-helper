'use strict';

const assert = require('assert');
const http = require('http');
const sharp = require('sharp');
const {
  normalizeCaptchaText,
  rankCandidates,
  preprocessCaptcha,
  buildCaptchaVariants,
  solveCaptchaBuffer
} = require('../src/hermes/captcha');
const { startCaptchaServer } = require('../src/hermes/captcha-server');

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'content-length': body.length
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

(async () => {
  assert.equal(normalizeCaptchaText(' OI-SBG ', 5), '01586');
  assert.equal(normalizeCaptchaText('answer: 12345', 5), '12345');
  assert.equal(normalizeCaptchaText('1234', 5), '');

  const ranked = rankCandidates([
    { text: '12345', confidence: 70 },
    { text: '12345', confidence: 60 },
    { text: '98765', confidence: 99 }
  ], 5);
  assert.equal(ranked[0].code, '12345');
  assert.equal(ranked[0].votes, 2);

  const source = await sharp({
    create: { width: 120, height: 40, channels: 3, background: '#fdfdfd' }
  }).png().toBuffer();
  const processed = await preprocessCaptcha(source, { scale: 3, threshold: 150 });
  const metadata = await sharp(processed).metadata();
  assert.equal(metadata.width, 360);
  assert.equal(metadata.height, 120);
  const variants = await buildCaptchaVariants(source, { thresholds: [120, 160] });
  assert.equal(variants.length, 6);

  const recognitionSequence = [
    { text: '24680', confidence: 62 },
    { text: '24680', confidence: 78 },
    { text: '13579', confidence: 95 },
    { text: '24680', confidence: 70 }
  ];
  let index = 0;
  const solved = await solveCaptchaBuffer(source, {
    variants: variants.slice(0, 4),
    expectedLength: 5,
    earlyVotes: 3,
    recognizer: {
      async recognize() { return recognitionSequence[index++]; }
    }
  });
  assert.equal(solved.code, '24680');
  assert.equal(solved.votes, 3);

  const service = await startCaptchaServer({
    port: 0,
    solve: async body => ({
      code: body.length ? '86420' : '',
      confidence: 91,
      votes: 4
    })
  });
  try {
    const response = await requestJson(service.url, source);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      ok: true,
      code: '86420',
      confidence: 91,
      votes: 4
    });
  } finally {
    await service.close();
  }

  console.log('验证码预处理、共识识别与本机服务测试通过');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
