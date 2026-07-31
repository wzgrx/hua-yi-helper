'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const installer = require('../scripts/install-openclaw-skill');

const root = path.resolve(__dirname, '..');
const sourceSkill = path.join(root, 'integrations', 'openclaw', 'hua-yi-helper');
const bridge = require(path.join(sourceSkill, 'scripts', 'bridge.js'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'huayi-openclaw-'));

function runNode(file, args, cwd) {
  return spawnSync(process.execPath, [file, ...(args || [])], {
    cwd: cwd || temp,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      HUAYI_USERNAME: '',
      HUAYI_PASSWORD: '',
      HUAYI_DATA_DIR: '',
      HUAYI_REPO: ''
    })
  });
}

(async () => {
  try {
    const skillText = fs.readFileSync(path.join(sourceSkill, 'SKILL.md'), 'utf8');
    assert.match(skillText, /^---\r?\nname: hua-yi-helper\r?\n/);
    assert.match(skillText, /requires.*node/s);
    assert(!/HUAYI_PASSWORD\s*=\s*['"][^'"]+/.test(skillText));

    const target = path.join(temp, 'managed-skills', 'hua-yi-helper');
    const installed = installer.install(target);
    assert.equal(installed.current, true);
    assert.equal(installed.repo, root);
    assert.equal(fs.readFileSync(path.join(target, 'repo-path.txt'), 'utf8').trim(), root);
    assert.equal(installer.installedState(target).installedDigest, installed.sourceDigest);
    assert.equal(installer.defaultTarget({
      OPENCLAW_STATE_DIR: path.join(temp, 'state')
    }), path.join(temp, 'state', 'skills', 'hua-yi-helper'));
    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nmodified fixture\n');
    assert.equal(installer.installedState(target).current, false);
    assert.equal(installer.install(target).current, true);

    const dataDir = path.join(temp, 'runtime');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'status.json'), `${JSON.stringify({
      version: require('../package.json').version,
      pid: process.pid,
      status: 'running',
      updatedAt: new Date().toISOString(),
      attempt: 1,
      restartCount: 0,
      state: {
        phase: 'record',
        message: 'OpenClaw fixture',
        publicEarned: 5,
        otherEarned: 14,
        publicProjected: 5,
        otherProjected: 20,
        blockedApplications: []
      }
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(dataDir, 'supervisor.lock'), `${JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString()
    })}\n`);

    const statusResult = runNode(
      path.join(target, 'scripts', 'bridge.js'),
      ['status', '--data-dir', dataDir]
    );
    assert.equal(statusResult.status, 0, statusResult.stderr);
    const status = JSON.parse(statusResult.stdout);
    assert.equal(status.alive, true);
    assert.equal(status.totalEarned, 19);

    const checkResult = runNode(
      path.join(target, 'scripts', 'bridge.js'),
      ['check', '--data-dir', dataDir]
    );
    assert.equal(checkResult.status, 0, checkResult.stderr);
    const check = JSON.parse(checkResult.stdout);
    assert.equal(check.integration, 'openclaw-hermes');
    assert.equal(check.lock.pid, process.pid);
    assert.equal(check.lock.alive, true);
    assert.equal(check.credentials.usernameConfigured, false);
    assert.equal(check.credentials.passwordConfigured, false);

    const duplicate = await bridge.start(root, dataDir, { year: '2026' });
    assert.equal(duplicate.status, 'already_running');
    assert.equal(duplicate.pid, process.pid);

    const startArgs = bridge.startArguments({
      year: '2026',
      'public-target': '5',
      'other-target': '20',
      username: 'secret',
      password: 'secret',
      supervise: 'false'
    }, dataDir);
    assert.deepEqual(startArgs.slice(0, 4), ['--data-dir', dataDir, '--supervise', 'true']);
    assert(startArgs.includes('--year'));
    assert(!startArgs.includes('--username'));
    assert(!startArgs.includes('--password'));

    for (const cli of ['cli.js', 'status-cli.js', 'captcha-cli.js']) {
      const helpDir = path.join(temp, `help-${cli}`);
      fs.mkdirSync(helpDir, { recursive: true });
      const result = runNode(path.join(root, 'src', 'hermes', cli), ['--help'], helpDir);
      assert.equal(result.status, 0, `${cli}: ${result.stderr}`);
      assert.match(result.stdout, /用法/);
      assert.equal(fs.existsSync(path.join(helpDir, '.huayi-hermes')), false);
    }

    const invalidPortDir = path.join(temp, 'invalid-port');
    fs.mkdirSync(invalidPortDir, { recursive: true });
    const invalidPort = runNode(
      path.join(root, 'src', 'hermes', 'captcha-cli.js'),
      ['--port', '70000'],
      invalidPortDir
    );
    assert.equal(invalidPort.status, 1);
    assert.match(invalidPort.stderr, /端口.*65535/);

    console.log('OpenClaw Skill、桥接状态、单实例与 CLI 帮助测试通过');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
