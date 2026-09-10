if (!requireRole('admin')) throw new Error('redirect');
renderNav('panel');
renderFooter();

const CAT_CLS = { '相扑机器人': 'cat', '迷宫机器人': 'cat-2', '任务挑战赛': 'cat-3' };

/* ---------- Tab ---------- */
const loaders = {
  dashboard: loadDashboard,
  registrations: loadRegistrations,
  posts: loadPosts,
  rankings: loadRankings,
  resets: loadResets
};
const loaded = {};
document.querySelectorAll('#admin-tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#admin-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  if (!loaded[b.dataset.tab]) { loaders[b.dataset.tab](); loaded[b.dataset.tab] = true; }
}));

/* ---------- 总览 ---------- */
async function loadDashboard() {
  const el = document.getElementById('dashboard');
  el.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const s = await apiGet('/api/admin/stats');
    el.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><b class="blue">${s.members}</b><span>注册成员（共 ${s.users} 账号）</span></div>
        <div class="stat-card"><b>${s.teams}</b><span>参赛队伍</span></div>
        <div class="stat-card"><b class="amber">${s.registrations.pending}</b><span>待审核报名</span></div>
        <div class="stat-card"><b class="green">${s.registrations.approved}</b><span>已通过报名</span></div>
        <div class="stat-card"><b class="red">${s.passwordResets.pending}</b><span>待处理找回申请</span></div>
        <div class="stat-card"><b>${s.posts.announcements}</b><span>公告（草稿 ${s.posts.total - s.posts.published}）</span></div>
        <div class="stat-card"><b>${s.posts.news}</b><span>赛事新闻</span></div>
        <div class="stat-card"><b>${s.rankings}</b><span>排行榜记录</span></div>
      </div>
      <div class="card">
        <h3>待办速览</h3>
        <p class="muted">
      ${s.registrations.pending ? `· 有 <b style="color:var(--amber)">${s.registrations.pending}</b> 份报名等待审核<br>` : '· 暂无待审核报名<br>'}
      ${s.passwordResets.pending ? `· 有 <b style="color:var(--red)">${s.passwordResets.pending}</b> 条忘记密码申请待处理<br>` : '· 暂无待处理的找回申请<br>'}
      · 已驳回报名 ${s.registrations.rejected} 份，已处理找回 ${s.passwordResets.done} 条
        </p>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------- 报名审核 ---------- */
async function loadRegistrations() {
  const el = document.getElementById('reg-admin-list');
  el.innerHTML = '<div class="empty">加载中…</div>';
  const status = document.getElementById('reg-filter').value;
  try {
    const list = await apiGet('/api/admin/registrations' + (status ? '?status=' + status : ''));
    if (!list.length) { el.innerHTML = '<div class="empty">没有符合条件的报名记录</div>'; return; }
    el.innerHTML = list.map((r) => `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <h3 style="margin:0">${esc(r.teamName)} <span class="tag ${CAT_CLS[r.category] || 'cat'}">${esc(r.category)}</span></h3>
          ${statusBadge(r.status)}
        </div>
        <div class="muted" style="margin:8px 0">
          提交人：${esc(r.submitter ? r.submitter.realName + '（@' + r.submitter.username + '）' : '未知用户')}
          · ${esc(r.submitter && r.submitter.phone || '')}
          · 提交于 ${fmtDate(r.createdAt)}
          ${r.reviewedAt ? '· ' + esc(r.reviewedBy) + ' 于 ' + fmtDate(r.reviewedAt) + ' 审核' : ''}
        </div>
        <table class="data">
          <tr><th style="width:80px">联系方式</th><td>${esc(r.contact)}</td><th style="width:80px">指导老师</th><td>${esc(r.advisor || '—')}</td></tr>
          <tr><th>队员名单</th><td colspan="3">${r.members.map((m) => `${esc(m.name)}（${esc(m.role)}${m.studentId ? '·' + esc(m.studentId) : ''}）`).join('、')}</td></tr>
          ${r.materials ? `<tr><th>材料说明</th><td colspan="3">${esc(r.materials)}</td></tr>` : ''}
          ${r.reviewComment ? `<tr><th>审核意见</th><td colspan="3">${esc(r.reviewComment)}</td></tr>` : ''}
        </table>
        <div style="margin-top:12px;display:flex;gap:8px">
          ${r.status === 'pending'
            ? `<button class="btn success sm" data-approve="${r.id}">✔ 通过</button>
               <button class="btn danger sm" data-reject="${r.id}">✘ 驳回</button>`
            : `<span class="muted" style="font-size:12.5px">已完成审核${r.status === 'approved' ? '（通过后已自动在排行榜占位）' : ''}</span>`}
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => reviewReg(b.dataset.approve, 'approved')));
    el.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => reviewReg(b.dataset.reject, 'rejected')));
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

function reviewReg(id, decision) {
  const pass = decision === 'approved';
  openModal(pass ? '通过报名' : '驳回报名', `
    <div class="form-row">
      <label>${pass ? '通过备注（选填，将展示给成员）' : '驳回原因 / 修改意见（建议填写）'}</label>
      <textarea id="review-comment" placeholder="${pass ? '例如：检录时请携带安全责任书纸质版' : '例如：队员人数不足，请补充至 2-5 人'}"></textarea>
    </div>
    ${pass ? '<div class="callout info">通过后系统会自动在该项目排行榜中为队伍创建 0 分占位记录。</div>' : ''}
  `, [
    { text: '取消', cls: 'btn ghost' },
    {
      text: pass ? '确认通过' : '确认驳回', cls: pass ? 'btn success' : 'btn danger',
      onClick: async () => {
        const comment = document.getElementById('review-comment').value.trim();
        if (!pass && !comment) { toast('驳回时请填写原因', 'error'); return true; }
        await apiPut(`/api/admin/registrations/${id}/review`, { decision, comment });
        toast(pass ? '已通过报名' : '已驳回报名', 'success');
        loaded.dashboard = false;
        loadRegistrations();
      }
    }
  ]);
}
document.getElementById('reg-filter').addEventListener('change', loadRegistrations);
document.getElementById('btn-reload-reg').addEventListener('click', loadRegistrations);

/* ---------- 新闻 / 公告 ---------- */
async function loadPosts() {
  const el = document.getElementById('post-admin-list');
  el.innerHTML = '<div class="empty">加载中…</div>';
  const type = document.getElementById('post-filter').value;
  try {
    const list = await apiGet('/api/admin/posts' + (type ? '?type=' + type : ''));
    if (!list.length) { el.innerHTML = '<div class="empty">暂无内容</div>'; return; }
    el.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>类型</th><th>标题</th><th>状态</th><th>作者</th><th>时间</th><th>操作</th></tr></thead>
      <tbody>${list.map((p) => `
        <tr>
          <td>${p.type === 'announcement' ? '<span class="tag cat">现场公告</span>' : '<span class="tag cat-2">赛事新闻</span>'}</td>
          <td>${p.pinned ? '📌 ' : ''}${esc(p.title)}<div class="muted" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.content.slice(0, 60))}</div></td>
          <td>${p.published ? statusBadge('published') : statusBadge('draft')}</td>
          <td class="muted">${esc(p.author)}</td>
          <td class="muted">${fmtDate(p.createdAt)}</td>
          <td style="white-space:nowrap">
            <button class="btn sm" data-edit="${p.id}">编辑</button>
            <button class="btn sm ghost" data-toggle="${p.id}" data-pub="${p.published ? 0 : 1}">${p.published ? '撤回' : '发布'}</button>
            <button class="btn sm danger" data-del="${p.id}">删除</button>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`;

    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editPost(b.dataset.edit)));
    el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      await apiPut('/api/admin/posts/' + b.dataset.toggle, { published: b.dataset.pub === '1' });
      toast('状态已更新', 'success');
      loadPosts();
    }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      openModal('删除确认', '<p>确定删除这条内容吗？删除后不可恢复。</p>', [
        { text: '取消', cls: 'btn ghost' },
        { text: '确认删除', cls: 'btn danger', onClick: async () => {
          await apiDel('/api/admin/posts/' + b.dataset.del);
          toast('已删除', 'success');
          loadPosts();
        } }
      ]);
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

function postForm(post) {
  return `
    <div class="form-row">
      <label>类型 <span class="req">*</span></label>
      <select id="pf-type">
        <option value="announcement" ${post && post.type === 'announcement' ? 'selected' : ''}>现场公告（首页展示）</option>
        <option value="news" ${post && post.type === 'news' ? 'selected' : ''}>赛事新闻</option>
      </select>
    </div>
    <div class="form-row">
      <label>标题 <span class="req">*</span></label>
      <input type="text" id="pf-title" maxlength="80" value="${esc(post ? post.title : '')}" placeholder="例如：【现场公告】决赛日签到时间调整">
    </div>
    <div class="form-row">
      <label>正文 <span class="req">*</span></label>
      <textarea id="pf-content" style="min-height:140px" placeholder="支持纯文本与换行">${esc(post ? post.content : '')}</textarea>
    </div>
    <div class="form-grid">
      <label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--text)">
        <input type="checkbox" id="pf-pinned" style="width:auto" ${post && post.pinned ? 'checked' : ''}> 置顶显示
      </label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--text)">
        <input type="checkbox" id="pf-published" style="width:auto" ${!post || post.published ? 'checked' : ''}> 立即发布（不勾则存为草稿）
      </label>
    </div>`;
}

function collectPostForm() {
  return {
    type: document.getElementById('pf-type').value,
    title: document.getElementById('pf-title').value.trim(),
    content: document.getElementById('pf-content').value,
    pinned: document.getElementById('pf-pinned').checked,
    published: document.getElementById('pf-published').checked
  };
}

document.getElementById('btn-new-post').addEventListener('click', () => {
  openModal('发布新闻 / 公告', postForm(null), [
    { text: '取消', cls: 'btn ghost' },
    { text: '发布', cls: 'btn primary', onClick: async () => {
      const body = collectPostForm();
      if (!body.title || !body.content.trim()) { toast('标题和正文不能为空', 'error'); return true; }
      await apiPost('/api/admin/posts', body);
      toast('内容已保存', 'success');
      loadPosts();
    } }
  ]);
});

async function editPost(id) {
  const list = await apiGet('/api/admin/posts');
  const post = list.find((p) => p.id === id);
  if (!post) return toast('内容不存在', 'error');
  openModal('编辑内容', postForm(post), [
    { text: '取消', cls: 'btn ghost' },
    { text: '保存', cls: 'btn primary', onClick: async () => {
      const body = collectPostForm();
      if (!body.title || !body.content.trim()) { toast('标题和正文不能为空', 'error'); return true; }
      await apiPut('/api/admin/posts/' + id, body);
      toast('已保存', 'success');
      loadPosts();
    } }
  ]);
}
document.getElementById('post-filter').addEventListener('change', loadPosts);
document.getElementById('btn-reload-post').addEventListener('click', loadPosts);

/* ---------- 排行榜维护 ---------- */
async function loadRankings() {
  const el = document.getElementById('rank-admin-list');
  el.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const list = await apiGet('/api/admin/rankings');
    if (!list.length) { el.innerHTML = '<div class="empty">暂无排名记录</div>'; return; }
    const cats = ['相扑机器人', '迷宫机器人', '任务挑战赛'];
    el.innerHTML = cats.filter((c) => list.some((r) => r.category === c)).map((c) => `
      <div class="section" style="padding:8px 0">
        <div class="section-head"><h2><span class="tag ${CAT_CLS[c]}">${c}</span></h2></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>名次</th><th>队伍</th><th>场次</th><th>胜</th><th>平</th><th>负</th><th>积分</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>${list.filter((r) => r.category === c).sort((a, b) => a.rank - b.rank).map((r) => `
            <tr>
              <td><span class="rank-num ${r.rank <= 3 ? 'r' + r.rank : ''}">${r.rank}</span></td>
              <td><b>${esc(r.teamName)}</b></td>
              <td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
              <td><b style="color:var(--primary)">${r.score}</b></td>
              <td class="muted">${fmtDate(r.updatedAt)}</td>
              <td style="white-space:nowrap">
                <button class="btn sm" data-edit-rank="${r.id}">编辑成绩</button>
                <button class="btn sm danger" data-del-rank="${r.id}">移除</button>
              </td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('');

    el.querySelectorAll('[data-edit-rank]').forEach((b) => b.addEventListener('click', () => editRank(b.dataset.editRank)));
    el.querySelectorAll('[data-del-rank]').forEach((b) => b.addEventListener('click', () => removeRank(b.dataset.delRank)));
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

function rankForm(r) {
  const num = (v) => (v == null ? 0 : v);
  return `
    <div class="form-grid">
      <div class="form-row"><label>队伍名称 <span class="req">*</span></label>
        <input type="text" id="rf-team" value="${esc(r ? r.teamName : '')}" placeholder="须与报名队名一致"></div>
      <div class="form-row"><label>比赛项目 <span class="req">*</span></label>
        <select id="rf-category">
          ${['相扑机器人', '迷宫机器人', '任务挑战赛'].map((c) =>
            `<option ${r && r.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>参赛场次</label><input type="number" min="0" id="rf-played" value="${r ? num(r.played) : 0}"></div>
      <div class="form-row"><label>胜</label><input type="number" min="0" id="rf-wins" value="${r ? num(r.wins) : 0}"></div>
      <div class="form-row"><label>平</label><input type="number" min="0" id="rf-draws" value="${r ? num(r.draws) : 0}"></div>
      <div class="form-row"><label>负</label><input type="number" min="0" id="rf-losses" value="${r ? num(r.losses) : 0}"></div>
    </div>
    <div class="form-row"><label>积分（可按 胜3平1负0 填写，也可手动录入仲裁调整分）</label>
      <input type="number" min="0" id="rf-score" value="${r ? num(r.score) : 0}"></div>
    <div class="callout info">保存后系统会在同一项目内按积分从高到低自动重排名次。</div>`;
}

function collectRankForm() {
  const get = (id) => Number(document.getElementById(id).value);
  return {
    teamName: document.getElementById('rf-team').value.trim(),
    category: document.getElementById('rf-category').value,
    played: get('rf-played'), wins: get('rf-wins'), draws: get('rf-draws'),
    losses: get('rf-losses'), score: get('rf-score')
  };
}

document.getElementById('btn-new-rank').addEventListener('click', () => {
  openModal('新增排名记录', rankForm(null), [
    { text: '取消', cls: 'btn ghost' },
    { text: '创建', cls: 'btn primary', onClick: async () => {
      const body = collectRankForm();
      if (!body.teamName) { toast('请填写队伍名称', 'error'); return true; }
      try {
        await apiPost('/api/admin/rankings', body);
        toast('记录已创建并完成排名', 'success');
        loadRankings();
      } catch (e) { toast(e.message, 'error'); return true; }
    } }
  ]);
});

async function editRank(id) {
  const list = await apiGet('/api/admin/rankings');
  const r = list.find((x) => x.id === id);
  if (!r) return;
  openModal('编辑比赛成绩', rankForm(r), [
    { text: '取消', cls: 'btn ghost' },
    { text: '保存', cls: 'btn primary', onClick: async () => {
      const body = collectRankForm();
      try {
        await apiPut('/api/admin/rankings/' + id, body);
        toast('成绩已保存，名次已更新', 'success');
        loadRankings();
      } catch (e) { toast(e.message, 'error'); return true; }
    } }
  ]);
}

function removeRank(id) {
  openModal('移除排名', '<p>确定将该队伍从排行榜移除吗？</p>', [
    { text: '取消', cls: 'btn ghost' },
    { text: '确认移除', cls: 'btn danger', onClick: async () => {
      await apiDel('/api/admin/rankings/' + id);
      toast('已移除并重新排名', 'success');
      loadRankings();
    } }
  ]);
}

document.getElementById('btn-recompute').addEventListener('click', async () => {
  try {
    const r = await apiPost('/api/admin/rankings/recompute', {});
    toast(`已按积分重算全部 ${r.recomputed} 条记录的名次`, 'success');
    loadRankings();
  } catch (e) { toast(e.message, 'error'); }
});

/* ---------- 忘记密码 ---------- */
async function loadResets() {
  const el = document.getElementById('reset-admin-list');
  el.innerHTML = '<div class="empty">加载中…</div>';
  const status = document.getElementById('reset-filter').value;
  try {
    const list = await apiGet('/api/admin/password-resets' + (status ? '?status=' + status : ''));
    if (!list.length) { el.innerHTML = '<div class="empty">没有符合条件的申请</div>'; return; }
    el.innerHTML = list.map((r) => `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <h3 style="margin:0">${esc(r.realName || '')}（@${esc(r.username)}）</h3>
          ${statusBadge(r.status)}
        </div>
        <div class="muted" style="margin:8px 0">
          联系方式：<b style="color:var(--text)">${esc(r.contact)}</b> · 提交于 ${fmtDate(r.createdAt)}
          ${r.handledAt ? '· ' + esc(r.handledBy) + ' 于 ' + fmtDate(r.handledAt) + ' 处理' : ''}
        </div>
        ${r.reason ? `<p class="muted" style="margin:6px 0;white-space:pre-wrap">说明：${esc(r.reason)}</p>` : ''}
        ${r.handleComment ? `<p class="muted" style="margin:6px 0">处理备注：${esc(r.handleComment)}</p>` : ''}
        ${r.status === 'pending' ? `
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn success sm" data-done="${r.id}">✔ 核实通过并重置</button>
          <button class="btn danger sm" data-reject-reset="${r.id}">✘ 驳回申请</button>
        </div>` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => handleReset(b.dataset.done, 'done')));
    el.querySelectorAll('[data-reject-reset]').forEach((b) => b.addEventListener('click', () => handleReset(b.dataset.rejectReset, 'rejected')));
  } catch (e) {
    el.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

function handleReset(id, status) {
  if (status === 'done') {
    openModal('核实身份并重置密码', `
      <div class="callout warn">请先通过预留联系方式核实申请人身份，再设置新密码；提交后请线下告知申请人新密码并提醒其登录后修改。</div>
      <div class="form-row">
        <label>新密码（至少 6 位，留空则仅标记为已处理、不修改密码）</label>
        <input type="text" id="rs-newpwd" placeholder="例如：Robo@2026">
      </div>
      <div class="form-row">
        <label>处理备注</label>
        <textarea id="rs-comment" placeholder="例如：已电话核实学号，新密码已短信发送"></textarea>
      </div>
    `, [
      { text: '取消', cls: 'btn ghost' },
      { text: '确认重置并完成', cls: 'btn success', onClick: async () => {
        const newPassword = document.getElementById('rs-newpwd').value.trim();
        const handleComment = document.getElementById('rs-comment').value.trim();
        if (newPassword && newPassword.length < 6) { toast('新密码至少 6 位', 'error'); return true; }
        await apiPut('/api/admin/password-resets/' + id, { status: 'done', newPassword, handleComment });
        toast('已处理，密码' + (newPassword ? '已重置' : '未变更'), 'success');
        loaded.dashboard = false;
        loadResets();
      } }
    ]);
  } else {
    openModal('驳回找回申请', `
      <div class="form-row"><label>驳回原因 <span class="req">*</span></label>
      <textarea id="rs-comment" placeholder="例如：联系方式无人接听、无法核实身份"></textarea></div>
    `, [
      { text: '取消', cls: 'btn ghost' },
      { text: '确认驳回', cls: 'btn danger', onClick: async () => {
        const handleComment = document.getElementById('rs-comment').value.trim();
        if (!handleComment) { toast('请填写驳回原因', 'error'); return true; }
        await apiPut('/api/admin/password-resets/' + id, { status: 'rejected', handleComment });
        toast('已驳回', 'success');
        loadResets();
      } }
    ]);
  }
}
document.getElementById('reset-filter').addEventListener('change', loadResets);
document.getElementById('btn-reload-reset').addEventListener('click', loadResets);

/* 初始加载总览 */
loadDashboard();
loaded.dashboard = true;
