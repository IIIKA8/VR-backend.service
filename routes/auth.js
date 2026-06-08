/**
 * @module routes/auth
 * @description
 * **Модуль авторизации** — регистрация, вход, выход и проверка сессии пользователя.
 *
 * Монтируется в `server.js` с префиксом **`/api/auth`**.
 * Пароли хранятся в виде соли и хеша (scrypt). Сессия — `express-session` (cookie).
 *
 * <h3>Эндпоинты</h3>
 * <table>
 *   <thead><tr><th>Метод</th><th>Путь</th><th>Описание</th></tr></thead>
 *   <tbody>
 *     <tr><td>POST</td><td>/register</td><td>Регистрация пациента</td></tr>
 *     <tr><td>POST</td><td>/login</td><td>Вход по username или email</td></tr>
 *     <tr><td>POST</td><td>/logout</td><td>Завершение сессии</td></tr>
 *     <tr><td>GET</td><td>/status</td><td>Текущий пользователь и роли</td></tr>
 *   </tbody>
 * </table>
 *
 * @requires express
 * @requires crypto
 * @requires ../models/User
 * @requires ../util/userDataValidation
 * @see module:server
 * @see module:util/userDataValidation
 */

const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { validatePasswordLength } = require('../util/userDataValidation');

const router = express.Router();

/** Длина ключа scrypt (байт). @constant {number} */
const PASSWORD_KEYLEN = 64;

/** Длина соли пароля (байт). @constant {number} */
const PASSWORD_SALT_BYTES = 16;

/**
 * Вычисляет хеш пароля (scrypt).
 * @memberof module:routes/auth
 * @param {string} password - Пароль в открытом виде
 * @param {string} salt - Соль (hex)
 * @returns {string} Хеш (hex)
 * @private
 */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString('hex');
}

/**
 * Сравнивает пароль с сохранённым хешем (timing-safe).
 * @memberof module:routes/auth
 * @param {string} password
 * @param {string} salt
 * @param {string} hash
 * @returns {boolean}
 * @private
 */
function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  const computed = hashPassword(password, salt);
  const computedBuf = Buffer.from(computed, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, hashBuf);
}

/**
 * Подбирает уникальный username при регистрации.
 * @memberof module:routes/auth
 * @param {string} [baseUsername]
 * @returns {Promise<string>}
 * @private
 */
async function ensureUniqueUsername(baseUsername) {
  const safeBase = (baseUsername || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40) || 'user';
  let candidate = safeBase;
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const exists = await User.findOne({ username: candidate }).select('_id');
    if (!exists) return candidate;
    candidate = `${safeBase}_${Math.random().toString(36).substr(2, 6)}`;
    attempts += 1;
  }
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * POST `/api/auth/register` — регистрация нового пользователя.
 *
 * **Тело (JSON):** `email`, `username`, `password`, `firstName`, `lastName`, `middleName`, `age`.
 * Обязателен email или username; пароль — не короче 6 символов.
 *
 * **Ответ 201:** `{ success: true, userId }` — создана сессия.
 * **Ошибки:** 400 (валидация), 500.
 *
 * @name register
 * @memberof module:routes/auth
 * @function
 */
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, firstName, lastName, middleName, age } = req.body || {};
    const emailValue = (email || '').trim().toLowerCase();
    const usernameValue = (username || '').trim();
    if (!emailValue && !usernameValue) {
      return res.status(400).json({ error: 'Укажите email или username' });
    }
    try {
      validatePasswordLength(password);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (emailValue) {
      const existsEmail = await User.findOne({ email: emailValue }).select('_id');
      if (existsEmail) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }
    }
    if (usernameValue) {
      const existsUsername = await User.findOne({ username: usernameValue }).select('_id');
      if (existsUsername) {
        return res.status(400).json({ error: 'Пользователь с таким username уже существует' });
      }
    }

    const baseUsername = usernameValue || (emailValue ? emailValue.split('@')[0] : null);
    const finalUsername = await ensureUniqueUsername(baseUsername);
    const finalEmail = emailValue || `${finalUsername}@vr-app.local`;

    const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
    const hash = hashPassword(password, salt);

    const fullName = [lastName, firstName, middleName].filter(Boolean).join(' ').trim();

    const user = await User.create({
      username: finalUsername,
      email: finalEmail,
      firstName: firstName ? String(firstName).trim() : '',
      lastName: lastName ? String(lastName).trim() : '',
      middleName: middleName ? String(middleName).trim() : '',
      age: age ? parseInt(age, 10) : null,
      fullName,
      passwordSalt: salt,
      passwordHash: hash,
      isAdmin: false
    });

    req.session.userId = user._id.toString();
    req.session.isAdmin = false;
    req.session.adminUserId = null;

    return res.status(201).json({ success: true, userId: user._id });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    return res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

/**
 * POST `/api/auth/login` — вход по логину (username или email) и паролю.
 *
 * **Тело:** `{ login, password }`.
 * **Ответ 200:** `{ success, isAdmin, isDoctor }`.
 * **Ошибки:** 400, 401, 500.
 *
 * @name login
 * @memberof module:routes/auth
 * @function
 */
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const loginValue = (login || '').trim();
    if (!loginValue || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    const loginLower = loginValue.toLowerCase();
    const user = await User.findOne({
      $or: [{ username: loginValue }, { email: loginLower }]
    }).select('+passwordHash +passwordSalt +isAdmin +isDoctor');
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    req.session.userId = user._id.toString();
    if (user.isAdmin) {
      req.session.isAdmin = true;
      req.session.adminUserId = user._id.toString();
    } else {
      req.session.isAdmin = false;
      req.session.adminUserId = null;
    }
    return res.json({
      success: true,
      isAdmin: !!user.isAdmin,
      isDoctor: !!user.isDoctor
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    return res.status(500).json({ error: 'Ошибка входа' });
  }
});

/**
 * POST `/api/auth/logout` — уничтожение сессии.
 * @name logout
 * @memberof module:routes/auth
 * @function
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

/**
 * GET `/api/auth/status` — проверка авторизации и ролей.
 *
 * **Ответ:** `{ authenticated, isAdmin, isDoctor, user? }`.
 * @name status
 * @memberof module:routes/auth
 * @function
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.json({ authenticated: false, isAdmin: false, isDoctor: false });
    }
    const user = await User.findById(userId).select('isAdmin isDoctor username email');
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ authenticated: false, isAdmin: false, isDoctor: false });
    }
    return res.json({
      authenticated: true,
      isAdmin: !!user.isAdmin,
      isDoctor: !!user.isDoctor,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error('Ошибка проверки статуса:', error);
    return res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

module.exports = router;
