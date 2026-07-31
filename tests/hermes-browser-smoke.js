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
  clickTrustedSurveyAction,
  captureDiagnostic,
  sanitizeDiagnosticHtml,
  operationTimeout,
  updatePlayerWatch
} = require('../src/hermes/runner');

(async () => {
  assert.equal(await operationTimeout(Promise.resolve('ok'), 50, 'fixture'), 'ok');
  await assert.rejects(
    operationTimeout(new Promise(() => {}), 20, 'fixture'),
    error => error && error.code === 'HERMES_OPERATION_TIMEOUT'
  );
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
    assert(/(?:Chrome|Chromium|HeadlessChrome|Edge|Edg)\//i.test(version));
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
    await page.setContent(`<button class="pv-playpause pv-iconfont pv-icon-btn-play"></button>
      <script>
        document.querySelector('.pv-playpause').addEventListener('click', event => {
          window.__trustedCasePlay = event.isTrusted;
        }, true);
      </script>`);
    await page.evaluate(() => {
      window.__HY8_CASE_VIDEO_DONE = { key: location.href, at: Date.now() };
    });
    assert.equal(await clickTrustedPlayerAction(page), null);
    await page.evaluate(() => { delete window.__HY8_CASE_VIDEO_DONE; });
    const trustedCasePlay = await clickTrustedPlayerAction(page);
    assert.equal(trustedCasePlay.selector, '.pv-playpause.pv-icon-btn-play');
    assert.equal(await page.evaluate(() => window.__trustedCasePlay), true);
    await page.setContent(`<div id="aliyunCaptcha-checkbox-icon">验证</div>
      <script>
        document.querySelector('#aliyunCaptcha-checkbox-icon').addEventListener('click', event => {
          window.__trustedSurveyCheck = event.isTrusted;
        }, true);
      </script>`);
    const trustedSurvey = await clickTrustedSurveyAction(page);
    assert.equal(trustedSurvey.selector, '#aliyunCaptcha-checkbox-icon');
    assert.equal(await page.evaluate(() => window.__trustedSurveyCheck), true);
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
    assert(!sanitizeDiagnosticHtml('<input value="secret"><p>1234567890123</p>').includes('secret'));
    assert(!sanitizeDiagnosticHtml('<input value="secret"><p>1234567890123</p>').includes('1234567890123'));
    const diagnosticsDir = path.join(profile, 'diagnostics');
    await page.setContent(`<main>异常页面 1234567890123
      <input id="account" value="secret-account"><textarea>secret-note</textarea>
      <script>window.secret = 'secret-script'</script></main>`);
    for (let index = 0; index < 3; index++) {
      await captureDiagnostic(page, {
        version: 'fixture-version',
        diagnosticsEnabled: true,
        diagnosticsDir,
        diagnosticLimit: 2
      }, `fixture-${index}`);
    }
    const diagnosticMetadata = fs.readdirSync(diagnosticsDir).filter(name => name.endsWith('.json'));
    assert.equal(diagnosticMetadata.length, 2);
    const diagnosticHtml = fs.readFileSync(path.join(
      diagnosticsDir, diagnosticMetadata.map(name => name.replace(/\.json$/, '.html'))[0]
    ), 'utf8');
    assert(!diagnosticHtml.includes('secret-account'));
    assert(!diagnosticHtml.includes('secret-note'));
    assert(!diagnosticHtml.includes('secret-script'));
    assert(!diagnosticHtml.includes('1234567890123'));
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
