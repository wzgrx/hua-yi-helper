'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalRecognizer, solveCaptchaBuffer } = require('../src/hermes/captcha');

(async () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'captcha-live');
  const labels = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'labels.json'), 'utf8'));
  const cachePath = path.join(os.tmpdir(), 'huayi-tesseract-cache');
  const recognizer = await createLocalRecognizer({ cachePath });
  const results = [];
  try {
    for (const [name, expected] of Object.entries(labels)) {
      const image = fs.readFileSync(path.join(fixtureDir, name));
      const solved = await solveCaptchaBuffer(image, {
        recognizer,
        expectedLength: 5
      });
      results.push({ name, expected, actual: solved.code, method: solved.method });
      assert.equal(solved.code, expected, `${name} 识别结果`);
      assert.equal(solved.method, 'segmented');
    }
  } finally {
    await recognizer.terminate();
  }
  assert.equal(results.length, 12);
  console.log(`真实华医验证码回归测试通过：${results.length}/${results.length}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
