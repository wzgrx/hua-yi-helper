'use strict';

const http = require('http');
const { createLocalRecognizer, solveCaptchaBuffer } = require('./captcha');

function writeJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(body);
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('验证码图片超过大小限制'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function startCaptchaServer(options) {
  const settings = options || {};
  const host = settings.host || '127.0.0.1';
  const port = settings.port === undefined ? 17891 : Number(settings.port);
  let recognizerPromise = null;
  const solver = settings.solve || (async buffer => {
    if (!recognizerPromise) recognizerPromise = createLocalRecognizer(settings);
    const recognizer = await recognizerPromise;
    return solveCaptchaBuffer(buffer, Object.assign({}, settings, { recognizer }));
  });
  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      writeJson(response, 204, {});
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, { ok: true, service: 'huayi-captcha' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/solve') {
      writeJson(response, 404, { ok: false, error: 'not_found' });
      return;
    }
    try {
      const body = await readBody(request, Number(settings.maxBytes || 2 * 1024 * 1024));
      if (!body.length) throw new Error('验证码图片为空');
      const result = await solver(body);
      writeJson(response, 200, {
        ok: true,
        code: result.code,
        confidence: Number(result.confidence || 0),
        votes: Number(result.votes || 0)
      });
    } catch (error) {
      writeJson(response, 422, { ok: false, error: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  if (settings.unref) server.unref();
  const address = server.address();
  return {
    server,
    url: `http://${host}:${address.port}/solve`,
    async close() {
      await new Promise(resolve => server.close(resolve));
      if (recognizerPromise) {
        const recognizer = await recognizerPromise.catch(() => null);
        if (recognizer && recognizer.terminate) await recognizer.terminate();
      }
    }
  };
}

module.exports = {
  readBody,
  startCaptchaServer
};
