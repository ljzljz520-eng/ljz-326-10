if (!requireRole('member')) throw new Error('redirect');
renderNav('panel');
renderFooter();

const CAT_CLS = { '相扑机器人': 'cat', '迷宫机器人': 'cat-2', '任务挑战赛': 'cat-3' };
const user = Auth.user;
document.getElementById('hello').textContent = `你好，${user.realName || user.username}`;

/* ---------- Tab 切换 ---------- */
const tabBtns = document.querySelectorAll('#member-tabs button');
tabBtns.forEach((b) => b.addEventListener('click', () => {
  tabBtns.forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'ranking') loadMyRanking();
}));

/* ---------- 队员名单动态行 ---------- */
const membersRows = document.getElementById('members-rows');
function addMemberRow(m = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'form-row';
  wrap.style.cssText = 'position:relative';
  wrap.innerHTML = `
    <div class="form-grid" style="grid-template-columns:1.2fr 1fr 1fr auto;gap:8px;align-items:end">
      <div>
        <label>姓名</label>
        <input type="text" class="m-name" value="${esc(m.name || '')}" placeholder="队员姓名">
      </div>
      <div>
        <label>分工</label>
        <input type="text" class="m-role" value="${esc(m.role || '队员')}" placeholder="队长/编程/硬件">
      </div>
      <div>
        <label>学号</label>
        <input type="text" class="m-sid" value="${esc(m.studentId || '')}">
      </div>
      <button type="button" class="btn danger sm btn-del">删除</button>
    </div>`;
  wrap.querySelector('.btn-del').addEventListener('click', () => {
    if (membersRows.children.length > 1) wrap.remove();
    else toast('至少保留一名队员', 'error');
  });
  membersRows.appendChild(wrap);
}
document.getElementById('btn-add-member').addEventListener('click', () => addMemberRow());
addMemberRow({ name: user.realName || '', role: '队长' });
addMemberRow();

function collectMembers() {
  return [...membersRows.querySelectorAll('.form-row, .m-name')].length
    ? [...membersRows.children].map((row) => ({
        name: row.querySelector('.m-name').value.trim(),
        role: row.querySelector('.m-role').value.trim() || '队员',
        studentId: row.querySelector('.m-sid').value.trim()
      })).filter((m) => m.name)
    : [];
}
function fillMembers(list) {
  membersRows.innerHTML = '';
  list.forEach(addMemberRow);
  if (!list.length) { addMemberRow({ role: '队长' }); addMemberRow(); }
}

/* ---------- 报名附件 ---------- */
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'txt', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
let keptAttachments = []; // 已上传并保留的附件（编辑时来自服务端）
let pendingFiles = [];    // 本次新选择、待上传的文件
const fileInput = document.getElementById('reg-files');
const attListEl = document.getElementById('attachment-list');

function renderAttachments() {
  const chips = [
    ...keptAttachments.map((f, i) =>
      `<span class="file-chip">📎 ${esc(f.filename)}（${fmtSize(f.size)}）<button type="button" class="chip-x" data-kept="${i}" title="移除该附件">×</button></span>`),
    ...pendingFiles.map((f, i) =>
      `<span class="file-chip new">📎 ${esc(f.name)}（${fmtSize(f.size)}）<button type="button" class="chip-x" data-new="${i}" title="移除该附件">×</button></span>`)
  ];
  attListEl.innerHTML = chips.length
    ? chips.join('')
    : '<span class="muted" style="font-size:12.5px">尚未选择附件</span>';
  attListEl.querySelectorAll('[data-kept]').forEach((b) =>
    b.addEventListener('click', () => { keptAttachments.splice(Number(b.dataset.kept), 1); renderAttachments(); }));
  attListEl.querySelectorAll('[data-new]').forEach((b) =>
    b.addEventListener('click', () => { pendingFiles.splice(Number(b.dataset.new), 1); renderAttachments(); }));
}

fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) {
    const ext = (f.name.includes('.') ? f.name.split('.').pop() : '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) { toast(`不支持的文件类型：${f.name}`, 'error'); continue; }
    if (f.size > MAX_FILE_SIZE) { toast(`文件超过 5MB：${f.name}`, 'error'); continue; }
    if (keptAttachments.length + pendingFiles.length >= MAX_ATTACHMENTS) {
      toast(`附件最多 ${MAX_ATTACHMENTS} 个`, 'error');
      break;
    }
    pendingFiles.push(f);
  }
  fileInput.value = '';
  renderAttachments();
});

function readFileBase64(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',').pop());
    r.onerror = () => reject(new Error('文件读取失败：' + f.name));
    r.readAsDataURL(f);
  });
}

/* ---------- 报名列表 + 表单 ---------- */
const regListEl = document.getElementById('reg-list');
const regFormWrap = document.getElementById('reg-form-wrap');
const regForm = document.getElementById('form-reg');
let currentRegs = [];

function regCard(r) {
  const canEdit = r.status === 'pending';
  const rejectedTip = r.status === 'rejected'
    ? `<div class="callout warn" style="margin-top:10px">驳回原因：${esc(r.reviewComment || '无')}<br>可根据意见修改后重新提交一份新报名。</div>`
    : '';
  return `
  <div class="card" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <h3 style="margin:0">${esc(r.teamName)} <span class="tag ${CAT_CLS[r.category] || 'cat'}">${esc(r.category)}</span></h3>
      ${statusBadge(r.status)}
    </div>
    <div class="muted" style="margin:8px 0">
      提交时间：${fmtDate(r.createdAt)}${r.reviewedAt ? ' · 审核时间：' + fmtDate(r.reviewedAt) : ''}${r.reviewedBy ? ' · 审核人：' + esc(r.reviewedBy) : ''}
    </div>
    <table class="data" style="margin-top:6px">
      <tr><th style="width:80px">联系方式</th><td>${esc(r.contact)}</td><th style="width:80px">指导老师</th><td>${esc(r.advisor || '—')}</td></tr>
      <tr><th>队员名单</th><td colspan="3">${r.members.map((m) => `${esc(m.name)}（${esc(m.role)}${m.studentId ? '·' + esc(m.studentId) : ''}）`).join('、')}</td></tr>
      ${(r.attachmentFiles && r.attachmentFiles.length) ? `<tr><th>报名附件</th><td colspan="3">${fileLinksHtml(r.attachmentFiles)}</td></tr>` : ''}
      ${r.materials ? `<tr><th>材料说明</th><td colspan="3">${esc(r.materials)}</td></tr>` : ''}
      ${r.reviewComment && r.status === 'approved' ? `<tr><th>审核意见</th><td colspan="3" style="color:var(--green)">${esc(r.reviewComment)}</td></tr>` : ''}
    </table>
    ${rejectedTip}
    <div style="margin-top:12px">
      ${canEdit ? `<button class="btn sm" data-edit="${r.id}">✏️ 修改报名资料</button>` : ''}
    </div>
  </div>`;
}

async function loadRegistrations() {
  try {
    currentRegs = await apiGet('/api/registrations/me');
  } catch (e) {
    regListEl.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
    return;
  }
  regListEl.innerHTML = currentRegs.length ? currentRegs.map(regCard).join('') : '';
  regListEl.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => editReg(btn.dataset.edit))
  );
  bindFileLinks(regListEl);

  const blocked = currentRegs.some((r) => r.status === 'pending' || r.status === 'approved');
  const pending = currentRegs.find((r) => r.status === 'pending');
  if (!blocked) {
    showForm(null);
  } else if (pending) {
    showForm(pending);
  } else {
    regFormWrap.style.display = 'none';
    if (!currentRegs.length) regListEl.innerHTML = '<div class="empty">你还没有报名记录</div>';
  }
}

function showForm(reg) {
  regFormWrap.style.display = '';
  document.getElementById('reg-edit-tip').style.display = reg ? '' : 'none';
  document.getElementById('reg-form-title').textContent = reg ? '修改报名资料（待审核）' : '提交报名资料';
  document.getElementById('reg-submit-btn').textContent = reg ? '保存修改' : '提交报名';
  regForm.id.value = reg ? reg.id : '';
  regForm.teamName.value = reg ? reg.teamName : '';
  regForm.category.value = reg ? reg.category : '';
  regForm.contact.value = reg ? reg.contact : (user.phone || '');
  regForm.advisor.value = reg ? reg.advisor : '';
  regForm.materials.value = reg ? reg.materials : '';
  keptAttachments = reg ? (reg.attachmentFiles || []).slice() : [];
  pendingFiles = [];
  renderAttachments();
  fillMembers(reg ? reg.members : null);
  window.scrollTo({ top: regFormWrap.offsetTop - 80, behavior: 'smooth' });
}

function editReg(id) {
  const reg = currentRegs.find((r) => r.id === id);
  if (reg) showForm(reg);
}

regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const members = collectMembers();
  // 提交前预检（服务端仍会兜底校验）
  const captains = members.filter((m) => m.role.includes('队长'));
  if (captains.length !== 1) {
    toast(captains.length === 0 ? '请将其中一名队员的分工填写为“队长”' : '队长只能有 1 名，请检查分工', 'error');
    return;
  }
  if (!keptAttachments.length && !pendingFiles.length) {
    toast('请至少上传 1 个报名附件（如安全责任书、器材清单）', 'error');
    return;
  }
  const id = regForm.id.value;
  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  try {
    // 先上传新附件，再连同保留的附件 id 一起提交
    const attachmentIds = keptAttachments.map((f) => f.id);
    for (const f of pendingFiles) {
      const up = await apiPost('/api/uploads', { filename: f.name, dataBase64: await readFileBase64(f) });
      attachmentIds.push(up.id);
    }
    const payload = {
      teamName: regForm.teamName.value.trim(),
      category: regForm.category.value,
      contact: regForm.contact.value.trim(),
      advisor: regForm.advisor.value.trim(),
      materials: regForm.materials.value.trim(),
      members,
      attachments: attachmentIds
    };
    if (id) {
      await apiPut('/api/registrations/' + id, payload);
      toast('报名资料已更新，等待审核', 'success');
    } else {
      await apiPost('/api/registrations', payload);
      toast('报名提交成功，请等待审核', 'success');
    }
    pendingFiles = [];
    await loadRegistrations();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 本队排名 ---------- */
async function loadMyRanking() {
  const el = document.getElementById('my-ranking');
  el.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const data = await apiGet('/api/me/ranking');
    if (!data) {
      el.innerHTML = `<div class="card"><div class="empty">你还没有审核通过的报名；通过审核后，本队成绩将出现在这里。</div></div>`;
      return;
    }
    if (!data.ranking) {
      el.innerHTML = `<div class="card">
        <h3>${esc(data.teamName)} <span class="tag ${CAT_CLS[data.category] || 'cat'}">${esc(data.category)}</span></h3>
        <p class="muted">报名已通过，暂未录入比赛成绩。排行榜由管理员在比赛后维护。</p>
      </div>`;
      return;
    }
    const r = data.ranking;
    el.innerHTML = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h3 style="margin:0"><span class="rank-num ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank || '-'}</span> ${esc(r.teamName)}</h3>
        <span class="tag ${CAT_CLS[r.category] || 'cat'}">${esc(r.category)}</span>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table class="data">
        <tr><th>场次</th><th>胜</th><th>平</th><th>负</th><th>积分</th><th>更新时间</th></tr>
        <tr><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
        <td><b style="color:var(--primary)">${r.score}</b></td><td class="muted">${fmtDate(r.updatedAt)}</td></tr>
      </table></div>
      <p style="margin-top:12px"><a href="/rankings.html">查看完整排行榜 →</a></p>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------- 账号设置 ---------- */
const pForm = document.getElementById('form-profile');
document.getElementById('p-username').value = user.username;
pForm.realName.value = user.realName || '';
pForm.email.value = user.email || '';
pForm.phone.value = user.phone || '';
pForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const u = await apiPut('/api/me/profile', {
      realName: pForm.realName.value.trim(),
      email: pForm.email.value.trim(),
      phone: pForm.phone.value.trim()
    });
    Auth.updateUser(u);
    toast('资料已保存', 'success');
    document.getElementById('hello').textContent = `你好，${u.realName || u.username}`;
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('form-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await apiPut('/api/me/password', {
      oldPassword: f.oldPassword.value,
      newPassword: f.newPassword.value
    });
    toast('密码已更新', 'success');
    f.reset();
  } catch (err) {
    toast(err.message, 'error');
  }
});

loadRegistrations();
