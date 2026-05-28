const API_BASE = '/api';

// Статус авторизации пользователя в хедере
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
                window.location.href = '/';
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

// --- Авторизация админки --- //
document.addEventListener('DOMContentLoaded', async function() {
    updateAuthUi();
    const modal = document.getElementById('adminLoginModal');
    const loginInput = document.getElementById('adminLoginInput');
    const input = document.getElementById('adminPasswordInput');
    const btn = document.getElementById('adminLoginBtn');
    const err = document.getElementById('adminLoginError');
    const pageContent = document.querySelector('.container');

    // ПРОВЕРКА — если уже авторизован, модалка не появляется
    let isAdmin = false;
    try {
        const resp = await fetch('/api/admin/status', { credentials: 'same-origin' });
        const stat = await resp.json();
        if (stat.isAdmin) {
            modal.style.display = 'none';
            pageContent.style.filter = '';
            isAdmin = true;
        }
    } catch(e){}
    if (isAdmin) return;
    modal.style.display = 'flex';
    pageContent.style.filter = 'blur(6px)';

    btn.onclick = async function() {
        err.textContent = '';
        const login = loginInput.value.trim();
        const password = input.value;
        if (!login || !password) {
            err.textContent = 'Введите логин и пароль';
            return;
        }
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ login, password })
        });
        if (res.ok) {
            modal.style.display = 'none';
            pageContent.style.filter = '';
            window.location.reload();
        } else {
            err.textContent = 'Неверные данные или нет доступа!';
            input.value = '';
        }
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') btn.click();
    });
});
// --- конец авторизации --- //

// Проверка подключения к серверу
async function checkServerConnection() {
    try {
        console.log('🔍 Проверка подключения к серверу...');
        console.log('🌐 URL:', `${API_BASE}/health`);
        
        const response = await fetch(`${API_BASE}/health`);
        console.log('📥 Статус:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Сервер доступен:', data);
            return true;
        } else {
            const text = await response.text();
            console.error('❌ Сервер вернул ошибку:', response.status, text);
            return false;
        }
    } catch (error) {
        console.error('❌ Ошибка подключения к серверу:', error);
        console.error('   Тип:', error.name);
        console.error('   Сообщение:', error.message);
        return false;
    }
}

// Загрузка устройств и пользователей
async function loadDevices() {
    try {
        const response = await fetch(`${API_BASE}/devices`);
        const devices = await response.json();
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '<option value="">Выберите устройство...</option>';
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device._id;
            option.textContent = `${device.name} (${device.deviceId || device.key || 'N/A'})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
    }
}

// Глобальная переменная для хранения всех пользователей
let allUsers = [];

// Загрузка пользователей с сохранением в глобальную переменную
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        allUsers = await response.json();
        
        // Обновляем dropdown
        updateUserDropdown('');
        
        console.log(`✅ Загружено ${allUsers.length} пользователей`);
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// Обновление dropdown списка пользователей с фильтрацией
function updateUserDropdown(searchText = '') {
    const dropdownList = document.getElementById('userDropdownList');
    const dropdown = document.getElementById('userDropdown');
    const searchInput = document.getElementById('userSearchInput');
    const hiddenInput = document.getElementById('userSelect');
    
    // Фильтрация пользователей
    const filteredUsers = allUsers.filter(user => {
        if (!searchText) return true;
        
        const searchLower = searchText.toLowerCase();
        const lastName = (user.lastName || '').toLowerCase();
        const firstName = (user.firstName || '').toLowerCase();
        const middleName = (user.middleName || '').toLowerCase();
        const fullName = `${lastName} ${firstName} ${middleName}`.trim();
        
        return lastName.startsWith(searchLower) || 
               firstName.startsWith(searchLower) || 
               middleName.startsWith(searchLower) ||
               fullName.includes(searchLower);
    });
    
    // Очистка списка
    dropdownList.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        dropdownList.innerHTML = '<div class="search-dropdown-item empty">Пользователи не найдены</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    // Добавление отфильтрованных пользователей
    filteredUsers.forEach(user => {
        const fullName = [user.lastName, user.firstName, user.middleName]
            .filter(Boolean)
            .join(' ') || user.username || user.email;
        const ageText = user.age ? ` (${user.age} лет)` : '';
        const displayText = `${fullName}${ageText}`;
        
        const item = document.createElement('div');
        item.className = 'search-dropdown-item';
        item.textContent = displayText;
        item.dataset.userId = user._id;
        item.dataset.fullName = fullName;
        
        // Выделение совпадающего текста
        if (searchText) {
            const regex = new RegExp(`(${searchText})`, 'gi');
            item.innerHTML = displayText.replace(regex, '<strong>$1</strong>');
        }
        
        // Обработчик клика
        item.addEventListener('click', () => {
            hiddenInput.value = user._id;
            searchInput.value = fullName;
            dropdown.style.display = 'none';
            
            // Визуальная обратная связь
            searchInput.style.borderColor = '#3498db';
            setTimeout(() => {
                searchInput.style.borderColor = '#34495e';
            }, 1000);
        });
        
        dropdownList.appendChild(item);
    });
    
    // Показать dropdown если есть текст поиска
    if (searchText || filteredUsers.length > 0) {
        dropdown.style.display = 'block';
    }
}

// Инициализация поиска пользователей
function initUserSearch() {
    const searchInput = document.getElementById('userSearchInput');
    const dropdown = document.getElementById('userDropdown');
    const hiddenInput = document.getElementById('userSelect');
    
    // Обработчик ввода текста
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.trim();
        updateUserDropdown(searchText);
        
        // Очистить скрытое поле если текст удален
        if (!searchText) {
            hiddenInput.value = '';
        }
    });
    
    // Обработчик фокуса
    searchInput.addEventListener('focus', () => {
        const searchText = searchInput.value.trim();
        if (searchText || allUsers.length > 0) {
            updateUserDropdown(searchText);
        }
    });
    
    // Скрыть dropdown при клике вне элемента
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.searchable-select')) {
            dropdown.style.display = 'none';
        }
    });
    
    // Обработка клавиатуры
    searchInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-dropdown-item:not(.empty)');
        const selected = dropdown.querySelector('.search-dropdown-item.selected');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                const next = selected.nextElementSibling;
                if (next && !next.classList.contains('empty')) {
                    next.classList.add('selected');
                    next.scrollIntoView({ block: 'nearest' });
                }
            } else if (items.length > 0) {
                items[0].classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                const prev = selected.previousElementSibling;
                if (prev && !prev.classList.contains('empty')) {
                    prev.classList.add('selected');
                    prev.scrollIntoView({ block: 'nearest' });
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selected && !selected.classList.contains('empty')) {
                selected.click();
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            searchInput.blur();
        }
    });
}

// Переключение видимости полей периода
document.getElementById('isSessionCheck').addEventListener('change', function() {
    const periodDates = document.getElementById('periodDates');
    periodDates.style.display = this.checked ? 'none' : 'grid';
    if (!this.checked) {
        document.getElementById('startDate').required = true;
        document.getElementById('endDate').required = true;
    } else {
        document.getElementById('startDate').required = false;
        document.getElementById('endDate').required = false;
    }
});

// Создание пользователя
document.getElementById('createUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const lastName = document.getElementById('lastName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    
    // Проверка обязательных полей на клиенте
    if (!lastName || !firstName) {
        alert('Фамилия и имя обязательны для заполнения');
        return;
    }
    
    const formData = {
        lastName: lastName,
        firstName: firstName,
        middleName: document.getElementById('middleName').value.trim(),
        age: document.getElementById('age').value ? parseInt(document.getElementById('age').value) : null
    };
    
    console.log('📤 Отправка данных:', formData);
    console.log('🌐 URL:', `${API_BASE}/users`);
    
    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        console.log('📥 Статус ответа:', response.status, response.statusText);
        console.log('📥 Заголовки:', Object.fromEntries(response.headers.entries()));
        
        // Проверяем тип контента
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
            console.log('📥 JSON ответ:', data);
        } else {
            const text = await response.text();
            console.error('❌ Ответ не JSON:', text);
            throw new Error(`Сервер вернул не JSON. Статус: ${response.status}. Ответ: ${text.substring(0, 200)}`);
        }
        
        if (response.ok) {
            alert('✅ Пользователь успешно создан!');
            document.getElementById('createUserForm').reset();
            loadUsers();
        } else {
            // Показываем более детальную ошибку
            const errorMsg = data.details 
                ? `${data.error}: ${data.details}`
                : data.error || `Ошибка ${response.status}: ${response.statusText}`;
            alert('❌ Ошибка: ' + errorMsg);
            console.error('❌ Ошибка создания пользователя:', data);
        }
    } catch (error) {
        console.error('❌ Ошибка при запросе:', error);
        console.error('❌ Тип ошибки:', error.name);
        console.error('❌ Сообщение:', error.message);
        console.error('❌ Stack:', error.stack);
        
        // Более детальные сообщения об ошибках
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            alert('❌ Ошибка подключения к серверу!\n\nПроверьте:\n1. Сервер запущен\n2. Правильный адрес: ' + window.location.origin + API_BASE + '/users\n3. Нет проблем с сетью\n\nОткройте консоль (F12) для деталей.');
        } else if (error.name === 'SyntaxError') {
            alert('❌ Ошибка: Сервер вернул некорректный ответ.\n\nПроверьте консоль (F12) для деталей.');
        } else {
            alert('❌ Ошибка: ' + error.message + '\n\nПроверьте консоль (F12) для деталей.');
        }
    }
});

// Выдача лицензии
document.getElementById('issueLicenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const deviceId = document.getElementById('deviceSelect').value;
    const userId = document.getElementById('userSelect').value; // Теперь это hidden input
    const isSession = document.getElementById('isSessionCheck').checked;
    
    if (!deviceId || !userId) {
        alert('Выберите устройство и пациента');
        return;
    }
    
    const formData = {
        deviceId,
        userId,
        isSession
    };
    
    if (!isSession) {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        if (!startDate || !endDate) {
            alert('Укажите период для периодического доступа');
            return;
        }
        
        formData.startDate = startDate;
        formData.endDate = endDate;
    }
    
    try {
        const response = await fetch(`${API_BASE}/licenses/issue-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('Лицензия успешно выдана!');
            document.getElementById('issueLicenseForm').reset();
            document.getElementById('userSearchInput').value = '';
            document.getElementById('userSelect').value = '';
            document.getElementById('periodDates').style.display = 'none';
            loadLicenses();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка выдачи лицензии:', error);
        alert('Ошибка выдачи лицензии');
    }
});

// --- Пагинация и поиск (клиентские, данные админки невелики) ---
const ADMIN_PAGE_SIZE = 10;
let licensesCache = [];
let usersCache = [];
let doctorsList = [];
let licensesPage = 1;
let usersPage = 1;

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function renderPager(pagerId, total, page, onGo) {
    const pager = document.getElementById(pagerId);
    if (!pager) return;
    const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    if (total <= ADMIN_PAGE_SIZE) { pager.innerHTML = ''; return; }
    pager.innerHTML = `
        <button type="button" class="pager-btn" ${page <= 1 ? 'disabled' : ''} data-go="prev">← Назад</button>
        <span class="pager-info">Стр. ${page} из ${pages} · всего ${total}</span>
        <button type="button" class="pager-btn" ${page >= pages ? 'disabled' : ''} data-go="next">Вперёд →</button>
    `;
    const prev = pager.querySelector('[data-go="prev"]');
    const next = pager.querySelector('[data-go="next"]');
    if (prev) prev.addEventListener('click', () => onGo(page - 1));
    if (next) next.addEventListener('click', () => onGo(page + 1));
}

// Загрузка лицензий
async function loadLicenses() {
    const tbody = document.getElementById('licensesTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Загрузка...</td></tr>';
    
    try {
        const response = await fetch(`${API_BASE}/licenses/admin/all`);
        licensesCache = await response.json();
        renderLicenses();
    } catch (error) {
        console.error('Ошибка загрузки лицензий:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Ошибка загрузки лицензий</td></tr>';
    }
}

function renderLicenses() {
    const tbody = document.getElementById('licensesTableBody');
    const q = (document.getElementById('licensesSearch')?.value || '').toLowerCase().trim();
    const filtered = licensesCache.filter((l) => {
        if (!q) return true;
        const hay = [l.code, l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Нет лицензий</td></tr>';
        renderPager('licensesPager', 0, 1, () => {});
        return;
    }

    const pages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
    if (licensesPage > pages) licensesPage = pages;
    const start = (licensesPage - 1) * ADMIN_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + ADMIN_PAGE_SIZE);

    tbody.innerHTML = pageItems.map((license) => {
        const startDate = license.startDate ? new Date(license.startDate).toLocaleDateString('ru-RU') : '-';
        const endDate = license.endDate ? new Date(license.endDate).toLocaleDateString('ru-RU') : '-';
        return `
            <tr>
                <td>${escapeHtml(license.code)}</td>
                <td>${escapeHtml(license.lastName || '-')}</td>
                <td>${escapeHtml(license.firstName || '-')}</td>
                <td>${escapeHtml(license.middleName || '-')}</td>
                <td>${escapeHtml(license.type)}</td>
                <td>${startDate}</td>
                <td>${endDate}</td>
                <td>
                    <button class="delete-btn" onclick="deleteLicense('${license._type}', '${license._id}')" title="Удалить">🗑️</button>
                </td>
            </tr>`;
    }).join('');
    renderPager('licensesPager', filtered.length, licensesPage, (p) => { licensesPage = p; renderLicenses(); });
}

// Удаление лицензии
async function deleteLicense(type, id) {
    if (!confirm('Вы уверены, что хотите удалить эту лицензию?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/licenses/admin/${type}/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Лицензия удалена');
            loadLicenses();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка удаления лицензии:', error);
        alert('Ошибка удаления лицензии');
    }
}

// Загрузка списка врачей (для выбора лечащего врача)
async function loadDoctors() {
    try {
        const response = await fetch(`${API_BASE}/users?role=doctor`);
        doctorsList = await response.json();
    } catch (error) {
        console.error('Ошибка загрузки врачей:', error);
        doctorsList = [];
    }
}

function fullNameOf(u) {
    return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ') || u.username || u.email || '—';
}

// Загрузка пользователей в таблицу
async function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="10" class="loading">Загрузка...</td></tr>';
    try {
        const [usersRes] = await Promise.all([fetch(`${API_BASE}/admin/users`, { credentials: 'same-origin' }), loadDoctors()]);
        usersCache = await usersRes.json();
        renderUsersTable();
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Ошибка загрузки пользователей</td></tr>';
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    const q = (document.getElementById('usersSearch')?.value || '').toLowerCase().trim();
    const filtered = usersCache.filter((u) => !q || fullNameOf(u).toLowerCase().includes(q));

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Нет пользователей</td></tr>';
        renderPager('usersPager', 0, 1, () => {});
        return;
    }

    const pages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
    if (usersPage > pages) usersPage = pages;
    const start = (usersPage - 1) * ADMIN_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + ADMIN_PAGE_SIZE);

    const doctorOptions = (selectedId) => {
        const opts = ['<option value="">— не назначен —</option>'];
        doctorsList.forEach((d) => {
            const sel = String(selectedId) === String(d._id) ? ' selected' : '';
            opts.push(`<option value="${d._id}"${sel}>${escapeHtml(fullNameOf(d))}</option>`);
        });
        return opts.join('');
    };

    tbody.innerHTML = pageItems.map((user) => {
        const status = user.isOnline
            ? '<span class="status-badge status-online">Онлайн</span>'
            : '<span class="status-badge status-offline">Оффлайн</span>';
        const assigned = user.assignedDoctor || '';
        const noPassword = !user.hasPassword
            ? '<span class="no-password-hint" title="У пользователя нет пароля — он не сможет войти, пока пароль не задан">нет пароля</span>'
            : '';
        return `
            <tr>
                <td>${escapeHtml(user.lastName || '-')}</td>
                <td>${escapeHtml(user.firstName || '-')}</td>
                <td>${escapeHtml(user.middleName || '-')}</td>
                <td>${user.age ? escapeHtml(user.age + ' лет') : '-'}</td>
                <td>${status}</td>
                <td style="text-align:center;">
                    <input type="checkbox" class="role-toggle" data-role="isPatient" data-id="${user._id}" ${user.isPatient ? 'checked' : ''}>
                </td>
                <td style="text-align:center;">
                    <input type="checkbox" class="role-toggle" data-role="isDoctor" data-id="${user._id}" ${user.isDoctor ? 'checked' : ''}>
                </td>
                <td style="text-align:center;">
                    <input type="checkbox" class="role-toggle" data-role="isAdmin" data-id="${user._id}" ${user.isAdmin ? 'checked' : ''}>
                </td>
                <td>
                    <select class="form-control doctor-select" data-id="${user._id}">${doctorOptions(assigned)}</select>
                </td>
                <td class="user-actions">
                    <button class="btn-link reset-password-btn" data-id="${user._id}" title="Задать или сбросить пароль">🔑 Пароль</button>
                    ${noPassword}
                    <button class="delete-btn" onclick="deleteUser('${user._id}')" title="Удалить">🗑️</button>
                </td>
            </tr>`;
    }).join('');

    tbody.querySelectorAll('.role-toggle').forEach((cb) => {
        cb.addEventListener('change', () => updateUserRole(cb));
    });
    tbody.querySelectorAll('.doctor-select').forEach((sel) => {
        sel.addEventListener('change', () => updateUser(sel.dataset.id, { assignedDoctor: sel.value || null }));
    });
    tbody.querySelectorAll('.reset-password-btn').forEach((btn) => {
        btn.addEventListener('click', () => resetUserPassword(btn.dataset.id));
    });

    renderPager('usersPager', filtered.length, usersPage, (p) => { usersPage = p; renderUsersTable(); });
}

// Изменение роли через защищённый эндпоинт. cb — чекбокс с data-role/data-id.
async function updateUserRole(cb) {
    const id = cb.dataset.id;
    const role = cb.dataset.role;
    const value = cb.checked;
    try {
        const res = await fetch(`${API_BASE}/admin/users/${id}/roles`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ [role]: value })
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert('Ошибка: ' + (e.error || res.status));
            loadUsersTable();
            return;
        }
        const updated = await res.json();
        const idx = usersCache.findIndex((u) => String(u._id) === String(id));
        if (idx >= 0) usersCache[idx] = { ...usersCache[idx], ...updated };
        // Назначение/снятие роли врача меняет список лечащих врачей
        if (role === 'isDoctor') loadUsersTable();
    } catch (error) {
        console.error('Ошибка изменения роли:', error);
        alert('Ошибка соединения');
        loadUsersTable();
    }
}

// Установка/сброс пароля пользователя
async function resetUserPassword(id) {
    const password = prompt('Новый пароль (не короче 6 символов):');
    if (password === null) return;
    if (password.length < 6) {
        alert('Пароль должен быть не короче 6 символов');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/users/${id}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password })
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert('Ошибка: ' + (e.error || res.status));
            return;
        }
        const idx = usersCache.findIndex((u) => String(u._id) === String(id));
        if (idx >= 0) usersCache[idx] = { ...usersCache[idx], hasPassword: true };
        renderUsersTable();
        alert('Пароль сохранён');
    } catch (error) {
        console.error('Ошибка установки пароля:', error);
        alert('Ошибка соединения');
    }
}

// Обновление полей пользователя (роль пациента / лечащий врач)
async function updateUser(id, patch) {
    try {
        const res = await fetch(`${API_BASE}/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(patch)
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert('Ошибка сохранения: ' + (e.error || res.status));
            loadUsersTable();
            return;
        }
        const updated = await res.json();
        const idx = usersCache.findIndex((u) => String(u._id) === String(id));
        if (idx >= 0) usersCache[idx] = { ...usersCache[idx], ...updated };
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        alert('Ошибка соединения');
    }
}

// Переключение между вкладками таблиц
function initTableTabs() {
    const tabs = document.querySelectorAll('.table-tab');
    const contents = document.querySelectorAll('.table-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Убрать активный класс со всех вкладок и контента
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Добавить активный класс к выбранной вкладке
            tab.classList.add('active');
            
            // Показать соответствующий контент
            const targetContent = document.getElementById(`${targetTab}Tab`);
            if (targetContent) {
                targetContent.classList.add('active');
                
                // Загрузить данные при переключении
                if (targetTab === 'licenses') {
                    loadLicenses();
                } else if (targetTab === 'users') {
                    loadUsersTable();
                }
            }
        });
    });
}

// Удаление пользователя
async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Пользователь удален');
            loadUsersTable();
            loadUsers(); // Обновить список в форме
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        alert('Ошибка удаления пользователя');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация вкладок
    initTableTabs();
    
    // Инициализация поиска пользователей (в форме выдачи лицензии)
    initUserSearch();

    // Поиск в таблицах
    const licSearch = document.getElementById('licensesSearch');
    if (licSearch) licSearch.addEventListener('input', () => { licensesPage = 1; renderLicenses(); });
    const usrSearch = document.getElementById('usersSearch');
    if (usrSearch) usrSearch.addEventListener('input', () => { usersPage = 1; renderUsersTable(); });

    // Загрузка данных
    loadDevices();
    loadUsers();
    loadLicenses(); // Загружаем лицензии по умолчанию
    
    // Обновление каждые 30 секунд
    setInterval(() => {
        const activeTab = document.querySelector('.table-tab.active');
        if (activeTab) {
            const tabName = activeTab.getAttribute('data-tab');
            if (tabName === 'licenses') {
                loadLicenses();
            } else if (tabName === 'users') {
                loadUsersTable();
            }
        }
        // Обновляем список пользователей для поиска
        loadUsers();
    }, 30000);
});


