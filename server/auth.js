/**
 * 极简 JWT（HS256）实现，零依赖
 * header.payload.signature，payload/base64url(JSON)
 */
const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'robo-cup-dev-secret-change-me';
const TTL_SECONDS = 60 * 60 * 12; // 12 小时

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const head = base64url(JSON.stringify(header));
  const data = base64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, data, sig] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(`${head}.${data}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
