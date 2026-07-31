#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'integrations', 'openclaw', 'hua-yi-helper');
const markerName = '.hua-yi-helper-managed.json';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const split = item.indexOf('=');
    const name = item.slice(2, split > 0 ? split : undefined);
    result[name] = split > 0 ? item.slice(split + 1) :
      (argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true);
  }
  return result;
}

function defaultTarget(environment) {
  const env = environment || process.env;
  const stateDir = env.OPENCLAW_STATE_DIR || env.OPENCLAW_HOME ||
    (env.OPENCLAW_CONFIG_PATH ? path.dirname(path.resolve(env.OPENCLAW_CONFIG_PATH)) :
      path.join(os.homedir(), '.openclaw'));
  return path.join(env.OPENCLAW_SKILLS_DIR || path.join(stateDir, 'skills'), 'hua-yi-helper');
}

function sourceFiles() {
  return [
    path.join(source, 'SKILL.md'),
    path.join(source, 'scripts', 'bridge.js')
  ];
}

function digest(files, baseDir) {
  const hash = crypto.createHash('sha256');
  const base = baseDir || source;
  files.forEach(file => {
    hash.update(path.relative(base, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  });
  return hash.digest('hex');
}

function installedState(target) {
  const markerFile = path.join(target, markerName);
  let marker = null;
  try {
    marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  } catch (_) {}
  const required = [
    path.join(target, 'SKILL.md'),
    path.join(target, 'scripts', 'bridge.js'),
    path.join(target, 'repo-path.txt')
  ];
  const filesReady = required.every(file => fs.existsSync(file));
  const currentDigest = digest(sourceFiles());
  const installedContentFiles = [required[0], required[1]];
  const installedDigest = filesReady ? digest(installedContentFiles, target) : null;
  return {
    target,
    installed: filesReady,
    managed: Boolean(marker),
    repo: marker && marker.repo || null,
    version: marker && marker.version || null,
    sourceDigest: currentDigest,
    installedDigest,
    markerDigest: marker && marker.sourceDigest || null,
    current: Boolean(filesReady && marker && marker.repo === root &&
      marker.sourceDigest === currentDigest && installedDigest === currentDigest)
  };
}

function install(target) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const parent = path.dirname(target);
  const existing = installedState(target);
  if (fs.existsSync(target) && !existing.managed) {
    throw new Error(`目标目录已有非本项目文件：${target}`);
  }
  fs.mkdirSync(parent, { recursive: true });
  const stage = path.join(parent, `.hua-yi-helper-stage-${process.pid}-${Date.now()}`);
  const backup = path.join(parent, `.hua-yi-helper-backup-${process.pid}-${Date.now()}`);
  try {
    fs.cpSync(source, stage, { recursive: true });
    fs.writeFileSync(path.join(stage, 'repo-path.txt'), `${root}\n`, 'utf8');
    fs.writeFileSync(path.join(stage, markerName), `${JSON.stringify({
      integration: 'hua-yi-helper',
      repo: root,
      version: pkg.version,
      sourceDigest: digest(sourceFiles()),
      installedAt: new Date().toISOString()
    }, null, 2)}\n`, 'utf8');
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    fs.renameSync(stage, target);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
  return installedState(target);
}

function usage() {
  return `Install HuaYi Helper into OpenClaw's managed skills directory.

Usage:
  node scripts/install-openclaw-skill.js [--target PATH]
  node scripts/install-openclaw-skill.js --check [--target PATH]`;
}

function main(argv) {
  const args = parseArgs(argv || process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const target = path.resolve(String(args.target || defaultTarget()));
  const result = args.check ? installedState(target) : install(target);
  console.log(JSON.stringify(result, null, 2));
  if (args.check && !result.current) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[OpenClaw Install] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, defaultTarget, sourceFiles, digest, installedState, install, usage, main };
