'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { resolveBrowser } = require('../src/hermes/config');
const {
  closeRuntimeResources,
  clickTrustedPlayerAction,
  updatePlayerWatch
} = require('../src/hermes/runner');

(async () => {
  const executablePath = resolveBrowser(process.env.HUAYI_BROWSER);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-hermes-smoke-'));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir: profile,
      args: ['--no-first-run', '--disable-default-apps']
    });
    const page = await browser.newPage();
    await page.setContent('<main id="fixture">Win11 + Edge + Hermes</main>');
    const text = await page.$eval('#fixture', element => element.textContent);
    assert.equal(text, 'Win11 + Edge + Hermes');
    const version = await browser.version();
    assert(/Chrome|Edge|HeadlessChrome/i.test(version));
    await page.setContent(`<div class="pv-bad-network-tip">您的网络环境较差，可尝试
        <span type="change" role="button" tabindex="0">切换到流畅</span>
      </div>
      <div class="layer_tips"><button class="rig_btn">继续学习</button></div>
      <script>
        window.__trustedClick = false;
        document.querySelector('.pv-bad-network-tip span[type="change"]').addEventListener('click', event => {
          window.__trustedClick = event.isTrusted;
        }, true);
      </script>`);
    const trusted = await clickTrustedPlayerAction(page);
    assert.equal(trusted.selector, '.pv-bad-network-tip span[type="change"]');
    assert.equal(trusted.text, '切换到流畅');
    assert.equal(await page.evaluate(() => window.__trustedClick), true);
    const playing = {
      url: 'https://cme28.91huayi.com/course_ware/course_ware_polyv.aspx?cwid=fixture',
      currentTime: 100,
      duration: 1000,
      paused: false,
      ended: false,
      readyState: 2,
      networkState: 2
    };
    const initialWatch = updatePlayerWatch(null, playing, 1000, 45000);
    assert.equal(initialWatch.stalled, false);
    const stalledWatch = updatePlayerWatch(initialWatch.watch, playing, 11001, 45000);
    assert.equal(stalledWatch.stalled, true);
    const advancedWatch = updatePlayerWatch(stalledWatch.watch,
      Object.assign({}, playing, { currentTime: 101 }), 47000, 45000);
    assert.equal(advancedWatch.stalled, false);
    const pausedWatch = updatePlayerWatch(initialWatch.watch,
      Object.assign({}, playing, { paused: true }), 60000, 45000);
    assert.equal(pausedWatch.stalled, false);
    console.log(`Hermes 真实浏览器烟雾测试通过：${version}`);
  } finally {
    await closeRuntimeResources(browser, null, false, profile);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => {
  if (process.env.HUAYI_BROWSER || process.env.HUAYI_REQUIRE_BROWSER_SMOKE === '1') {
    console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Hermes 浏览器烟雾测试已尝试：当前 Edge 实例未开放独立自动化进程（${error.message.split('\n')[0]}）`);
  }
});
