const API_BASE = '/api';

// Статус авторизации пользователя
async function updateAuthUi() {
    const badge = document.getElementById('authUserBadge');
    const actionBtn = document.getElementById('authActionBtn');
    const toggle = document.getElementById('userMenuToggle');
    const dropdown = document.getElementById('userMenuDropdown');
    if (!badge || !actionBtn) return;

    try {
        const res = await fetch(`${API_BASE}/auth/status`, { credentials: 'same-origin' });
        const data = await res.json();
        if (data.authenticated) {
            const name = data.user?.username || data.user?.email || 'Пользователь';
            badge.textContent = `Вы вошли как: ${name}`;
            actionBtn.textContent = 'Выйти';
            actionBtn.href = '#';
            actionBtn.onclick = async (e) => {
                e.preventDefault();
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    credentials: 'same-origin'
                });
                window.location.reload();
            };
        } else {
            badge.textContent = 'Гость';
            actionBtn.textContent = 'Вход';
            actionBtn.href = '/auth';
            actionBtn.onclick = null;
        }

        if (toggle && dropdown) {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                dropdown.classList.toggle('open');
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.user-menu')) {
                    dropdown.classList.remove('open');
                }
            });
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function formatDate(d) {
    return d ? new Date(d).toLocaleString('ru-RU') : '—';
}

// Состояние пагинации таблиц
const state = {
    users: { page: 1 },
    sessions: { page: 1 },
    devices: { page: 1 }
};
const PAGE_SIZE = 10;

// Загрузка статистики (карточки)
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('onlineUsers').textContent = stats.onlineUsers || 0;
        document.getElementById('totalDevices').textContent = stats.totalDevices || 0;
        document.getElementById('activeDevices').textContent = stats.activeDevices || 0;
        document.getElementById('activeSessions').textContent = stats.activeSessions || 0;
        document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Графики сводки
async function loadCharts() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/summary`, { credentials: 'same-origin' });
        if (!response.ok) return;
        const s = await response.json();
        if (window.MiniChart) {
            MiniChart.line(document.getElementById('chartActivity'), {
                labels: s.labels,
                series: [
                    { name: 'Сессии', color: '#3498db', values: s.sessionsSeries },
                    { name: 'Упражнения', color: '#10b981', values: s.resultsSeries }
                ]
            });
            MiniChart.bar(document.getElementById('chartModes'), {
                labels: (s.byMode || []).map((m) => m.label),
                values: (s.byMode || []).map((m) => m.count),
                colors: ['#3498db', '#10b981', '#f59e0b']
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки графиков:', error);
    }
}

function renderPager(pagerId, data, onGo) {
    const pager = document.getElementById(pagerId);
    if (!pager) return;
    if (!data || data.total <= data.limit) { pager.innerHTML = ''; return; }
    pager.innerHTML = `
        <button type="button" class="pager-btn" ${data.page <= 1 ? 'disabled' : ''} data-go="prev">← Назад</button>
        <span class="pager-info">Стр. ${data.page} из ${data.pages} · всего ${data.total}</span>
        <button type="button" class="pager-btn" ${data.page >= data.pages ? 'disabled' : ''} data-go="next">Вперёд →</button>
    `;
    const prev = pager.querySelector('[data-go="prev"]');
    const next = pager.querySelector('[data-go="next"]');
    if (prev) prev.addEventListener('click', () => onGo(data.page - 1));
    if (next) next.addEventListener('click', () => onGo(data.page + 1));
}

// Пользователи
async function loadUsers() {
    const tbody = document.getElementById('usersTable');
    const search = document.getElementById('usersSearch').value.trim();
    const status = document.getElementById('usersStatus').value;
    const role = document.getElementById('usersRole').value;
    const params = new URLSearchParams({ page: state.users.page, limit: PAGE_SIZE });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (role) params.set('role', role);
    try {
        const res = await fetch(`${API_BASE}/users?${params}`);
        const data = await res.json();
        if (!data.items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Ничего не найдено</td></tr>';
        } else {
            tbody.innerHTML = data.items.map((user) => {
                const fullName = [user.lastName, user.firstName, user.middleName]
                    .filter(Boolean).join(' ') || user.username || user.email || 'Неизвестно';
                const status = user.isOnline
                    ? '<span class="status-badge status-online">Онлайн</span>'
                    : '<span class="status-badge status-offline">Оффлайн</span>';
                return `
                    <tr>
                        <td>${escapeHtml(fullName)}</td>
                        <td>${user.age ? escapeHtml(user.age + ' лет') : '—'}</td>
                        <td>${escapeHtml(formatDate(user.lastSeen))}</td>
                        <td>${status}</td>
                    </tr>`;
            }).join('');
        }
        renderPager('usersPager', data, (p) => { state.users.page = p; loadUsers(); });
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

// Сессии
async function loadSessions() {
    const tbody = document.getElementById('sessionsTable');
    const status = document.getElementById('sessionsStatus').value;
    const params = new URLSearchParams({ page: state.sessions.page, limit: PAGE_SIZE });
    if (status) params.set('status', status);
    try {
        const res = await fetch(`${API_BASE}/sessions?${params}`);
        const data = await res.json();
        if (!data.items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет сессий</td></tr>';
        } else {
            const statusMap = {
                active: ['status-active', 'Активна'], waiting: ['status-waiting', 'Ожидание'],
                paused: ['status-waiting', 'Пауза'], ended: ['status-offline', 'Завершена']
            };
            tbody.innerHTML = data.items.map((session) => {
                const hostName = session.host
                    ? [session.host.lastName, session.host.firstName, session.host.middleName]
                        .filter(Boolean).join(' ') || session.host.username || 'Неизвестно'
                    : 'Неизвестно';
                const participants = (session.participants && session.participants.length) || 0;
                const sm = statusMap[session.status] || ['status-offline', session.status];
                return `
                    <tr>
                        <td>${escapeHtml(session.sessionId || session._id)}</td>
                        <td>${escapeHtml(hostName)}</td>
                        <td>${participants}</td>
                        <td>${escapeHtml(formatDate(session.startedAt))}</td>
                        <td><span class="status-badge ${sm[0]}">${escapeHtml(sm[1])}</span></td>
                    </tr>`;
            }).join('');
        }
        renderPager('sessionsPager', data, (p) => { state.sessions.page = p; loadSessions(); });
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

// Устройства
async function loadDevices() {
    const tbody = document.getElementById('devicesTable');
    const search = document.getElementById('devicesSearch').value.trim();
    const status = document.getElementById('devicesStatus').value;
    const params = new URLSearchParams({ page: state.devices.page, limit: PAGE_SIZE });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    try {
        const res = await fetch(`${API_BASE}/devices?${params}`);
        const data = await res.json();
        if (!data.items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет устройств</td></tr>';
        } else {
            tbody.innerHTML = data.items.map((device) => {
                const statusClass = device.status === 'active' ? 'status-active'
                    : device.status === 'maintenance' ? 'status-waiting' : 'status-offline';
                const statusText = device.status === 'active' ? 'Активно'
                    : device.status === 'maintenance' ? 'Обслуживание' : 'Оффлайн';
                return `
                    <tr>
                        <td>${escapeHtml(device.name || device.deviceId || '—')}</td>
                        <td>${escapeHtml(device.key || '—')}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>${escapeHtml(formatDate(device.lastSeen))}</td>
                    </tr>`;
            }).join('');
        }
        renderPager('devicesPager', data, (p) => { state.devices.page = p; loadDevices(); });
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

function debounce(fn, ms) {
    let t;
    return function () {
        clearTimeout(t);
        t = setTimeout(fn, ms);
    };
}

async function refreshAll() {
    await Promise.all([loadStats(), loadCharts(), loadUsers(), loadSessions(), loadDevices()]);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUi();

    const usersReload = () => { state.users.page = 1; loadUsers(); };
    document.getElementById('usersSearch').addEventListener('input', debounce(usersReload, 300));
    document.getElementById('usersStatus').addEventListener('change', usersReload);
    document.getElementById('usersRole').addEventListener('change', usersReload);

    document.getElementById('sessionsStatus').addEventListener('change', () => { state.sessions.page = 1; loadSessions(); });

    const devicesReload = () => { state.devices.page = 1; loadDevices(); };
    document.getElementById('devicesSearch').addEventListener('input', debounce(devicesReload, 300));
    document.getElementById('devicesStatus').addEventListener('change', devicesReload);

    refreshAll();

    // Автообновление статистики и графиков каждые 30 секунд
    setInterval(() => { loadStats(); loadCharts(); }, 30000);
});


