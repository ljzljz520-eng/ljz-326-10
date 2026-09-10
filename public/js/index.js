renderNav('home');
renderFooter();

const CAT_CLS = { '相扑机器人': 'cat', '迷宫机器人': 'cat-2', '任务挑战赛': 'cat-3' };

async function loadSchedules() {
  const el = document.getElementById('schedule-list');
  try {
    const list = await apiGet('/api/schedules');
    el.innerHTML = list.map((s) => `
      <div class="tl-item ${esc(s.status)}">
        <div class="tl-date">${fmtDay(s.date)}${s.endDate && s.endDate !== s.date ? ' ~ ' + fmtDay(s.endDate) : ''}</div>
        <h4>${esc(s.title)} ${statusBadge(s.status)}</h4>
        <p><b style="color:#c7d2fe">${esc(s.stage)}</b> · 📍 ${esc(s.venue)}</p>
        <p>${esc(s.description)}</p>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">赛程加载失败：${esc(e.message)}</div>`;
  }
}

async function loadTeams() {
  const el = document.getElementById('team-list');
  try {
    const list = await apiGet('/api/teams');
    document.querySelector('#hero-stats .stat b').textContent = list.length;
    el.innerHTML = list.map((t) => `
      <div class="card team-card">
        <div class="team-logo" style="background:${esc(t.logoColor || '#38bdf8')}">${esc(t.name.slice(0, 1))}</div>
        <div>
          <h3>${esc(t.name)}</h3>
          <span class="tag ${CAT_CLS[t.category] || 'cat'}">${esc(t.category)}</span>
          <div class="muted" style="margin-top:6px">🏫 ${esc(t.school)}${t.advisor ? ' · 指导：' + esc(t.advisor) : ''}</div>
          <div class="muted" style="margin-top:4px;font-style:italic">“${esc(t.slogan)}”</div>
          <div class="members">队员：${esc(t.members.join('、'))}</div>
        </div>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">队伍加载失败：${esc(e.message)}</div>`;
  }
}

async function loadRules() {
  const el = document.getElementById('rule-list');
  try {
    const files = await apiGet('/api/rules');
    if (!files.length) { el.innerHTML = '<div class="empty">暂无规则文件</div>'; return; }
    el.innerHTML = files.map((f) => `
      <div class="post-item" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <h4>📄 ${esc(f.name)}</h4>
          <div class="muted">更新于 ${fmtDate(f.updatedAt)} · ${(f.size / 1024).toFixed(1)} KB · TXT</div>
        </div>
        <a class="btn sm primary" href="/api/rules/download/${encodeURIComponent(f.file)}" download>下载</a>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">规则加载失败：${esc(e.message)}</div>`;
  }
}

function postItemHtml(p) {
  return `
    <div class="post-item">
      <div class="meta">
        ${p.pinned ? '<span class="status pinned">置顶</span>' : ''}
        <span class="muted" style="font-size:12px">${fmtDate(p.createdAt)} · ${esc(p.author)}</span>
      </div>
      <h4>${esc(p.title)}</h4>
      <p>${esc(p.content)}</p>
    </div>`;
}

async function loadAnnouncements() {
  const el = document.getElementById('announce-list');
  try {
    const list = await apiGet('/api/posts?type=announcement&limit=6');
    el.innerHTML = list.length ? list.map(postItemHtml).join('') : '<div class="empty">暂无公告</div>';
  } catch (e) {
    el.innerHTML = `<div class="empty">公告加载失败：${esc(e.message)}</div>`;
  }
}

async function loadNews() {
  const el = document.getElementById('news-list');
  try {
    const [news, regs, rankings] = await Promise.all([
      apiGet('/api/posts?type=news&limit=5'),
      apiGet('/api/schedules').catch(() => []),
      apiGet('/api/rankings').catch(() => [])
    ]);
    el.innerHTML = news.length ? news.map(postItemHtml).join('') : '<div class="empty">暂无新闻</div>';
    const stats = document.querySelectorAll('#hero-stats .stat b');
    stats[3].textContent = new Set(rankings.map((r) => r.teamName)).size || '—';
  } catch (e) {
    el.innerHTML = `<div class="empty">新闻加载失败：${esc(e.message)}</div>`;
  }
}

loadSchedules();
loadTeams();
loadRules();
loadAnnouncements();
loadNews();
