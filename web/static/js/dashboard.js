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

// Загрузка статистики
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

// Загрузка онлайн пользователей
async function loadOnlineUsers() {
    const tbody = document.getElementById('onlineUsersTable');
    
    try {
        const response = await fetch(`${API_BASE}/users`);
        const users = await response.json();
        
        const onlineUsers = users.filter(u => u.isOnline);
        
        if (onlineUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет онлайн пользователей</td></tr>';
            return;
        }
        
        tbody.innerHTML = onlineUsers.map(user => {
            const fullName = [user.lastName, user.firstName, user.middleName]
                .filter(Boolean).join(' ') || user.username || user.email || 'Неизвестно';
            const lastSeen = user.lastSeen 
                ? new Date(user.lastSeen).toLocaleString('ru-RU')
                : 'Никогда';
            
            return `
                <tr>
                    <td>${fullName}</td>
                    <td>${user.age ? user.age + ' лет' : '-'}</td>
                    <td>${lastSeen}</td>
                    <td><span class="status-badge status-online">Онлайн</span></td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

// Загрузка активных сессий
async function loadActiveSessions() {
    const tbody = document.getElementById('activeSessionsTable');
    
    try {
        const response = await fetch(`${API_BASE}/sessions/active`);
        const sessions = await response.json();
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет активных сессий</td></tr>';
            return;
        }
        
        tbody.innerHTML = sessions.map(session => {
            const hostName = session.host 
                ? [session.host.lastName, session.host.firstName, session.host.middleName]
                    .filter(Boolean).join(' ') || session.host.username || 'Неизвестно'
                : 'Неизвестно';
            const startedAt = session.startedAt 
                ? new Date(session.startedAt).toLocaleString('ru-RU')
                : '-';
            const participants = session.participants?.length || 0;
            
            return `
                <tr>
                    <td>${session.sessionId || session._id}</td>
                    <td>${hostName}</td>
                    <td>${participants}</td>
                    <td>${startedAt}</td>
                    <td><span class="status-badge status-active">Активна</span></td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

// Загрузка устройств
async function loadDevices() {
    const tbody = document.getElementById('devicesTable');
    
    try {
        const response = await fetch(`${API_BASE}/devices`);
        const devices = await response.json();
        
        if (devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет устройств</td></tr>';
            return;
        }
        
        tbody.innerHTML = devices.map(device => {
            const deviceName = device.name || '-';
            const deviceKey = device.key || '-';
            const lastSeen = device.lastSeen 
                ? new Date(device.lastSeen).toLocaleString('ru-RU')
                : '-';
            const statusClass = device.status === 'active' ? 'status-active' : 'status-offline';
            const statusText = device.status === 'active' ? 'Активно' : 
                             device.status === 'maintenance' ? 'Обслуживание' : 'Оффлайн';
            
            return `
                <tr>
                    <td>${deviceName}</td>
                    <td>${deviceKey}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${lastSeen}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Ошибка загрузки</td></tr>';
    }
}

// Обновление всех данных
async function refreshAll() {
    await Promise.all([
        loadStats(),
        loadOnlineUsers(),
        loadActiveSessions(),
        loadDevices()
    ]);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUi();
    refreshAll();
    
    // Автообновление каждые 30 секунд
    setInterval(refreshAll, 30000);
});


