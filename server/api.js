/**
 * API 路由层
 * 约定：
 *   - 成功：{ ok: true, data: ... }
 *   - 失败：{ ok: false, error: { code, message } }
 *   - 鉴权：Authorization: Bearer <token>
 */
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { signToken, verifyToken } = require('./auth');

const CATEGORIES = ['相扑机器人', '迷宫机器人', '任务挑战赛'];
const POST_TYPES = ['announcement', 'news'];
const REG_STATUSES = ['pending', 'approved', 'rejected'];

/* 报名附件：类型白名单 / 大小上限 / MIME 映射 */
const UPLOAD_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'txt', 'doc', 'docx', 'xls', 'xlsx'];
const UPLOAD_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  zip: 'application/zip',
  txt: 'text/plain; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 单文件 5MB
const MAX_UPLOAD_BODY = 8 * 1024 * 1024; // base64 膨胀后的请求体上限
const MAX_ATTACHMENTS = 8;

/* ---------------- HTTP 辅助 ---------------- */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function ok(res, data, status = 200) {
  json(res, status, { ok: true, data });
}

function fail(res, status, code, message) {
  json(res, status, { ok: false, error: { code, message } });
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error(`请求体过大（上限 ${Math.round(maxBytes / 1024 / 1024)}MB）`), { status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON 格式错误'), { status: 400, code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

/* ---------------- 鉴权 ---------------- */

function authenticate(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return store.db.users.find((u) => u.id === payload.sub) || null;
}

function requireAuth(req, res) {
  const user = authenticate(req);
  if (!user) {
    fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期，请重新登录');
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    fail(res, 403, 'FORBIDDEN', '需要管理员权限');
    return null;
  }
  return user;
}

/* ---------------- 业务辅助 ---------------- */

function findUserByName(username) {
  return store.db.users.find((u) => u.username === username);
}

function rerankCategory(category) {
  const rows = store.db.rankings
    .filter((r) => r.category === category)
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.teamName.localeCompare(b.teamName, 'zh'));
  rows.forEach((r, i) => (r.rank = i + 1));
}

function rerankAll() {
  for (const c of CATEGORIES) rerankCategory(c);
}

function visiblePost(p) {
  return p.published ? p : { ...p, title: `[未发布] ${p.title}` };
}

/* ---------------- 迷你路由 ---------------- */

/**
 * 路由定义：method + 分段 pattern（:xxx 为参数）
 */
const routes = [];
function route(method, pattern, roles, handler) {
  routes.push({ method, pattern: pattern.split('/').filter(Boolean), roles, handler });
}

function matchRoute(method, segments) {
  for (const r of routes) {
    if (r.method !== method || r.pattern.length !== segments.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < r.pattern.length; i++) {
      const p = r.pattern[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segments[i]);
      else if (p !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route: r, params };
  }
  return null;
}

/* ================= 公开接口 ================= */

route('GET', '/api/health', 'public', (req, res) => {
  ok(res, {
    status: 'up',
    service: 'robo-cup-official',
    time: store.now()
  });
});

route('POST', '/api/auth/register', 'public', async (req, res) => {
  const b = await readBody(req);
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const realName = String(b.realName || '').trim();
  const email = String(b.email || '').trim();
  const phone = String(b.phone || '').trim();

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return fail(res, 400, 'VALIDATION', '用户名需为 3-20 位字母、数字或下划线');
  }
  if (password.length < 6) return fail(res, 400, 'VALIDATION', '密码至少 6 位');
  if (findUserByName(username)) return fail(res, 409, 'USER_EXISTS', '用户名已被注册');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, 'VALIDATION', '邮箱格式不正确');
  }

  const user = {
    id: store.newId('u'),
    username,
    realName: realName || username,
    role: 'member',
    email,
    phone,
    password: store.hashPassword(password),
    createdAt: store.now()
  };
  store.db.users.push(user);
  store.save();

  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  ok(res, { token, user: store.publicUser(user) }, 201);
});

route('POST', '/api/auth/login', 'public', async (req, res) => {
  const b = await readBody(req);
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) return fail(res, 400, 'VALIDATION', '用户名和密码不能为空');

  const user = findUserByName(username);
  if (!user || !store.verifyPassword(password, user.password)) {
    return fail(res, 401, 'BAD_CREDENTIALS', '用户名或密码错误');
  }
  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  ok(res, { token, user: store.publicUser(user) });
});

route('GET', '/api/schedules', 'public', (req, res) => {
  // 按开始日期升序
  const list = [...store.db.schedules].sort((a, b) => a.date.localeCompare(b.date));
  ok(res, list);
});

route('GET', '/api/teams', 'public', (req, res) => {
  const category = (new URL(req.url, 'http://x').searchParams.get('category') || '').trim();
  let list = store.db.teams;
  if (category) list = list.filter((t) => t.category === category);
  ok(res, list);
});

route('GET', '/api/rankings', 'public', (req, res) => {
  const sp = new URL(req.url, 'http://x').searchParams;
  const category = (sp.get('category') || '').trim();
  const list = [...store.db.rankings]
    .filter((r) => !category || r.category === category)
    .sort((a, b) => a.category.localeCompare(b.category, 'zh') || a.rank - b.rank);
  ok(res, list);
});

route('GET', '/api/posts', 'public', (req, res) => {
  const sp = new URL(req.url, 'http://x').searchParams;
  const type = (sp.get('type') || '').trim();
  const limit = parseInt(sp.get('limit') || '', 10);
  let list = store.db.posts
    .filter((p) => p.published)
    .filter((p) => !type || p.type === type)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  if (!Number.isNaN(limit) && limit > 0) list = list.slice(0, limit);
  ok(res, list);
});

route('GET', '/api/posts/:id', 'public', (req, res, params) => {
  const p = store.db.posts.find((x) => x.id === params.id);
  if (!p || !p.published) return fail(res, 404, 'NOT_FOUND', '内容不存在或未发布');
  ok(res, p);
});

route('GET', '/api/rules', 'public', (req, res) => {
  const files = fs
    .readdirSync(store.RULES_DIR, { withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => {
      const full = path.join(store.RULES_DIR, f.name);
      const stat = fs.statSync(full);
      return {
        file: f.name,
        name: f.name.replace(/\.txt$/i, ''),
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      };
    });
  ok(res, files);
});

route('GET', '/api/rules/download/:file', 'public', (req, res, params) => {
  const allowed = fs.readdirSync(store.RULES_DIR);
  const file = params.file;
  if (!allowed.includes(file) || file.includes('/') || file.includes('\\') || file.includes('..')) {
    return fail(res, 404, 'RULE_NOT_FOUND', '规则文件不存在');
  }
  const full = path.join(store.RULES_DIR, file);
  const data = fs.readFileSync(full);
  const filenameUtf8 = encodeURIComponent(file).replace(/%20/g, ' ');
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename="rule.txt"; filename*=UTF-8''${filenameUtf8}`,
    'Content-Length': data.length
  });
  res.end(data);
});

// 忘记密码：公开提交申请，等待管理员线下核实处理
route('POST', '/api/password-resets', 'public', async (req, res) => {
  const b = await readBody(req);
  const username = String(b.username || '').trim();
  const contact = String(b.contact || '').trim();
  const reason = String(b.reason || '').trim();
  if (!username) return fail(res, 400, 'VALIDATION', '请填写用户名');
  if (!contact) return fail(res, 400, 'VALIDATION', '请填写联系方式，方便管理员核实身份');

  const user = findUserByName(username);
  if (!user) return fail(res, 404, 'USER_NOT_FOUND', '该用户名不存在，请核对或联系管理员');

  const hasPending = store.db.passwordResets.some((r) => r.username === username && r.status === 'pending');
  if (hasPending) return fail(res, 409, 'ALREADY_REQUESTED', '该账号已有一条待处理的找回申请，请等待管理员处理');

  const item = {
    id: store.newId('pr'),
    username,
    realName: user.realName,
    contact,
    reason,
    status: 'pending',
    handledBy: null,
    handleComment: '',
    createdAt: store.now(),
    handledAt: null
  };
  store.db.passwordResets.push(item);
  store.save();
  ok(res, { id: item.id, status: item.status }, 201);
});

/* ================= 成员接口 ================= */

route('GET', '/api/me/profile', 'member', (req, res) => {
  const user = requireAuth(req, res);
  if (user) ok(res, store.publicUser(user));
});

route('PUT', '/api/me/profile', 'member', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const b = await readBody(req);
  if (b.realName !== undefined) {
    const v = String(b.realName).trim();
    if (!v) return fail(res, 400, 'VALIDATION', '真实姓名不能为空');
    user.realName = v;
  }
  if (b.email !== undefined) {
    const v = String(b.email).trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return fail(res, 400, 'VALIDATION', '邮箱格式不正确');
    user.email = v;
  }
  if (b.phone !== undefined) user.phone = String(b.phone).trim();
  store.save();
  ok(res, store.publicUser(user));
});

route('PUT', '/api/me/password', 'member', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const b = await readBody(req);
  const oldPwd = String(b.oldPassword || '');
  const newPwd = String(b.newPassword || '');
  if (!store.verifyPassword(oldPwd, user.password)) {
    return fail(res, 400, 'BAD_CREDENTIALS', '原密码不正确');
  }
  if (newPwd.length < 6) return fail(res, 400, 'VALIDATION', '新密码至少 6 位');
  user.password = store.hashPassword(newPwd);
  store.save();
  ok(res, { updated: true });
});

function validateRegistration(b) {
  const teamName = String(b.teamName || '').trim();
  const category = String(b.category || '').trim();
  const contact = String(b.contact || '').trim();
  const advisor = String(b.advisor || '').trim();
  const materials = String(b.materials || '').trim();
  let members = b.members;
  let attachments = b.attachments;

  if (!teamName) return { error: '请填写队伍名称' };
  if (teamName.length > 40) return { error: '队伍名称不超过 40 字' };
  if (!CATEGORIES.includes(category)) return { error: '比赛项目无效' };
  if (!contact) return { error: '请填写队长联系方式' };
  if (!Array.isArray(members)) return { error: '队员名单格式不正确' };

  members = members
    .map((m) => ({
      name: String((m && m.name) || '').trim(),
      role: String((m && m.role) || '队员').trim() || '队员',
      studentId: String((m && m.studentId) || '').trim()
    }))
    .filter((m) => m.name);
  if (members.length < 2 || members.length > 5) {
    return { error: '每队需 2-5 名队员' };
  }

  // 必须且只能有 1 名队长（分工中包含“队长”）
  const captains = members.filter((m) => m.role.includes('队长'));
  if (captains.length === 0) return { error: '队员名单中需指定 1 名队长（请将对应队员的分工填写为“队长”）' };
  if (captains.length > 1) return { error: `队长只能有 1 名，当前填写了 ${captains.length} 名` };

  // 队内不得重复（按姓名 / 学号）
  const seenNames = new Set();
  const seenSids = new Set();
  for (const m of members) {
    if (seenNames.has(m.name)) return { error: `队员名单中姓名重复：${m.name}` };
    seenNames.add(m.name);
    if (m.studentId) {
      if (seenSids.has(m.studentId)) return { error: `队员名单中学号重复：${m.studentId}` };
      seenSids.add(m.studentId);
    }
  }

  // 报名附件：至少 1 个，最多 MAX_ATTACHMENTS 个（材料须为可审查的附件，而非纯文字说明）
  if (!Array.isArray(attachments)) return { error: '报名附件格式不正确' };
  attachments = [...new Set(attachments.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!attachments.length) return { error: '请至少上传 1 个报名附件（如安全责任书、器材清单）' };
  if (attachments.length > MAX_ATTACHMENTS) return { error: `报名附件最多 ${MAX_ATTACHMENTS} 个` };

  return { value: { teamName, category, contact, advisor, materials, members, attachments } };
}

// 附件归属校验：只能引用本人上传、且仍存在的附件
function checkAttachments(ids, userId) {
  for (const id of ids) {
    const up = store.db.uploads.find((u) => u.id === id);
    if (!up) return '报名附件不存在或已被删除，请重新上传';
    if (up.userId !== userId) return '只能使用本人账号上传的附件';
  }
  return null;
}

// 跨队 / 跨项目查重：同一队员（按学号优先、姓名为辅）不得出现在其它有效报名中
function memberConflicts(members, excludeRegId, statuses = ['pending', 'approved']) {
  const active = store.db.registrations.filter(
    (r) => r.id !== excludeRegId && statuses.includes(r.status)
  );
  const conflicts = [];
  for (const m of members) {
    const hit = active.find((r) =>
      (r.members || []).some(
        (x) => (m.studentId && x.studentId && x.studentId === m.studentId) || x.name === m.name
      )
    );
    if (hit) conflicts.push({ member: m, reg: hit });
  }
  return conflicts;
}

function conflictMessage(conflicts) {
  const statusText = { pending: '待审核', approved: '已通过' };
  return (
    conflicts
      .map((c) => `队员「${c.member.name}」已出现在队伍「${c.reg.teamName}」的报名中（${statusText[c.reg.status] || c.reg.status}）`)
      .join('；') + '；同一队员不得跨队、跨项目报名'
  );
}

// 报名记录 + 附件元数据（用于前端展示与下载）
function regWithFiles(reg) {
  const attachmentFiles = (reg.attachments || [])
    .map((id) => store.db.uploads.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({ id: u.id, filename: u.filename, size: u.size, uploadedAt: u.createdAt }));
  return { ...reg, attachmentFiles };
}

// 提交报名资料
route('POST', '/api/registrations', 'member', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const b = await readBody(req);

  const blocked = store.db.registrations.find(
    (r) => r.userId === user.id && (r.status === 'pending' || r.status === 'approved')
  );
  if (blocked) {
    return fail(res, 409, 'REGISTRATION_EXISTS', `已存在${blocked.status === 'approved' ? '已通过' : '待审核'}的报名，不能重复提交`);
  }

  const v = validateRegistration(b);
  if (v.error) return fail(res, 400, 'VALIDATION', v.error);

  const attErr = checkAttachments(v.value.attachments, user.id);
  if (attErr) return fail(res, 400, 'VALIDATION', attErr);

  const conflicts = memberConflicts(v.value.members, null);
  if (conflicts.length) return fail(res, 409, 'MEMBER_CONFLICT', conflictMessage(conflicts));

  const reg = {
    id: store.newId('reg'),
    userId: user.id,
    ...v.value,
    status: 'pending',
    reviewComment: '',
    reviewedBy: null,
    createdAt: store.now(),
    reviewedAt: null,
    updatedAt: store.now()
  };
  store.db.registrations.push(reg);
  store.save();
  ok(res, regWithFiles(reg), 201);
});

// 查看本人报名（含审核状态）
route('GET', '/api/registrations/me', 'member', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const list = store.db.registrations
    .filter((r) => r.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(regWithFiles);
  ok(res, list);
});

// 待审核状态下可修改本人报名资料
route('PUT', '/api/registrations/:id', 'member', async (req, res, params) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const reg = store.db.registrations.find((r) => r.id === params.id);
  if (!reg || reg.userId !== user.id) return fail(res, 404, 'NOT_FOUND', '报名记录不存在');
  if (reg.status !== 'pending') return fail(res, 409, 'NOT_EDITABLE', '仅待审核状态的报名可以修改');

  const b = await readBody(req);
  const v = validateRegistration({ ...reg, ...b });
  if (v.error) return fail(res, 400, 'VALIDATION', v.error);

  const attErr = checkAttachments(v.value.attachments, user.id);
  if (attErr) return fail(res, 400, 'VALIDATION', attErr);

  const conflicts = memberConflicts(v.value.members, reg.id);
  if (conflicts.length) return fail(res, 409, 'MEMBER_CONFLICT', conflictMessage(conflicts));

  Object.assign(reg, v.value, { updatedAt: store.now() });
  store.save();
  ok(res, regWithFiles(reg));
});

// 上传报名附件（JSON：{ filename, dataBase64 }，支持 dataURL 前缀）
route('POST', '/api/uploads', 'member', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const b = await readBody(req, MAX_UPLOAD_BODY);

  const rawName = String(b.filename || '').trim();
  let dataBase64 = String(b.dataBase64 || '');
  const comma = dataBase64.indexOf(',');
  if (dataBase64.startsWith('data:') && comma !== -1) dataBase64 = dataBase64.slice(comma + 1);

  if (!rawName) return fail(res, 400, 'VALIDATION', '缺少文件名');
  const filename = rawName.split(/[\\/]/).pop().replace(/[\x00-\x1f]/g, '').trim().slice(0, 120);
  const ext = (filename.includes('.') ? filename.split('.').pop() : '').toLowerCase();
  if (!UPLOAD_EXT.includes(ext)) {
    return fail(res, 400, 'VALIDATION', `不支持的文件类型，允许：${UPLOAD_EXT.join(' / ')}`);
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(dataBase64)) {
    return fail(res, 400, 'VALIDATION', '文件内容编码不正确（需为 base64）');
  }
  const buf = Buffer.from(dataBase64, 'base64');
  if (!buf.length) return fail(res, 400, 'VALIDATION', '文件内容为空');
  if (buf.length > MAX_UPLOAD_SIZE) {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', `单个附件不能超过 ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB`);
  }

  const id = store.newId('up');
  const rec = {
    id,
    userId: user.id,
    filename,
    storedName: `${id}.${ext}`,
    size: buf.length,
    mime: UPLOAD_MIME[ext] || 'application/octet-stream',
    createdAt: store.now()
  };
  fs.writeFileSync(path.join(store.UPLOAD_DIR, rec.storedName), buf);
  store.db.uploads.push(rec);
  store.save();
  ok(res, { id: rec.id, filename: rec.filename, size: rec.size, uploadedAt: rec.createdAt }, 201);
});

// 下载附件：本人或管理员可下载（供报名审核查阅）
route('GET', '/api/uploads/:id/download', 'member', (req, res, params) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const up = store.db.uploads.find((u) => u.id === params.id);
  if (!up) return fail(res, 404, 'NOT_FOUND', '附件不存在');
  if (user.role !== 'admin' && up.userId !== user.id) {
    return fail(res, 403, 'FORBIDDEN', '只能下载本人上传的附件');
  }
  const full = path.join(store.UPLOAD_DIR, up.storedName);
  if (!fs.existsSync(full)) return fail(res, 404, 'FILE_MISSING', '附件文件已丢失，请重新上传');
  const data = fs.readFileSync(full);
  const filenameUtf8 = encodeURIComponent(up.filename).replace(/%20/g, ' ');
  res.writeHead(200, {
    'Content-Type': up.mime || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="file"; filename*=UTF-8''${filenameUtf8}`,
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  });
  res.end(data);
});

// 查看本人队伍排名（依据最近一条已通过报名的队名匹配排行榜）
route('GET', '/api/me/ranking', 'member', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const approved = store.db.registrations
    .filter((r) => r.userId === user.id && r.status === 'approved')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!approved) return ok(res, null);
  const ranking = store.db.rankings.find((r) => r.teamName === approved.teamName) || null;
  ok(res, { teamName: approved.teamName, category: approved.category, ranking });
});

/* ================= 管理员接口 ================= */

route('GET', '/api/admin/stats', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const count = (arr, fn = () => true) => arr.filter(fn).length;
  ok(res, {
    users: count(store.db.users),
    members: count(store.db.users, (u) => u.role === 'member'),
    teams: store.db.teams.length,
    registrations: {
      total: store.db.registrations.length,
      pending: count(store.db.registrations, (r) => r.status === 'pending'),
      approved: count(store.db.registrations, (r) => r.status === 'approved'),
      rejected: count(store.db.registrations, (r) => r.status === 'rejected')
    },
    posts: {
      total: store.db.posts.length,
      announcements: count(store.db.posts, (p) => p.type === 'announcement'),
      news: count(store.db.posts, (p) => p.type === 'news'),
      published: count(store.db.posts, (p) => p.published),
      drafts: count(store.db.posts, (p) => !p.published)
    },
    rankings: store.db.rankings.length,
    passwordResets: {
      pending: count(store.db.passwordResets, (r) => r.status === 'pending'),
      done: count(store.db.passwordResets, (r) => r.status === 'done'),
      rejected: count(store.db.passwordResets, (r) => r.status === 'rejected')
    }
  });
});

route('GET', '/api/admin/users', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  ok(res, store.db.users.map((u) => store.publicUser(u)));
});

// 报名审核列表
route('GET', '/api/admin/registrations', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const status = (new URL(req.url, 'http://x').searchParams.get('status') || '').trim();
  const list = store.db.registrations
    .filter((r) => !status || r.status === status)
    .map((r) => {
      const u = store.db.users.find((x) => x.id === r.userId);
      return { ...regWithFiles(r), submitter: u ? { username: u.username, realName: u.realName, phone: u.phone, email: u.email } : null };
    })
    .sort((a, b) => {
      const order = { pending: 0, rejected: 1, approved: 2 };
      return order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt);
    });
  ok(res, list);
});

// 审核报名：approved / rejected
route('PUT', '/api/admin/registrations/:id/review', 'admin', async (req, res, params) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const reg = store.db.registrations.find((r) => r.id === params.id);
  if (!reg) return fail(res, 404, 'NOT_FOUND', '报名记录不存在');

  const b = await readBody(req);
  const decision = String(b.decision || '').trim();
  const comment = String(b.comment || '').trim();
  if (!REG_STATUSES.includes(decision) || decision === 'pending') {
    return fail(res, 400, 'VALIDATION', '审核结论必须为 approved 或 rejected');
  }
  if (reg.status !== 'pending') return fail(res, 409, 'ALREADY_REVIEWED', '该报名已审核，不能重复审核');

  // 通过前兜底查重：不得与其它「已通过」报名的队员重复（防止历史数据/并发造成的跨队）
  if (decision === 'approved') {
    const conflicts = memberConflicts(reg.members || [], reg.id, ['approved']);
    if (conflicts.length) return fail(res, 409, 'MEMBER_CONFLICT', conflictMessage(conflicts) + '，请先驳回重复报名');
  }

  reg.status = decision;
  reg.reviewComment = comment;
  reg.reviewedBy = admin.username;
  reg.reviewedAt = store.now();
  reg.updatedAt = reg.reviewedAt;

  // 通过后自动在排行榜中占位（0 场），管理员可随后维护成绩
  if (decision === 'approved' && !store.db.rankings.some((r) => r.teamName === reg.teamName)) {
    store.db.rankings.push({
      id: store.newId('rk'),
      teamId: null,
      teamName: reg.teamName,
      category: reg.category,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      score: 0,
      rank: 0,
      updatedAt: store.now()
    });
    rerankCategory(reg.category);
  }

  store.save();
  ok(res, regWithFiles(reg));
});

// ---- 新闻 / 公告管理 ----

route('GET', '/api/admin/posts', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const sp = new URL(req.url, 'http://x').searchParams;
  const type = (sp.get('type') || '').trim();
  const list = store.db.posts
    .filter((p) => !type || p.type === type)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  ok(res, list);
});

route('POST', '/api/admin/posts', 'admin', async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const b = await readBody(req);
  const type = String(b.type || 'announcement').trim();
  const title = String(b.title || '').trim();
  const content = String(b.content || '').trim();
  if (!POST_TYPES.includes(type)) return fail(res, 400, 'VALIDATION', '类型必须为 announcement 或 news');
  if (!title) return fail(res, 400, 'VALIDATION', '标题不能为空');
  if (!content) return fail(res, 400, 'VALIDATION', '正文不能为空');

  const post = {
    id: store.newId('p'),
    type,
    title,
    content,
    pinned: Boolean(b.pinned),
    published: b.published === undefined ? true : Boolean(b.published),
    author: admin.realName || admin.username,
    createdAt: store.now(),
    updatedAt: store.now()
  };
  store.db.posts.push(post);
  store.save();
  ok(res, post, 201);
});

route('PUT', '/api/admin/posts/:id', 'admin', async (req, res, params) => {
  if (!requireAdmin(req, res)) return;
  const post = store.db.posts.find((p) => p.id === params.id);
  if (!post) return fail(res, 404, 'NOT_FOUND', '内容不存在');
  const b = await readBody(req);
  if (b.type !== undefined) {
    if (!POST_TYPES.includes(String(b.type))) return fail(res, 400, 'VALIDATION', '类型必须为 announcement 或 news');
    post.type = String(b.type);
  }
  if (b.title !== undefined) {
    const v = String(b.title).trim();
    if (!v) return fail(res, 400, 'VALIDATION', '标题不能为空');
    post.title = v;
  }
  if (b.content !== undefined) {
    const v = String(b.content);
    if (!v.trim()) return fail(res, 400, 'VALIDATION', '正文不能为空');
    post.content = v;
  }
  if (b.pinned !== undefined) post.pinned = Boolean(b.pinned);
  if (b.published !== undefined) post.published = Boolean(b.published);
  post.updatedAt = store.now();
  store.save();
  ok(res, post);
});

route('DELETE', '/api/admin/posts/:id', 'admin', (req, res, params) => {
  if (!requireAdmin(req, res)) return;
  const idx = store.db.posts.findIndex((p) => p.id === params.id);
  if (idx === -1) return fail(res, 404, 'NOT_FOUND', '内容不存在');
  const [removed] = store.db.posts.splice(idx, 1);
  store.save();
  ok(res, { id: removed.id });
});

// ---- 排行榜维护 ----

function rankingFromBody(b, partial = false) {
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw { status: 400, code: 'VALIDATION', message: `${name}必须为非负整数` };
    return n;
  };
  const out = {};
  if (!partial || b.teamName !== undefined) out.teamName = String(b.teamName || '').trim();
  if (!partial || b.category !== undefined) out.category = String(b.category || '').trim();
  out.played = num(partial && b.played === undefined ? 0 : b.played, '参赛场次');
  out.wins = num(partial && b.wins === undefined ? 0 : b.wins, '胜场');
  out.draws = num(partial && b.draws === undefined ? 0 : b.draws, '平场');
  out.losses = num(partial && b.losses === undefined ? 0 : b.losses, '负场');
  out.score = num(partial && b.score === undefined ? 0 : b.score, '积分');
  if (!out.teamName) throw { status: 400, code: 'VALIDATION', message: '请填写队伍名称' };
  if (!CATEGORIES.includes(out.category)) throw { status: 400, code: 'VALIDATION', message: '比赛项目无效' };
  if (out.wins + out.draws + out.losses > out.played) {
    throw { status: 400, code: 'VALIDATION', message: '胜+平+负不能超过参赛场次' };
  }
  return out;
}

route('GET', '/api/admin/rankings', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const list = [...store.db.rankings].sort(
    (a, b) => a.category.localeCompare(b.category, 'zh') || a.rank - b.rank
  );
  ok(res, list);
});

route('POST', '/api/admin/rankings', 'admin', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const b = await readBody(req);
  let fields;
  try {
    fields = rankingFromBody(b);
  } catch (e) {
    return fail(res, e.status, e.code, e.message);
  }
  if (store.db.rankings.some((r) => r.teamName === fields.teamName && r.category === fields.category)) {
    return fail(res, 409, 'DUPLICATE', '该项目下已存在同名队伍的排名记录');
  }
  const team = store.db.teams.find((t) => t.name === fields.teamName);
  const row = {
    id: store.newId('rk'),
    teamId: team ? team.id : null,
    ...fields,
    rank: 0,
    updatedAt: store.now()
  };
  store.db.rankings.push(row);
  rerankCategory(row.category);
  store.save();
  ok(res, row, 201);
});

route('PUT', '/api/admin/rankings/:id', 'admin', async (req, res, params) => {
  if (!requireAdmin(req, res)) return;
  const row = store.db.rankings.find((r) => r.id === params.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', '排名记录不存在');
  const b = await readBody(req);
  const oldCategory = row.category;
  const merged = {
    teamName: b.teamName === undefined ? row.teamName : b.teamName,
    category: b.category === undefined ? row.category : b.category,
    played: b.played === undefined ? row.played : b.played,
    wins: b.wins === undefined ? row.wins : b.wins,
    draws: b.draws === undefined ? row.draws : b.draws,
    losses: b.losses === undefined ? row.losses : b.losses,
    score: b.score === undefined ? row.score : b.score
  };
  let fields;
  try {
    fields = rankingFromBody(merged);
  } catch (e) {
    return fail(res, e.status, e.code, e.message);
  }
  const dup = store.db.rankings.find(
    (r) => r.id !== row.id && r.teamName === fields.teamName && r.category === fields.category
  );
  if (dup) return fail(res, 409, 'DUPLICATE', '该项目下已存在同名队伍的排名记录');

  const team = store.db.teams.find((t) => t.name === fields.teamName);
  Object.assign(row, fields, { teamId: team ? team.id : row.teamId, updatedAt: store.now() });
  rerankCategory(oldCategory);
  if (oldCategory !== row.category) rerankCategory(row.category);
  store.save();
  ok(res, row);
});

route('DELETE', '/api/admin/rankings/:id', 'admin', (req, res, params) => {
  if (!requireAdmin(req, res)) return;
  const idx = store.db.rankings.findIndex((r) => r.id === params.id);
  if (idx === -1) return fail(res, 404, 'NOT_FOUND', '排名记录不存在');
  const [removed] = store.db.rankings.splice(idx, 1);
  rerankCategory(removed.category);
  store.save();
  ok(res, { id: removed.id });
});

// 全量按积分重排名次
route('POST', '/api/admin/rankings/recompute', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  rerankAll();
  store.db.rankings.forEach((r) => (r.updatedAt = store.now()));
  store.save();
  ok(res, { recomputed: store.db.rankings.length });
});

// ---- 忘记密码处理 ----

route('GET', '/api/admin/password-resets', 'admin', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const status = (new URL(req.url, 'http://x').searchParams.get('status') || '').trim();
  const list = store.db.passwordResets
    .filter((r) => !status || r.status === status)
    .sort((a, b) => {
      const order = { pending: 0, rejected: 1, done: 2 };
      return order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt);
    });
  ok(res, list);
});

route('PUT', '/api/admin/password-resets/:id', 'admin', async (req, res, params) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const item = store.db.passwordResets.find((r) => r.id === params.id);
  if (!item) return fail(res, 404, 'NOT_FOUND', '找回申请不存在');
  if (item.status !== 'pending') return fail(res, 409, 'ALREADY_HANDLED', '该申请已处理');

  const b = await readBody(req);
  const status = String(b.status || '').trim();
  const comment = String(b.handleComment !== undefined ? b.handleComment : b.comment || '').trim();
  if (!['done', 'rejected'].includes(status)) {
    return fail(res, 400, 'VALIDATION', '处理结果必须为 done 或 rejected');
  }

  let resetUser = null;
  if (status === 'done') {
    resetUser = findUserByName(item.username);
    if (!resetUser) return fail(res, 404, 'USER_NOT_FOUND', '对应用户不存在，无法重置');
    const newPassword = String(b.newPassword || '');
    if (newPassword) {
      if (newPassword.length < 6) return fail(res, 400, 'VALIDATION', '新密码至少 6 位');
      resetUser.password = store.hashPassword(newPassword);
    }
  }

  item.status = status;
  item.handleComment = comment;
  item.handledBy = admin.username;
  item.handledAt = store.now();
  store.save();
  ok(res, {
    request: item,
    passwordReset: status === 'done' && Boolean(b.newPassword),
    notify: status === 'done' ? `请通过线下/预留联系方式（${item.contact}）告知用户处理结果` : undefined
  });
});

/* ---------------- 404 / 分发 ---------------- */

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  const matched = matchRoute(req.method, segments);

  if (!matched) {
    return fail(res, 404, 'NOT_FOUND', `接口不存在：${req.method} ${url.pathname}`);
  }

  // 角色校验
  const need = matched.route.roles;
  if (need !== 'public') {
    const user = authenticate(req);
    if (!user) return fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期，请重新登录');
    if (need === 'admin' && user.role !== 'admin') {
      return fail(res, 403, 'FORBIDDEN', '需要管理员权限');
    }
  }

  try {
    await matched.route.handler(req, res, matched.params);
  } catch (err) {
    if (err && err.status) return fail(res, err.status, err.code || 'ERROR', err.message);
    console.error('[api]', err);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', '服务器内部错误');
  }
}

module.exports = { handleApi, CATEGORIES, POST_TYPES };
