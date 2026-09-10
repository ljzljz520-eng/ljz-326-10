/**
 * 机器人社团赛事官网 —— HTTP 服务入口（零依赖）
 * GET  /            首页（静态页面）
 * /api/*            REST API（见 api.js）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { handleApi } = require('./api');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // 防目录穿越
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1><p>页面不存在，<a href="/">返回首页</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

store.load();

const server = http.createServer((req, res) => {
  // 宽松 CORS，便于本地/同源以外的调试
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url.startsWith('/api/')) return handleApi(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '方法不允许' } }));
});

server.listen(PORT, () => {
  console.log(`🤖 机器人社团赛事官网已启动: http://localhost:${PORT}`);
  console.log(`   管理员 admin / admin123    成员 zhangsan / member123`);
});
