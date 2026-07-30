'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createWorker, OEM, PSM } = require('tesseract.js');

const DEFAULT_EXPECTED_LENGTH = 5;
const DEFAULT_THRESHOLDS = [105, 125, 145, 165, 185, 205];
const DEFAULT_CHAR_THRESHOLDS = [110, 150, 190];

function normalizeCaptchaText(value, expectedLength) {
  const length = Number(expectedLength || DEFAULT_EXPECTED_LENGTH);
  const source = String(value == null ? '' : value).toUpperCase();
  const directDigits = source.replace(/\D/g, '');
  if (!length) return directDigits;
  if (directDigits.length === length) return directDigits;
  const directMatch = directDigits.match(new RegExp(`\\d{${length}}`));
  if (directMatch) return directMatch[0];
  const mapped = source
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/B/g, '8')
    .replace(/\D/g, '');
  if (mapped.length === length) return mapped;
  const match = mapped.match(new RegExp(`\\d{${length}}`));
  return match ? match[0] : '';
}

function rankCandidates(results, expectedLength) {
  const length = Number(expectedLength || DEFAULT_EXPECTED_LENGTH);
  const grouped = new Map();
  (results || []).forEach((result, index) => {
    const code = normalizeCaptchaText(result && (result.code || result.text), length);
    if (!code) return;
    const confidence = Math.max(0, Number(result.confidence || 0));
    const entry = grouped.get(code) || {
      code,
      votes: 0,
      confidenceTotal: 0,
      confidenceMax: 0,
      firstIndex: index
    };
    entry.votes += 1;
    entry.confidenceTotal += confidence;
    entry.confidenceMax = Math.max(entry.confidenceMax, confidence);
    grouped.set(code, entry);
  });
  const ranked = Array.from(grouped.values()).map(entry => ({
    code: entry.code,
    votes: entry.votes,
    confidence: entry.confidenceTotal / entry.votes,
    score: entry.votes * 1000 + entry.confidenceTotal + entry.confidenceMax,
    firstIndex: entry.firstIndex
  })).sort((left, right) =>
    right.score - left.score ||
    right.confidence - left.confidence ||
    left.firstIndex - right.firstIndex
  );
  return ranked;
}

async function imageMetadata(input) {
  const metadata = await sharp(input, { failOn: 'none' }).metadata();
  if (!metadata.width || !metadata.height) throw new Error('验证码图片尺寸为空');
  return metadata;
}

async function preprocessCaptcha(input, options) {
  const settings = options || {};
  const scale = Math.max(2, Number(settings.scale || 5));
  const threshold = Number(settings.threshold || 0);
  const channel = settings.channel;
  const metadata = await imageMetadata(input);
  let pipeline = sharp(input, { failOn: 'none' })
    .flatten({ background: '#ffffff' })
    .resize({
      width: Math.round(metadata.width * scale),
      height: Math.round(metadata.height * scale),
      kernel: sharp.kernel.lanczos3
    });
  if (channel !== undefined && channel !== null) pipeline = pipeline.extractChannel(channel);
  else pipeline = pipeline.grayscale();
  pipeline = pipeline.normalize().median(1).sharpen({ sigma: 1.1, m1: 0.7, m2: 2.2 });
  if (threshold > 0) pipeline = pipeline.threshold(threshold);
  return pipeline.png().toBuffer();
}

async function buildCaptchaVariants(input, options) {
  const settings = options || {};
  const thresholds = Array.isArray(settings.thresholds) && settings.thresholds.length ?
    settings.thresholds : DEFAULT_THRESHOLDS;
  const variants = [{
    name: 'gray',
    buffer: await preprocessCaptcha(input, { scale: settings.scale || 5 })
  }];
  for (const threshold of thresholds) {
    variants.push({
      name: `gray-${threshold}`,
      buffer: await preprocessCaptcha(input, { scale: settings.scale || 5, threshold })
    });
  }
  for (const channel of [0, 1, 2]) {
    variants.push({
      name: `channel-${channel}`,
      buffer: await preprocessCaptcha(input, {
        scale: settings.scale || 5,
        channel,
        threshold: Number(settings.channelThreshold || 150)
      })
    });
  }
  return variants;
}

async function buildSegmentedCaptchaVariants(input, options) {
  const settings = options || {};
  const expectedLength = Number(settings.expectedLength || DEFAULT_EXPECTED_LENGTH);
  const metadata = await imageMetadata(input);
  const referenceWidth = 63;
  const referenceHeight = 22;
  const startRatio = 5 / referenceWidth;
  const stepRatio = 9 / referenceWidth;
  const widthRatio = 12 / referenceWidth;
  const topRatio = 1 / referenceHeight;
  const heightRatio = 20 / referenceHeight;
  const thresholds = settings.charThresholds || DEFAULT_CHAR_THRESHOLDS;
  const groups = [];
  for (let index = 0; index < expectedLength; index++) {
    const variants = [];
    for (const shift of [-1, 0, 1]) {
      const shiftPixels = Math.round(shift * metadata.width / referenceWidth);
      let left = Math.round(metadata.width * (startRatio + index * stepRatio)) + shiftPixels;
      let top = Math.max(0, Math.round(metadata.height * topRatio));
      let width = Math.max(3, Math.round(metadata.width * widthRatio));
      let height = Math.max(3, Math.round(metadata.height * heightRatio));
      left = Math.max(0, Math.min(left, metadata.width - 1));
      top = Math.max(0, Math.min(top, metadata.height - 1));
      width = Math.max(1, Math.min(width, metadata.width - left));
      height = Math.max(1, Math.min(height, metadata.height - top));
      for (const threshold of thresholds) {
        const buffer = await sharp(input, { failOn: 'none' })
          .flatten({ background: '#ffffff' })
          .extract({ left, top, width, height })
          .resize({ width: 96, height: 160, kernel: sharp.kernel.lanczos3 })
          .grayscale()
          .normalize()
          .sharpen({ sigma: 1 })
          .threshold(Number(threshold))
          .extend({ left: 35, right: 35, top: 10, bottom: 10, background: '#ffffff' })
          .png()
          .toBuffer();
        variants.push({ name: `char-${index}-${shift}-${threshold}`, buffer });
      }
    }
    groups.push(variants);
  }
  return groups;
}

function rankDigitCandidates(results) {
  const grouped = new Map();
  (results || []).forEach((result, index) => {
    const digits = String(result && result.text || '').replace(/\D/g, '');
    if (digits.length !== 1) return;
    const confidence = Math.max(0, Number(result.confidence || 0));
    const entry = grouped.get(digits) || {
      digit: digits,
      votes: 0,
      confidenceTotal: 0,
      confidenceMax: 0,
      firstIndex: index
    };
    entry.votes += 1;
    entry.confidenceTotal += confidence;
    entry.confidenceMax = Math.max(entry.confidenceMax, confidence);
    grouped.set(digits, entry);
  });
  return Array.from(grouped.values()).map(entry => ({
    digit: entry.digit,
    votes: entry.votes,
    confidence: entry.confidenceTotal / entry.votes,
    score: entry.votes * 1000 + entry.confidenceTotal + entry.confidenceMax,
    firstIndex: entry.firstIndex
  })).sort((left, right) =>
    right.score - left.score ||
    right.confidence - left.confidence ||
    left.firstIndex - right.firstIndex
  );
}

async function solveSegmentedCaptcha(input, recognizer, options) {
  const settings = options || {};
  const expectedLength = Number(settings.expectedLength || DEFAULT_EXPECTED_LENGTH);
  if (!recognizer || typeof recognizer.setPageSegMode !== 'function') return null;
  const groups = await buildSegmentedCaptchaVariants(input, settings);
  await recognizer.setPageSegMode(PSM.SINGLE_CHAR);
  const characters = [];
  try {
    for (const variants of groups) {
      const results = [];
      for (const variant of variants) {
        const result = await recognizer.recognize(variant.buffer, variant.name);
        results.push(result || {});
      }
      const ranked = rankDigitCandidates(results);
      if (!ranked.length) return null;
      characters.push(ranked[0]);
    }
  } finally {
    await recognizer.setPageSegMode(PSM.SINGLE_WORD);
  }
  const code = characters.map(character => character.digit).join('');
  if (code.length !== expectedLength) return null;
  return {
    code,
    confidence: characters.reduce((sum, character) => sum + character.confidence, 0) / characters.length,
    votes: Math.min(...characters.map(character => character.votes)),
    candidates: [{ code, votes: Math.min(...characters.map(character => character.votes)) }],
    attempts: groups.reduce((sum, group) => sum + group.length, 0),
    method: 'segmented'
  };
}

async function createLocalRecognizer(options) {
  const settings = options || {};
  const cachePath = path.resolve(settings.cachePath || path.join(process.cwd(), '.huayi-hermes', 'ocr-cache'));
  fs.mkdirSync(cachePath, { recursive: true });
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    cachePath,
    logger: typeof settings.logger === 'function' ? settings.logger : () => {}
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    user_defined_dpi: '300',
    preserve_interword_spaces: '0'
  });
  let pageSegMode = PSM.SINGLE_WORD;
  async function setPageSegMode(mode) {
    if (String(mode) === String(pageSegMode)) return;
    pageSegMode = mode;
    await worker.setParameters({ tessedit_pageseg_mode: mode });
  }
  return {
    setPageSegMode,
    async recognize(buffer) {
      const result = await worker.recognize(buffer);
      return {
        text: result && result.data ? result.data.text : '',
        confidence: result && result.data ? result.data.confidence : 0
      };
    },
    async terminate() {
      await worker.terminate();
    }
  };
}

async function solveCaptchaBuffer(input, options) {
  const settings = options || {};
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
    throw new TypeError('验证码输入必须是图片字节');
  }
  const expectedLength = Number(settings.expectedLength || DEFAULT_EXPECTED_LENGTH);
  const variants = settings.variants || await buildCaptchaVariants(input, settings);
  const recognizer = settings.recognizer || await createLocalRecognizer(settings);
  const ownsRecognizer = !settings.recognizer;
  const results = [];
  try {
    if (settings.segmented !== false) {
      const segmented = await solveSegmentedCaptcha(input, recognizer, settings);
      if (segmented) return segmented;
    }
    for (const variant of variants) {
      const recognized = await recognizer.recognize(variant.buffer, variant.name);
      results.push({
        name: variant.name,
        text: recognized && recognized.text,
        confidence: recognized && recognized.confidence
      });
      const rankedNow = rankCandidates(results, expectedLength);
      if (rankedNow[0] && rankedNow[0].votes >= Number(settings.earlyVotes || 3)) break;
    }
  } finally {
    if (ownsRecognizer && recognizer.terminate) await recognizer.terminate();
  }
  const ranked = rankCandidates(results, expectedLength);
  if (!ranked.length) {
    const error = new Error(`验证码识别结果未达到 ${expectedLength} 位数字`);
    error.results = results.map(item => ({
      name: item.name,
      text: String(item.text || '').slice(0, 32),
      confidence: Number(item.confidence || 0)
    }));
    throw error;
  }
  return {
    code: ranked[0].code,
    confidence: ranked[0].confidence,
    votes: ranked[0].votes,
    candidates: ranked.slice(0, 5),
    attempts: results.length
  };
}

module.exports = {
  DEFAULT_EXPECTED_LENGTH,
  DEFAULT_THRESHOLDS,
  DEFAULT_CHAR_THRESHOLDS,
  normalizeCaptchaText,
  rankCandidates,
  rankDigitCandidates,
  preprocessCaptcha,
  buildCaptchaVariants,
  buildSegmentedCaptchaVariants,
  solveSegmentedCaptcha,
  createLocalRecognizer,
  solveCaptchaBuffer
};
