/* 公共工具：API 封装 / 登录态 / 导航 / 提示 / 模态框 */

const TOKEN_KEY = 'robo_token';
const USER_KEY = 'robo_user';

const Auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  get isLogin() { return Boolean(this.token); },
  get isAdmin() { return this.user && this.user.role === 'admin'; },
  updateUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (e) {
    throw { status: 0, code: 'NETWORK', message: '网络连接失败，请确认服务已启动' };
  }
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok || !data || data.ok === false) {
    const err = data && data.error ? data.error : { code: 'HTTP_' + res.status, message: `请求失败（${res.status}）` };
    err.status = res.status;
    throw err;
  }
  return data.data;
}

const apiGet = (p) => api(p);
const apiPost = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body || {}) });
const apiPut = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body || {}) });
const apiDel = (p) => api(p, { method: 'DELETE' });

/* ---------- 提示 ---------- */
let toastTimer = null;
function toast(message, type = '') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

/* ---------- 模态框 ---------- */
function openModal(title, bodyHtml, actions = []) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask show';
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <span class="close-x" title="关闭">&times;</span>
      <h3>${title}</h3>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions"></div>
    </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  mask.querySelector('.close-x').addEventListener('click', close);

  const actionBar = mask.querySelector('.modal-actions');
  const wrapped = actions.length
    ? actions
    : [{ text: '关闭', cls: 'btn ghost', onClick: close }];
  for (const a of wrapped) {
    const btn = document.createElement('button');
    btn.className = a.cls || 'btn';
    btn.textContent = a.text;
    btn.addEventListener('click', async () => {
      try {
        const keep = a.onClick ? await a.onClick(mask) : false;
        if (!keep && a.keepOpen !== true) close();
      } catch (e) {
        toast(e.message || '操作失败', 'error');
      }
    });
    actionBar.appendChild(btn);
  }
  return { mask, close };
}

/* ---------- 格式化 ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(s) { return s || '—'; }
const STATUS_TEXT = {
  pending: '待审核', approved: '已通过', rejected: '已驳回',
  done: '已处理', draft: '草稿', ongoing: '进行中', upcoming: '未开始', finished: '已结束',
  published: '已发布'
};
const statusBadge = (s) => `<span class="status ${esc(s)}">${esc(STATUS_TEXT[s] || s)}</span>`;

/* ---------- 附件下载（需带鉴权头，故用 fetch + blob） ---------- */
function fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

async function downloadFile(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${Auth.token}` } });
  if (!res.ok) {
    let msg = `下载失败（${res.status}）`;
    try { const d = await res.json(); if (d && d.error) msg = d.error.message; } catch { /* 非 JSON */ }
    throw { status: res.status, message: msg };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '附件';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 渲染附件链接 HTML（配合 bindFileLinks 使用）
function fileLinksHtml(files) {
  return (files || [])
    .map((f) => `<a href="javascript:void 0" class="file-link" data-file="${esc(f.id)}" data-name="${esc(f.filename)}">📎 ${esc(f.filename)}</a><span class="muted" style="font-size:12px">（${fmtSize(f.size)}）</span>`)
    .join('、');
}

// 为容器内 .file-link 绑定下载事件
function bindFileLinks(container) {
  container.querySelectorAll('.file-link[data-file]').forEach((a) =>
    a.addEventListener('click', () =>
      downloadFile(`/api/uploads/${a.dataset.file}/download`, a.dataset.name).catch((e) => toast(e.message, 'error'))
    )
  );
}

/* ---------- 导航 ---------- */
function renderNav(active) {
  const slot = document.getElementById('nav-slot');
  if (!slot) return;
  const u = Auth.user;
  const links = [
    { href: '/index.html', key: 'home', text: '首页' },
    { href: '/rankings.html', key: 'rankings', text: '队伍排名' }
  ];
  if (u) {
    links.push({
      href: u.role === 'admin' ? '/admin.html' : '/member.html',
      key: 'panel',
      text: u.role === 'admin' ? '管理后台' : '成员中心'
    });
  }
  slot.outerHTML = `
  <nav class="nav"><div class="container nav-inner">
    <a class="brand" href="/index.html"><span class="logo">🤖</span>机甲纪元・机器人社团赛事</a>
    <div class="nav-links">
      ${links.map((l) => `<a href="${l.href}" class="${l.key === active ? 'active' : ''}">${l.text}</a>`).join('')}
    </div>
    <div class="nav-user">
      ${u
        ? `<span>👋 ${esc(u.realName || u.username)} <span class="badge-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? '管理员' : '成员'}</span></span>
           <button class="btn sm ghost" id="btn-logout">退出</button>`
        : `<a class="btn sm" href="/login.html">登录</a>
           <a class="btn sm primary" href="/login.html#register">注册</a>`}
    </div>
  </div></nav>`;
  const btn = document.getElementById('btn-logout');
  if (btn) btn.addEventListener('click', () => {
    Auth.clear();
    toast('已退出登录');
    setTimeout(() => (location.href = '/index.html'), 400);
  });
}

function requireRole(role) {
  if (!Auth.isLogin) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return false; }
  if (role === 'admin' && !Auth.isAdmin) { toast('需要管理员权限', 'error'); setTimeout(() => (location.href = '/member.html'), 600); return false; }
  return true;
}

function renderFooter() {
  const el = document.getElementById('footer-slot');
  if (el) el.outerHTML = `<footer class="site-footer"><div class="container">
    机甲纪元机器人社团赛事组委会 · 本站为演示项目，数据保存在本地 data/db.json<br>
    技术支持：机器人社团技术部 · 比赛日检录请携带学生证
  </div></footer>`;
}

/* 401 全局兜底 */
document.addEventListener ? window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.status === 401) {
    Auth.clear();
    toast('登录已过期，请重新登录', 'error');
    setTimeout(() => (location.href = '/login.html'), 800);
  }
}) : null;
