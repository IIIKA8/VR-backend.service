function setMessage(el, text, isSuccess = false) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('success', isSuccess);
}

function initTabs() {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            const form = document.getElementById(`${target}Form`);
            if (form) form.classList.add('active');
        });
    });
}

async function loginSubmit(e) {
    e.preventDefault();
    const login = document.getElementById('loginValue').value.trim();
    const password = document.getElementById('loginPassword').value;
    const message = document.getElementById('loginMessage');
    const next = new URLSearchParams(window.location.search).get('next');
    setMessage(message, '');
    if (!login || !password) {
        setMessage(message, 'Введите логин и пароль');
        return;
    }
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ login, password })
        });
        const data = await res.json();
        if (!res.ok) {
            setMessage(message, data.error || 'Ошибка входа');
            return;
        }
        if (next) {
            window.location.href = next;
            return;
        }
        if (data.isAdmin) window.location.href = '/admin';
        else if (data.isDoctor) window.location.href = '/doctor';
        else window.location.href = '/';
    } catch (error) {
        setMessage(message, 'Ошибка соединения с сервером');
    }
}

async function registerSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const lastName = document.getElementById('registerLastName').value.trim();
    const firstName = document.getElementById('registerFirstName').value.trim();
    const middleName = document.getElementById('registerMiddleName').value.trim();
    const age = document.getElementById('registerAge').value.trim();
    const password = document.getElementById('registerPassword').value;
    const message = document.getElementById('registerMessage');
    const next = new URLSearchParams(window.location.search).get('next');
    setMessage(message, '');

    if (!email && !username) {
        setMessage(message, 'Укажите email или username');
        return;
    }
    if (!password || password.length < 6) {
        setMessage(message, 'Пароль должен быть не короче 6 символов');
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                email: email || undefined,
                username: username || undefined,
                lastName: lastName || undefined,
                firstName: firstName || undefined,
                middleName: middleName || undefined,
                age: age ? parseInt(age, 10) : undefined,
                password
            })
        });
        const data = await res.json();
        if (!res.ok) {
            setMessage(message, data.error || 'Ошибка регистрации');
            return;
        }
        setMessage(message, 'Регистрация успешна. Выполнен вход.', true);
        setTimeout(() => {
            if (next) {
                window.location.href = next;
            } else {
                window.location.href = '/';
            }
        }, 800);
    } catch (error) {
        setMessage(message, 'Ошибка соединения с сервером');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm) loginForm.addEventListener('submit', loginSubmit);
    if (registerForm) registerForm.addEventListener('submit', registerSubmit);

    const badge = document.getElementById('authUserBadge');
    const actionBtn = document.getElementById('authActionBtn');
    const toggle = document.getElementById('userMenuToggle');
    const dropdown = document.getElementById('userMenuDropdown');
    const loggedBlock = document.getElementById('authLoggedBlock');
    const loggedName = document.getElementById('authLoggedName');
    const logoutBtn = document.getElementById('authLogoutBtn');
    const tabs = document.querySelector('.auth-tabs');
    const content = document.querySelector('.auth-content');

    fetch('/api/auth/status', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (badge) {
                if (data.authenticated) {
                    const name = data.user?.username || data.user?.email || 'Пользователь';
                    badge.textContent = `Вы вошли как: ${name}`;
                } else {
                    badge.textContent = 'Гость';
                }
            }
            if (actionBtn) {
                if (data.authenticated) {
                    actionBtn.textContent = 'Выйти';
                    actionBtn.href = '#';
                    actionBtn.onclick = async (e) => {
                        e.preventDefault();
                        await fetch('/api/auth/logout', {
                            method: 'POST',
                            credentials: 'same-origin'
                        });
                        window.location.reload();
                    };
                } else {
                    actionBtn.textContent = 'Вход';
                    actionBtn.href = '/auth';
                    actionBtn.onclick = null;
                }
            }
            if (data.authenticated) {
                const name = data.user?.username || data.user?.email || 'Пользователь';
                if (loggedName) loggedName.textContent = name;
                if (tabs) tabs.style.display = 'none';
                if (content) content.style.display = 'none';
                if (loggedBlock) loggedBlock.style.display = 'flex';
            }
        })
        .catch(() => {});

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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });
            window.location.reload();
        });
    }
});
