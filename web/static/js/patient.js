(function () {
  const $ = (sel) => document.querySelector(sel);

  let resultsPage = 1;
  let currentMode = '';

  const MODE_LABELS = { conveyor: 'Конвейер', tea: 'Чай', drum: 'Барабан' };

  async function api(path, options) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
      ...options
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Ошибка запроса');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatName(p) {
    if (!p) return '—';
    return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || p.username || p.email || '—';
  }

  function formatDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return '—'; }
  }

  function formatShortDate(d) {
    try {
      return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } catch (_) { return ''; }
  }

  async function loadMe() {
    const me = await api('/api/patient/me');
    const welcome = $('#patientWelcome');
    if (welcome) welcome.textContent = formatName(me);

    // Нет лечащего врача — режим ожидания
    if (!me.assignedDoctor) {
      $('#waitingBanner').classList.remove('hidden');
      $('#patientMain').classList.add('hidden');
      return false;
    }

    $('#waitingBanner').classList.add('hidden');
    $('#patientMain').classList.remove('hidden');

    $('#doctorName').textContent = formatName(me.assignedDoctor);
    const cs = me.clinicalProfile && me.clinicalProfile.conditionSummary;
    if (cs) {
      $('#conditionSummary').textContent = cs;
      $('#conditionWrap').classList.remove('hidden');
    }
    return true;
  }

  function renderProgressChart(analytics) {
    const host = $('#chartProgress');
    if (!host || !window.MiniChart) return;
    const tl = (analytics && analytics.timeline) || [];
    if (!tl.length) {
      host.innerHTML = '<div class="minichart-empty">Нет данных для графика</div>';
      return;
    }
    MiniChart.line(host, {
      yMax: 100,
      labels: tl.map((p) => formatShortDate(p.date)),
      series: [
        { name: 'Балл (0–100)', color: '#3d9dff', values: tl.map((p) => p.score) },
        { name: 'Боль после (×10)', color: '#f87171', values: tl.map((p) => (p.painAfter != null ? p.painAfter * 10 : null)) }
      ]
    });
  }

  function renderModesChart(analytics) {
    const host = $('#chartModes');
    if (!host || !window.MiniChart) return;
    const bm = (analytics && analytics.byMode) || [];
    MiniChart.bar(host, {
      yMax: 100,
      labels: bm.map((m) => m.label),
      values: bm.map((m) => m.avgScore),
      colors: ['#3d9dff', '#34d399', '#f59e0b']
    });
  }

  async function loadAnalytics() {
    const a = await api('/api/patient/analytics');
    $('#st-total').textContent = a.totalSessions || 0;
    $('#st-score').textContent = a.avgScore || 0;
    $('#st-pain').textContent = a.pain && a.pain.avgDelta != null ? `−${a.pain.avgDelta}` : '—';
    $('#st-week').textContent = a.adherence ? a.adherence.last7Days : 0;
    renderProgressChart(a);
    renderModesChart(a);
  }

  async function loadResults() {
    const tb = $('#resultsBody');
    const q = `?page=${resultsPage}&limit=10${currentMode ? `&mode=${currentMode}` : ''}`;
    const data = await api(`/api/patient/results${q}`);
    tb.innerHTML = '';
    if (!data.items.length) {
      tb.innerHTML = '<tr><td colspan="5">Нет результатов</td></tr>';
      renderPager(0, 0);
      return;
    }
    data.items.forEach((r) => {
      const tr = document.createElement('tr');
      const pain = (r.painBefore != null || r.painAfter != null)
        ? `${r.painBefore ?? '—'} → ${r.painAfter ?? '—'}`
        : '—';
      tr.innerHTML = `
        <td>${escapeHtml(formatDate(r.startedAt))}</td>
        <td>${escapeHtml(r.modeLabel || MODE_LABELS[r.exerciseMode] || r.exerciseMode)}</td>
        <td>${escapeHtml(String(r.score ?? '—'))}</td>
        <td>${escapeHtml(String(r.accuracy ?? '—'))}%</td>
        <td>${escapeHtml(pain)}</td>
      `;
      tb.appendChild(tr);
    });
    renderPager(data.total, data.pages);
  }

  function renderPager(total, pages) {
    const pager = $('#resultsPager');
    if (!pager) return;
    if (total <= 10) { pager.innerHTML = ''; return; }
    pager.innerHTML = `
      <button type="button" class="pager-btn" id="resPrev" ${resultsPage <= 1 ? 'disabled' : ''}>← Назад</button>
      <span class="pager-info">Стр. ${resultsPage} из ${pages} · всего ${total}</span>
      <button type="button" class="pager-btn" id="resNext" ${resultsPage >= pages ? 'disabled' : ''}>Вперёд →</button>
    `;
    const prev = $('#resPrev');
    const next = $('#resNext');
    if (prev) prev.addEventListener('click', () => { resultsPage--; loadResults().catch(console.error); });
    if (next) next.addEventListener('click', () => { resultsPage++; loadResults().catch(console.error); });
  }

  async function loadNotes() {
    const list = $('#notesList');
    const notes = await api('/api/patient/notes');
    list.innerHTML = '';
    if (!notes.length) {
      list.innerHTML = '<li>Записей пока нет</li>';
      return;
    }
    notes.forEach((n) => {
      const li = document.createElement('li');
      const author = n.doctor ? formatName(n.doctor) : 'Врач';
      li.innerHTML = `<div class="meta">${escapeHtml(formatDate(n.createdAt))} · ${escapeHtml(author)}</div><div>${escapeHtml(n.body)}</div>`;
      list.appendChild(li);
    });
  }

  async function gate() {
    const st = await api('/api/auth/status');
    if (!st.authenticated) {
      window.location.href = '/auth?next=/patient';
      return false;
    }
    if (st.isAdmin) { window.location.href = '/'; return false; }
    if (st.isDoctor) { window.location.href = '/doctor'; return false; }
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const logout = $('#patientLogout');
    if (logout) {
      logout.addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST', body: '{}' });
        window.location.href = '/auth';
      });
    }
    const modeFilter = $('#modeFilter');
    if (modeFilter) {
      modeFilter.addEventListener('change', () => {
        currentMode = modeFilter.value;
        resultsPage = 1;
        loadResults().catch(console.error);
      });
    }

    (async function boot() {
      const ok = await gate();
      if (!ok) return;
      try {
        const hasDoctor = await loadMe();
        if (!hasDoctor) return;
        await Promise.all([loadAnalytics(), loadResults(), loadNotes()]);
      } catch (e) {
        console.error(e);
      }
    })();
  });
})();
