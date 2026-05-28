(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentPatientId = null;
  let patientsCache = [];
  let patientsPage = 1;
  const PATIENTS_PAGE_SIZE = 10;

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
      err.data = data;
      throw err;
    }
    return data;
  }

  async function gate() {
    const st = await api('/api/auth/status');
    if (!st.authenticated) {
      window.location.href = '/auth?next=/doctor';
      return false;
    }
    if (!st.isDoctor) {
      window.location.href = '/';
      return false;
    }
    const me = await api('/api/doctor/me');
    const welcome = $('#doctorWelcome');
    if (welcome) {
      const n = [me.lastName, me.firstName].filter(Boolean).join(' ') || me.username || me.email;
      welcome.textContent = n;
    }
    return true;
  }

  async function loadOverview() {
    const o = await api('/api/doctor/overview');
    $('#st-patients').textContent = o.patientsTotal ?? '0';
    $('#st-results').textContent = o.exerciseResultsLast7Days ?? '0';
    $('#st-pain').textContent = o.avgPainDelta != null ? `−${o.avgPainDelta}` : '—';
    $('#st-notes').textContent = o.medicalNotesTotal ?? '0';
    $('#st-devices').textContent = o.activePeriodDevicesApprox ?? '0';
  }

  function formatName(p) {
    return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || p.username || p.email || '—';
  }

  function formatDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return '—';
    }
  }

  async function loadPatients(keepPage) {
    const tbody = $('#patientsBody');
    const empty = $('#patientsEmpty');
    patientsCache = await api('/api/doctor/patients');
    populateAnalyticsSelect();
    tbody.innerHTML = '';
    if (!patientsCache.length) {
      empty.classList.remove('hidden');
      renderPatientsPager(0, 0);
      return;
    }
    empty.classList.add('hidden');
    renderPatientsTable(keepPage);
  }

  function renderPatientsTable(keepPage) {
    const tbody = $('#patientsBody');
    const q = ($('#patientSearch') && $('#patientSearch').value.toLowerCase()) || '';
    const filtered = patientsCache.filter((p) => formatName(p).toLowerCase().includes(q));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PATIENTS_PAGE_SIZE));
    if (!keepPage) patientsPage = 1;
    if (patientsPage > totalPages) patientsPage = totalPages;
    const start = (patientsPage - 1) * PATIENTS_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PATIENTS_PAGE_SIZE);

    tbody.innerHTML = '';
    for (const p of pageItems) {
      const tr = document.createElement('tr');
      const tags = (p.clinicalProfile && p.clinicalProfile.tags) ? p.clinicalProfile.tags : [];
      const tagsHtml = tags.length ? tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join(' ') : '—';
      tr.innerHTML = `
        <td>${escapeHtml(formatName(p))}</td>
        <td>${p.age != null ? escapeHtml(String(p.age)) : '—'}</td>
        <td>${tagsHtml}</td>
        <td>${escapeHtml(formatDate(p.lastSeen))}</td>
        <td><button type="button" class="btn-small" data-id="${p._id}">Карточка</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.btn-small').forEach((btn) => {
      btn.addEventListener('click', () => openPatient(btn.getAttribute('data-id')));
    });
    renderPatientsPager(filtered.length, totalPages);
  }

  function renderPatientsPager(total, totalPages) {
    const pager = $('#patientsPager');
    if (!pager) return;
    if (total <= PATIENTS_PAGE_SIZE) {
      pager.innerHTML = '';
      return;
    }
    pager.innerHTML = `
      <button type="button" class="pager-btn" id="patPrev" ${patientsPage <= 1 ? 'disabled' : ''}>← Назад</button>
      <span class="pager-info">Стр. ${patientsPage} из ${totalPages} · всего ${total}</span>
      <button type="button" class="pager-btn" id="patNext" ${patientsPage >= totalPages ? 'disabled' : ''}>Вперёд →</button>
    `;
    const prev = $('#patPrev');
    const next = $('#patNext');
    if (prev) prev.addEventListener('click', () => { patientsPage--; renderPatientsTable(true); });
    if (next) next.addEventListener('click', () => { patientsPage++; renderPatientsTable(true); });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function openPatient(id) {
    currentPatientId = id;
    const drawer = $('#patientDrawer');
    drawer.setAttribute('aria-hidden', 'false');
    $('#drawerTitle').textContent = 'Загрузка…';

    const p = await api(`/api/doctor/patients/${id}`);
    $('#drawerTitle').textContent = formatName(p);

    const cp = p.clinicalProfile || {};
    $('#clinicalSummary').value = cp.conditionSummary || '';
    $('#clinicalTags').value = (cp.tags || []).join(', ');
    $('#clinicalSaveMsg').textContent = '';

    const [notes, sessions, periods, results, analytics] = await Promise.all([
      api(`/api/doctor/patients/${id}/notes`),
      api(`/api/doctor/patients/${id}/sessions?limit=20`),
      api(`/api/doctor/patients/${id}/periods`),
      api(`/api/doctor/patients/${id}/results?limit=10`),
      api(`/api/doctor/patients/${id}/analytics`)
    ]);

    renderResultsTable(results.items || []);
    renderProgressChart('#drawerProgress', analytics);

    const nl = $('#notesList');
    nl.innerHTML = '';
    notes.forEach((n) => {
      const li = document.createElement('li');
      const author = n.doctor ? formatName(n.doctor) : 'Врач';
      li.innerHTML = `<div class="meta">${escapeHtml(formatDate(n.createdAt))} · ${escapeHtml(author)}</div><div>${escapeHtml(n.body)}</div>`;
      nl.appendChild(li);
    });

    const sl = $('#sessionsList');
    sl.innerHTML = '';
    if (!sessions.length) sl.innerHTML = '<li>Нет записей</li>';
    else {
      sessions.forEach((s) => {
        const li = document.createElement('li');
        const dev = s.device && s.device.name ? s.device.name : 'устройство';
        li.textContent = `${formatDate(s.startedAt)} · ${s.status} · ${dev}`;
        sl.appendChild(li);
      });
    }

    const pl = $('#periodsList');
    pl.innerHTML = '';
    if (!periods.length) pl.innerHTML = '<li>Нет периодов</li>';
    else {
      periods.forEach((per) => {
        const li = document.createElement('li');
        const dn = per.device && per.device.name ? per.device.name : '';
        li.textContent = `${formatDate(per.startDate)} — ${formatDate(per.endDate)} · ${per.status}${dn ? ' · ' + dn : ''}`;
        pl.appendChild(li);
      });
    }

    $('#newNote').value = '';
  }

  const MODE_LABELS = { conveyor: 'Конвейер', tea: 'Чай', drum: 'Барабан' };

  function renderResultsTable(items) {
    const tb = $('#resultsBody');
    if (!tb) return;
    tb.innerHTML = '';
    if (!items.length) {
      tb.innerHTML = '<tr><td colspan="4">Нет данных с очков</td></tr>';
      return;
    }
    items.forEach((r) => {
      const tr = document.createElement('tr');
      const pain = (r.painBefore != null || r.painAfter != null)
        ? `${r.painBefore ?? '—'} → ${r.painAfter ?? '—'}`
        : '—';
      tr.innerHTML = `
        <td>${escapeHtml(formatDate(r.startedAt))}</td>
        <td>${escapeHtml(r.modeLabel || MODE_LABELS[r.exerciseMode] || r.exerciseMode)}</td>
        <td>${escapeHtml(String(r.score ?? '—'))}</td>
        <td>${escapeHtml(pain)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  function renderProgressChart(hostSel, analytics) {
    const host = $(hostSel);
    if (!host || !window.MiniChart) return;
    const tl = (analytics && analytics.timeline) || [];
    if (!tl.length) {
      host.innerHTML = '<div class="minichart-empty">Нет данных для графика</div>';
      return;
    }
    const labels = tl.map((p) => formatShortDate(p.date));
    const score = tl.map((p) => p.score);
    const painAfter = tl.map((p) => (p.painAfter != null ? p.painAfter * 10 : null));
    MiniChart.line(host, {
      yMax: 100,
      labels,
      series: [
        { name: 'Балл (0–100)', color: '#3d9dff', values: score },
        { name: 'Боль после (×10)', color: '#f87171', values: painAfter }
      ]
    });
  }

  function renderModesChart(hostSel, analytics) {
    const host = $(hostSel);
    if (!host || !window.MiniChart) return;
    const bm = (analytics && analytics.byMode) || [];
    MiniChart.bar(host, {
      yMax: 100,
      labels: bm.map((m) => m.label),
      values: bm.map((m) => m.avgScore),
      colors: ['#3d9dff', '#34d399', '#f59e0b']
    });
  }

  function formatShortDate(d) {
    try {
      return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } catch (_) { return ''; }
  }

  // --- Вкладка «Аналитика» ---
  function populateAnalyticsSelect() {
    const sel = $('#analyticsPatient');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— выберите пациента —</option>';
    patientsCache.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p._id;
      opt.textContent = formatName(p);
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  async function loadAnalyticsFor(id) {
    const body = $('#analyticsBody');
    const empty = $('#analyticsEmpty');
    if (!id) {
      body.classList.add('hidden');
      empty.classList.add('hidden');
      return;
    }
    const a = await api(`/api/doctor/patients/${id}/analytics`);
    if (!a.totalSessions) {
      body.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    body.classList.remove('hidden');
    $('#an-total').textContent = a.totalSessions;
    $('#an-score').textContent = a.avgScore;
    $('#an-pain').textContent = a.pain && a.pain.avgDelta != null ? `−${a.pain.avgDelta}` : '—';
    $('#an-adher').textContent = a.adherence ? a.adherence.last7Days : '0';
    renderProgressChart('#chartProgress', a);
    renderModesChart('#chartModes', a);
  }

  function closeDrawer() {
    $('#patientDrawer').setAttribute('aria-hidden', 'true');
    currentPatientId = null;
  }

  async function saveClinical() {
    if (!currentPatientId) return;
    const conditionSummary = $('#clinicalSummary').value;
    const tagsRaw = $('#clinicalTags').value;
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    const msg = $('#clinicalSaveMsg');
    msg.textContent = '';
    try {
      await api(`/api/doctor/patients/${currentPatientId}/clinical`, {
        method: 'PATCH',
        body: JSON.stringify({ conditionSummary, tags })
      });
      msg.textContent = 'Сохранено';
      await loadPatients(true);
    } catch (e) {
      msg.textContent = e.message || 'Ошибка';
      msg.style.color = 'var(--danger, #f87171)';
    }
  }

  async function addNote() {
    if (!currentPatientId) return;
    const body = ($('#newNote').value || '').trim();
    if (!body) return;
    await api(`/api/doctor/patients/${currentPatientId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    $('#newNote').value = '';
    await openPatient(currentPatientId);
  }

  function initTabs() {
    $$('.doctor-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        const name = tab.getAttribute('data-tab');
        $$('.doctor-tab').forEach((t) => t.classList.toggle('active', t === tab));
        $$('.doctor-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
      });
    });
  }

  $('#doctorLogout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    window.location.href = '/auth';
  });

  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#saveClinical').addEventListener('click', saveClinical);
  $('#addNote').addEventListener('click', () => addNote().catch((e) => alert(e.message)));

  $('#patientSearch').addEventListener('input', () => {
    patientsPage = 1;
    renderPatientsTable(false);
  });

  const analyticsSelect = $('#analyticsPatient');
  if (analyticsSelect) {
    analyticsSelect.addEventListener('change', () => {
      loadAnalyticsFor(analyticsSelect.value).catch((e) => console.error(e));
    });
  }

  (async function boot() {
    initTabs();
    const ok = await gate();
    if (!ok) return;
    try {
      await loadOverview();
      await loadPatients();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Ошибка загрузки данных');
    }
  })();
})();
