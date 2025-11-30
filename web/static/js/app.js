
class VRDashboard {
    constructor() {
        this.ws = null;
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.loadData();
        
        // Обновляем данные каждые 30 секунд
        setInterval(() => {
            this.loadData();
        }, 30000);
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('🔌 WebSocket подключен');
            this.showNotification('Подключено к серверу', 'success');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'stats_update') {
                this.updateStats(data.data);
            }
        };
        
        this.ws.onclose = () => {
            console.log('🔌 WebSocket отключен, переподключение через 5 секунд...');
            this.showNotification('Соединение потеряно, переподключение...', 'warning');
            setTimeout(() => {
                this.connectWebSocket();
            }, 5000);
        };
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadUsers(),
                this.loadDevices(), 
                this.loadSessions()
            ]);
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
    }

    async loadStats() {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        this.updateStats(stats);
    }

    updateStats(stats) {
        this.animateNumber('totalUsers', stats.totalUsers || 0);
        this.animateNumber('onlineUsers', stats.onlineUsers || 0);
        this.animateNumber('totalDevices', stats.totalDevices || 0); 
        this.animateNumber('activeDevices', stats.activeDevices || 0); 
    }

    animateNumber(elementId, targetValue) {
        const element = document.getElementById(elementId);
        const currentValue = parseInt(element.textContent) || 0;
        
        if (currentValue === targetValue) return;
        
        const increment = (targetValue - currentValue) / 20;
        let current = currentValue;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= targetValue) || (increment < 0 && current <= targetValue)) {
                current = targetValue;
                clearInterval(timer);
            }
            element.textContent = Math.floor(current);
        }, 50);
    }

    async loadUsers() {
        const response = await fetch('/api/users');
        const users = await response.json();
        this.renderUsers(users);
    }

    renderUsers(users) {
        const tbody = document.getElementById('usersTableBody');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#718096;">Нет пользователей</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(u => {
            const tdHtmlUsername = `
                <span class="copyable" data-copy="${u.username || ''}" title="Нажмите, чтобы скопировать">
                    <strong>${u.username || ''}</strong>
                </span>
            `;
            const tdHtmlEmail = `
                <span class="copyable" data-copy="${u.email || ''}" title="Нажмите, чтобы скопировать">
                    ${u.email || ''}
                </span>
            `;
            return `
                <tr>
                    <td>${tdHtmlUsername}</td>
                    <td>${tdHtmlEmail}</td>
                    <td>
                        <span class="status-badge ${u.isOnline ? 'status-online' : 'status-offline'}">
                            ${u.isOnline ? 'Онлайн' : 'Оффлайн'}
                        </span>
                    </td>
                    <td>${new Date(u.lastSeen).toLocaleString('ru-RU')}</td>
                </tr>
            `;
        }).join('');
    }

    async loadDevices() {
        const response = await fetch('/api/devices');
        const devices = await response.json();
        this.renderDevices(devices);
    }

    renderDevices(devices) {
        const tbody = document.getElementById('devicesTableBody');
        if (!Array.isArray(devices) || devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">Нет устройств</td></tr>';
            return;
        }
        tbody.innerHTML = devices.map(device => `
            <tr>
                <td>
                    <span class="copyable" data-copy="${device.name || ''}" title="Нажмите, чтобы скопировать">
                        <strong>${device.name || '—'}</strong>
                    </span>
                </td>
                <td>
                    <span class="copyable" data-copy="${device.deviceId || ''}" title="Нажмите, чтобы скопировать">
                        <code>${device.deviceId || '—'}</code>
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${device.status}">
                        ${this.getDeviceStatusText(device.status)}
                    </span>
                </td>
                <td>${device.lastSeen ? new Date(device.lastSeen).toLocaleString('ru-RU') : '—'}</td>
            </tr>
        `).join('');
    }

    async loadSessions() {
        const response = await fetch('/api/sessions');
        const sessions = await response.json();
        this.renderSessions(sessions);
    }

    renderSessions(sessions) {
        const tbody = document.getElementById('sessionsTableBody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #718096;">Нет сессий</td></tr>';
            return;
        }
        
        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td><strong>${session.scene ? session.scene.name : 'Неизвестно'}</strong></td>
                <td>${session.host ? session.host.username : 'Неизвестно'}</td>
                <td><strong>${session.participants ? session.participants.length : 0}</strong></td>
                <td>
                    <span class="status-badge status-${session.status}">
                        ${this.getStatusText(session.status)}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    getStatusText(status) {
        const statusMap = {
            'waiting': 'Ожидание',
            'active': 'Активна',
            'paused': 'Приостановлена',
            'ended': 'Завершена'
        };
        return statusMap[status] || status;
    }

    getDeviceStatusText(status) {
        const statusMap = {
            'active': 'Активно',
            'maintenance': 'Обслуживание',
            'offline': 'Оффлайн'
        };
        return statusMap[status] || status;
    }

    showNotification(message, type = 'info') {
        // Создаем уведомление (опционально)
        console.log(`📢 ${type.toUpperCase()}: ${message}`);
    }
}

class AdminPanel {
    constructor() {
        this.ws = null;
        this.refreshTimer = null;
        this.bindUI();
    }

    bindUI() {
        const tabDashboard = document.getElementById('tabDashboard');
        const tabAdmin = document.getElementById('tabAdmin');
        const adminSection = document.getElementById('adminSection');

        tabDashboard?.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.stats-grid').style.display = '';
            document.querySelector('.content-grid').style.display = '';
            adminSection.style.display = 'none';
            // остановим авто-обновление
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        });

        tabAdmin?.addEventListener('click', async (e) => {
            e.preventDefault();
            document.querySelector('.stats-grid').style.display = 'none';
            document.querySelector('.content-grid').style.display = 'none';
            adminSection.style.display = '';

            // мгновенно подтягиваем список
            await this.load(true);

            // авто-обновление каждые 10с, пока открыт раздел
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            this.refreshTimer = setInterval(() => {
                if (adminSection.style.display !== 'none') this.load(true);
            }, 10000);
        });

        document.getElementById('btnIssue')?.addEventListener('click', () => this.issue());
        document.getElementById('btnRevoke')?.addEventListener('click', () => this.revoke());
        document.getElementById('btnLoadLicenses')?.addEventListener('click', () => this.load(true));
        document.getElementById('btnPurgeKey')?.addEventListener('click', () => this.purgeKey());
        document.getElementById('btnPurgeUser')?.addEventListener('click', () => this.purgeUser());
    }

    async issue() {
        const email = document.getElementById('adminEmail').value.trim();
        const userId = document.getElementById('adminUserId').value.trim();
        const expiresAt = document.getElementById('adminExpiresAt').value;
        const maxDevices = parseInt(document.getElementById('adminMaxDevices').value || '1', 10);
        const notes = document.getElementById('adminNotes').value.trim();

        if (!email && !userId) { alert('Укажите email или userId'); return; }

        const body = { maxDevices, notes, createdBy: 'admin' };
        if (email) body.email = email;
        if (userId) body.userId = userId;
        if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

        const res = await fetch('/api/licenses/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
            cache: 'no-store',
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(()=> ({}));

        if (!res.ok) { alert('Ошибка: ' + (data.error || res.status)); return; }

        alert('Лицензия выдана: ' + data.key);

        // если email не был введён, подставим из ответа для фильтра
        if (!email && data.user && data.user.email) {
            const emailInput = document.getElementById('adminEmail');
            emailInput.value = data.user.email;
        }

        await this.load(true); // гарантированно обновим список
    }

    async revoke() {
        const key = document.getElementById('adminLicenseKey').value.trim();
        const reason = document.getElementById('adminRevokeReason').value.trim();
        if (!key) { alert('Укажите ключ'); return; }

        const res = await fetch('/api/licenses/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
            cache: 'no-store',
            body: JSON.stringify({ key, reason })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) { alert('Ошибка: ' + (data.error || res.status)); return; }

        alert('Отозвано: ' + data.key);
        await this.load(true);
    }

    async load(force = false) {
        const email = document.getElementById('adminEmail').value.trim();
        const userId = document.getElementById('adminUserId').value.trim();
        const qs = new URLSearchParams();
        if (email) qs.set('email', email);
        if (userId) qs.set('userId', userId);

        const res = await fetch('/api/licenses?' + qs.toString(), {
            headers: { 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        });
        const list = await res.json();
        this.render(list);
        return list;
    }

    render(list) {
        const tbody = document.getElementById('licensesTableBody');
        if (!Array.isArray(list) || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Нет данных</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(lic => `
            <tr>
                <td>
                    <span class="copyable" data-copy="${lic.key}" title="Нажмите, чтобы скопировать">
                        <code>${lic.key}</code>
                    </span>
                </td>
                <td>
                    ${lic.user?.username ? `
                        <span class="copyable" data-copy="${lic.user.username}" title="Нажмите, чтобы скопировать">
                            ${lic.user.username}
                        </span>` : '—'}
                    <br>
                    ${lic.user?.email ? `
                        <span class="copyable" data-copy="${lic.user.email}" title="Нажмите, чтобы скопировать">
                            ${lic.user.email}
                        </span>` : '—'}
                </td>
                <td>
                    <span class="status-badge ${lic.status === 'active' ? 'status-online' : 'status-offline'}">
                        ${this.statusText(lic)}
                    </span>
                </td>
                <td>${lic.expiresAt ? new Date(lic.expiresAt).toLocaleString('ru-RU') : '—'}</td>
                <td>${(lic.devices||[]).length}/${lic.maxDevices||1}</td>
                <td><button class="btn-danger" onclick="adminQuickRevoke('${lic.key}')">Отозвать</button></td>
            </tr>
        `).join('');
    }

    statusText(lic) {
        if (lic.status === 'revoked') return 'Отозвана';
        if (lic.status === 'expired') return 'Истекла';
        return 'Активна';
    }

    async purgeKey() {
        const key = document.getElementById('adminLicenseKey').value.trim();
        const pass = document.getElementById('adminPurgePassword').value.trim();
        if (!key) return alert('Укажите ключ');
        if (!pass) return alert('Введите пароль');

        if (!confirm(`Полностью удалить ключ ${key}? Действие необратимо.`)) return;

        const res = await fetch('/api/licenses/purge/key/' + encodeURIComponent(key), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ admin_password: pass })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) return alert('Ошибка: ' + (data.error || res.status));
        alert('Удалено. Ключ: ' + key);
        await this.load(true);
    }

    async purgeUser() {
        const email = document.getElementById('adminEmail').value.trim();
        const userId = document.getElementById('adminUserId').value.trim();
        const pass = document.getElementById('adminPurgePassword').value.trim();
        if (!email && !userId) return alert('Укажите email или userId');
        if (!pass) return alert('Введите пароль');

        if (!confirm('Полностью удалить все лицензии этого пользователя?')) return;

        const res = await fetch('/api/licenses/purge/user', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ admin_password: pass, email, userId })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) return alert('Ошибка: ' + (data.error || res.status));
        alert(`Удалено лицензий: ${data.deleted || 0}`);
        await this.load(true);
    }
}

window.adminPanel = null;
window.adminQuickRevoke = async (key) => {
    if (!confirm('Отозвать ключ ' + key + '?')) return;
    const res = await fetch('/api/licenses/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, reason: 'admin_quick' })
    });
    if (!res.ok) { alert('Ошибка'); return; }
    window.adminPanel.load();
};

function copyToClipboard(text) {
    const fallback = (t) => {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } finally { ta.remove(); }
    };
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).catch(() => fallback(text));
    } else {
        fallback(text);
        return Promise.resolve();
    }
}

function showCopiedBadge(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'copied-badge';
    badge.textContent = 'Скопировано';
    // позиция возле элемента
    badge.style.left = (rect.left + rect.width/2 + window.scrollX) + 'px';
    badge.style.top  = (rect.top  + window.scrollY) + 'px';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 900);
}

// Делегирование: любой элемент с data-copy и классом copyable
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-copy].copyable');
    if (!el) return;
    const val = el.getAttribute('data-copy') || el.textContent || '';
    copyToClipboard(val.trim()).then(() => showCopiedBadge(el));
});

// Запускаем дашборд при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new VRDashboard();
    window.adminPanel = new AdminPanel();
});