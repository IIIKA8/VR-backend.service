/**
 * @module server
 * @description
 * Точка входа серверного приложения: HTTP-сервер Express 5, WebSocket,
 * подключение MongoDB, сессии, middleware и монтирование REST API.
 *
 * ### Middleware
 * - JSON body, CORS, `Cache-Control: no-store`
 * - {@link module:server~adminGuard} — доступ к `/api/admin` и админ-страницам
 * - {@link module:server~doctorGuard} — кабинет врача `/api/doctor`, `/doctor`
 * - {@link module:server~patientGuard} — кабинет пациента `/api/patient`, `/patient`
 *
 * ### Служебные эндпоинты
 * - `GET /api/health`, `GET /health` — состояние сервера и MongoDB
 *
 * @see module:routes/auth
 * @see module:vr-backend/index
 */

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { Types } = require('mongoose');
const crypto = require('crypto');
const { validatePasswordLength } = require('./util/userDataValidation');
const isObjectId = (v) => Types.ObjectId.isValid(v);
const session = require('express-session');

const app = express();
const server = http.createServer(app);
// WebSocket соединения
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Разрешаем подключения с любых источников
    return true;
  }
});

// Middleware для логирования всех запросов
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  //console.log(` [${timestamp}] ${req.method} ${req.path} - IP: ${clientIP} - User-Agent: ${userAgent}`);
  
  // Логируем тело запроса для POST/PUT/PATCH
  //if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
  //  console.log(`📦 Body: ${JSON.stringify(req.body)}`);
  //}
  
  next();
});

// Подключаем dotenv для переменных окружения (лучше пусть будет до всех middleware)
require('dotenv').config();

// За прокси (Nginx, Traefik): правильные req.ip и req.hostname на новой машине
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// --- СНАЧАЛА session! --- // (ПЕРЕД остальными middleware!)
app.use(session({
  secret: process.env.SESS_SECRET || 'SuperSecret-AdminSession2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000 // 12 часов
  }
}));

// --- Остальные middleware --- //
app.use(express.json());
app.use(cors());
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ваш логгер запросов ДАЛЬШЕ, чтобы req.body уже был распарсен
//app.use((req,res,next)=>{ 
//  console.log('Body:', req.body); 
//  next();
//});

// Обработка ошибок парсинга JSON (ПЕРЕД маршрутами)
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('❌ Ошибка парсинга JSON:', error.message);
    return res.status(400).json({ 
      error: 'Неверный формат JSON в теле запроса',
      details: error.message 
    });
  }
  next(error);
});

// Глобальный обработчик ошибок (в самом конце, перед статикой)
app.use((error, req, res, next) => {
  console.error('❌ Необработанная ошибка:', error);
  console.error('   Путь:', req.path);
  console.error('   Метод:', req.method);
  console.error('   Stack:', error.stack);
  
  // Для API запросов возвращаем JSON
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Обратитесь к администратору',
      type: error.name
    });
  }
  
  // Для остальных запросов можно вернуть HTML или редирект
  next(error);
});

const { resolveMongoUri, mongoUriForLog } = require('./util/mongoUri');

const MONGODB_URI = resolveMongoUri();

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Подключение к MongoDB успешно установлено');
  console.log(`📊 База данных: ${mongoUriForLog(MONGODB_URI)}`);
})
.catch((error) => {
  console.error('❌ Ошибка подключения к MongoDB:', error);
  process.exit(1); // Завершаем процесс при ошибке подключения
});

// WebSocket соединения с детальным логированием
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  const timestamp = new Date().toISOString();
  const connectionId = Math.random().toString(36).substr(2, 9);
  
//  console.log(`🔌 [${timestamp}] VR клиент подключен - ID: ${connectionId} - IP: ${clientIP}`);
  
  // Отправляем приветственное сообщение
  ws.send('Добро пожаловать в VR сервер!');
  
  ws.on('message', (msg) => {
    const message = msg.toString();
//    console.log(`📨 [${timestamp}] Сообщение от ${connectionId}: ${message}`);
    
    // Парсим JSON сообщения
    //try {
      //const data = JSON.parse(message);
      //console.log(`📊 [${timestamp}] JSON данные от ${connectionId}:`, data);
      
      // Логируем специфичные типы сообщений
      //if (data.type) {
      //  switch (data.type) {
      //    case 'user_data':
      //      console.log(`👤 [${timestamp}] Данные пользователя от ${connectionId}: ${data.username}`);
      //      break;
      //    case 'position_update':
      //      console.log(` [${timestamp}] Позиция от ${connectionId}: x=${data.position?.x}, y=${data.position?.y}, z=${data.position?.z}`);
      //      break;
      //    case 'scene_change':
      //      console.log(`🎬 [${timestamp}] Смена сцены от ${connectionId}: ${data.from_scene} → ${data.to_scene}`);
      //      break;
      //    case 'controller_update':
      //      console.log(`🎮 [${timestamp}] Контроллер ${data.controller_id} от ${connectionId}`);
      //      break;
      //  }
      //}
    //} catch (e) {
    //  console.log(`📝 [${timestamp}] Текстовое сообщение от ${connectionId}: ${message}`);
    //}
    
    // Отправляем эхо
    //ws.send('Эхо: ' + message);
  });

  //ws.on('close', (code, reason) => {
  //  console.log(`🔌 [${timestamp}] VR клиент отключен - ID: ${connectionId} - Код: ${code} - Причина: ${reason}`);
  //});
  
  //ws.on('error', (error) => {
  //  console.error(`❌ [${timestamp}] WebSocket ошибка от ${connectionId}:`, error);
  //});
});

// Подключение моделей (нужно для авторизации и статистики)
const User = require('./models/User');

// Подключение маршрутов
const userRoutes = require('./routes/users');
const sceneRoutes = require('./routes/scenes');
const sessionRoutes = require('./routes/sessions');
const licenseRoutes = require('./routes/licenses');
const deviceRoutes = require('./routes/devices');
const usagePeriodRoutes = require('./routes/usagePeriods');
const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctor');
const patientRoutes = require('./routes/patient');
const vrRoutes = require('./routes/vr');

// API маршруты ПЕРЕД статикой
app.use('/api/users', userRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/licenses', (req, res, next) => {
  const adminPrefixes = ['/issue-admin', '/admin', '/purge'];
  if (adminPrefixes.some((prefix) => req.path.startsWith(prefix))) {
    return adminGuard(req, res, next);
  }
  return next();
}, licenseRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/usage-periods', usagePeriodRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vr', vrRoutes);

// --- API авторизации админки --- //
const PASSWORD_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString('hex');
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  const computed = hashPassword(password, salt);
  const computedBuf = Buffer.from(computed, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, hashBuf);
}

// Эндпоинт статуса ДОЛЖЕН быть ПЕРЕД adminGuard, чтобы быть доступным без авторизации
app.get('/api/admin/status', async (req, res) => {
  try {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) {
      return res.json({ isAdmin: false });
    }
    const adminUser = await User.findById(adminUserId).select('isAdmin');
    if (!adminUser || !adminUser.isAdmin) {
      req.session.isAdmin = false;
      req.session.adminUserId = null;
      return res.json({ isAdmin: false });
    }
    return res.json({ isAdmin: true });
  } catch (error) {
    console.error('Ошибка проверки статуса админа:', error);
    return res.status(500).json({ error: 'Ошибка проверки статуса админа' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const loginValue = (login || '').trim();
    if (!loginValue || !password) {
      return res.status(400).json({ success: false, error: 'Логин и пароль обязательны' });
    }
    const loginLower = loginValue.toLowerCase();
    const user = await User.findOne({
      $or: [{ username: loginValue }, { email: loginLower }]
    }).select('+passwordHash +passwordSalt +isAdmin');
    if (!user || !user.isAdmin) {
      return res.status(401).json({ success: false, error: 'Неверные учетные данные или нет доступа' });
    }
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Неверные учетные данные или нет доступа' });
    }
    req.session.isAdmin = true;
    req.session.adminUserId = user._id.toString();
    return res.json({ success: true });
  } catch (error) {
    console.error('Ошибка входа в админку:', error);
    return res.status(500).json({ success: false, error: 'Ошибка авторизации' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

/**
 * Проверяет сессию администратора (`req.session.adminUserId`).
 * API → 401 JSON; HTML → редирект на `/auth?next=/admin`.
 * @memberof module:server
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {Function} next
 * @async
 */
async function adminGuard(req, res, next) {
  try {
    const isApiRequest = req.originalUrl.startsWith('/api');
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) {
      if (isApiRequest) {
        return res.status(401).json({ error: 'Нет доступа. Требуется авторизация администратора.' });
      }
      return res.redirect('/auth?next=/admin');
    }
    const adminUser = await User.findById(adminUserId).select('isAdmin');
    if (!adminUser || !adminUser.isAdmin) {
      req.session.destroy(() => {});
      if (isApiRequest) {
    return res.status(401).json({ error: 'Нет доступа. Требуется авторизация администратора.' });
      }
      return res.redirect('/auth?next=/admin');
    }
    return next();
  } catch (error) {
    console.error('Ошибка проверки доступа админа:', error);
    return res.status(500).json({ error: 'Ошибка проверки доступа' });
  }
}

/**
 * Доступ только для пользователей с `isDoctor`.
 * @memberof module:server
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {Function} next
 * @async
 */
async function doctorGuard(req, res, next) {
  try {
    const userId = req.session?.userId;
    const isApi = req.originalUrl.startsWith('/api');
    if (!userId) {
      if (isApi) return res.status(401).json({ error: 'Требуется вход' });
      return res.redirect('/auth?next=/doctor');
    }
    const user = await User.findById(userId).select('isDoctor');
    if (!user || !user.isDoctor) {
      if (isApi) return res.status(403).json({ error: 'Доступ только для врачей' });
      return res.status(403).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Доступ запрещён</title></head>
<body style="font-family:sans-serif;padding:2rem;"><p>Раздел только для врачей.</p><p><a href="/auth">Вход</a></p></body></html>`);
    }
    return next();
  } catch (error) {
    console.error('doctorGuard:', error);
    if (req.originalUrl.startsWith('/api')) {
      return res.status(500).json({ error: 'Ошибка проверки доступа' });
    }
    return res.redirect('/auth?next=/doctor');
  }
}

/**
 * Кабинет пациента: авторизованный пользователь без ролей admin/doctor.
 * @memberof module:server
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {Function} next
 * @async
 */
async function patientGuard(req, res, next) {
  try {
    const userId = req.session?.userId;
    const isApi = req.originalUrl.startsWith('/api');
    if (!userId) {
      if (isApi) return res.status(401).json({ error: 'Требуется вход' });
      return res.redirect('/auth?next=/patient');
    }
    const user = await User.findById(userId).select('+isAdmin +isDoctor');
    if (!user) {
      req.session.destroy(() => {});
      if (isApi) return res.status(401).json({ error: 'Требуется вход' });
      return res.redirect('/auth?next=/patient');
    }
    // Админов и врачей уводим в их собственные разделы
    if (user.isAdmin) {
      if (isApi) return res.status(403).json({ error: 'Используйте админ-панель' });
      return res.redirect('/');
    }
    if (user.isDoctor) {
      if (isApi) return res.status(403).json({ error: 'Используйте кабинет врача' });
      return res.redirect('/doctor');
    }
    req.patientUser = user;
    return next();
  } catch (error) {
    console.error('patientGuard:', error);
    if (req.originalUrl.startsWith('/api')) {
      return res.status(500).json({ error: 'Ошибка проверки доступа' });
    }
    return res.redirect('/auth?next=/patient');
  }
}

// --- Использование защиты --- //
// Защищаем html (админка)
app.get('/admin', adminGuard, (req, res) => {
  //console.log('📄 Запрос страницы админки');
  res.sendFile(path.join(__dirname, 'web/views/admin.html'));
});
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'web/views/auth.html'));
});
app.get('/patient-stats', (req, res) => {
  res.redirect(301, '/doctor');
});

app.use('/api/doctor', doctorGuard, doctorRoutes);

app.get('/doctor', doctorGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'web/views/doctor.html'));
});

// Кабинет пациента (личный) — только свои данные
app.use('/api/patient', patientGuard, patientRoutes);

app.get('/patient', patientGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'web/views/patient.html'));
});
// (можно добавить аналогичную защиту для других admin страниц)

// Пример: защищённый эндпоинт admin-api
app.use('/api/admin', adminGuard);

// --- Управление ролями пользователей (только для админа) --- //

// Список пользователей с ролями для таблицы админки.
// Открытый /api/users не отдаёт isAdmin/isDoctor (select:false), поэтому здесь отдельный защищённый список.
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('+isAdmin +isDoctor +passwordHash')
      .sort({ lastSeen: -1 });
    const result = users.map((u) => ({
      _id: u._id,
      lastName: u.lastName,
      firstName: u.firstName,
      middleName: u.middleName,
      age: u.age,
      username: u.username,
      email: u.email,
      isOnline: u.isOnline,
      isPatient: !!u.isPatient,
      isDoctor: !!u.isDoctor,
      isAdmin: !!u.isAdmin,
      assignedDoctor: u.assignedDoctor,
      hasPassword: !!u.passwordHash
    }));
    res.json(result);
  } catch (error) {
    console.error('Ошибка получения пользователей (admin):', error);
    res.status(500).json({ error: 'Ошибка при получении пользователей' });
  }
});

// Изменение роли пользователя. Тело: { role: 'none' | 'patient' | 'doctor' | 'admin' } — роли взаимоисключающие.
const ROLE_FLAGS = {
  none: { isPatient: false, isDoctor: false, isAdmin: false },
  patient: { isPatient: true, isDoctor: false, isAdmin: false },
  doctor: { isPatient: false, isDoctor: true, isAdmin: false },
  admin: { isPatient: false, isDoctor: false, isAdmin: true }
};

app.patch('/api/admin/users/:id/roles', async (req, res) => {
  try {
    const { id } = req.params;
    const role = (req.body || {}).role;
    if (!Object.prototype.hasOwnProperty.call(ROLE_FLAGS, role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }

    const user = await User.findById(id).select('+isAdmin +isDoctor');
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Защита от блокировки доступа в админку: снятие роли администратора
    if (user.isAdmin && role !== 'admin') {
      if (String(req.session?.adminUserId) === String(id)) {
        return res.status(400).json({ error: 'Нельзя снять роль администратора с самого себя' });
      }
      const adminsCount = await User.countDocuments({ isAdmin: true });
      if (adminsCount <= 1) {
        return res.status(400).json({ error: 'Нельзя снять роль с последнего администратора' });
      }
    }

    const wasDoctor = user.isDoctor;
    Object.assign(user, ROLE_FLAGS[role]);
    // Не-пациент не должен ссылаться на лечащего врача
    if (role !== 'patient') {
      user.assignedDoctor = null;
    }
    await user.save();

    // Пациенты не должны ссылаться на бывшего врача
    if (wasDoctor && role !== 'doctor') {
      await User.updateMany({ assignedDoctor: user._id }, { assignedDoctor: null });
    }

    return res.json({
      _id: user._id,
      role,
      isPatient: !!user.isPatient,
      isDoctor: !!user.isDoctor,
      isAdmin: !!user.isAdmin
    });
  } catch (error) {
    console.error('Ошибка изменения роли:', error);
    return res.status(500).json({ error: 'Ошибка при изменении роли' });
  }
});

// Установка/сброс пароля пользователя (чтобы назначенный админ/врач смог войти). Тело: { password }.
app.post('/api/admin/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    try {
      validatePasswordLength(password);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    user.passwordSalt = salt;
    user.passwordHash = hashPassword(password, salt);
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('Ошибка установки пароля:', error);
    return res.status(500).json({ error: 'Ошибка при установке пароля' });
  }
});

/**
 * GET `/api/health` — проверка работоспособности (Docker healthcheck).
 * @memberof module:server
 */
app.get('/api/health', (req, res) => {
  const timestamp = new Date().toISOString();
  //console.log(`❤️ [${timestamp}] Health check - IP: ${req.ip}`);
  
  res.json({
    status: 'OK',
    timestamp: timestamp,
    mongodb: mongoose.connection.readyState === 1 ? 'Подключено' : 'Отключено',
    uptime: process.uptime()
  });
});

// Старый health endpoint для обратной совместимости
app.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  //console.log(`❤️ [${timestamp}] Health check - IP: ${req.ip}`);
  
  res.json({
    status: 'OK',
    timestamp: timestamp,
    mongodb: mongoose.connection.readyState === 1 ? 'Подключено' : 'Отключено',
    uptime: process.uptime()
  });
});

// Подключение моделей для статистики (ПЕРЕД маршрутом stats)
const VRScene = require('./models/VRScene');
const VRSession = require('./models/VRSession');
const License = require('./models/License');
const Device = require('./models/Device');
const VRExerciseResult = require('./models/VRExerciseResult');

// API endpoint для статистики (ПЕРЕД обработчиком 404!)
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      totalUsers: await User.countDocuments(),
      onlineUsers: await User.countDocuments({ isOnline: true }),
      totalDevices: await Device.countDocuments(),
      activeDevices: await Device.countDocuments({ status: 'active' }),
      activeSessions: await VRSession.countDocuments({ status: 'active' }),
      totalSessions: await VRSession.countDocuments()
    };
    res.json(stats);
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Сводка для графиков дашборда (только админ)
app.get('/api/dashboard/summary', adminGuard, async (req, res) => {
  try {
    const now = new Date();
    const days = 7;
    const start = new Date(now.getTime() - (days - 1) * 86400000);
    start.setHours(0, 0, 0, 0);

    // Сессии за последние 7 дней по дням
    const sessionsAgg = await VRSession.aggregate([
      { $match: { startedAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, count: { $sum: 1 } } }
    ]);
    // Упражнения за последние 7 дней по дням
    const resultsAgg = await VRExerciseResult.aggregate([
      { $match: { startedAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, count: { $sum: 1 } } }
    ]);
    // Упражнения по режимам (всего)
    const byModeAgg = await VRExerciseResult.aggregate([
      { $group: { _id: '$exerciseMode', count: { $sum: 1 } } }
    ]);

    const labels = [];
    const sessionsSeries = [];
    const resultsSeries = [];
    const sMap = Object.fromEntries(sessionsAgg.map((d) => [d._id, d.count]));
    const rMap = Object.fromEntries(resultsAgg.map((d) => [d._id, d.count]));
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
      sessionsSeries.push(sMap[key] || 0);
      resultsSeries.push(rMap[key] || 0);
    }

    const MODE_LABELS = { conveyor: 'Конвейер', tea: 'Чай', drum: 'Барабан' };
    const modeOrder = ['conveyor', 'tea', 'drum'];
    const modeMap = Object.fromEntries(byModeAgg.map((m) => [m._id, m.count]));
    const byMode = modeOrder.map((m) => ({ mode: m, label: MODE_LABELS[m], count: modeMap[m] || 0 }));

    res.json({
      labels,
      sessionsSeries,
      resultsSeries,
      byMode
    });
  } catch (error) {
    console.error('Ошибка сводки дашборда:', error);
    res.status(500).json({ error: 'Ошибка сводки' });
  }
});

// Статика дашборда (с правильными заголовками)
app.use('/static', express.static(path.join(__dirname, 'web/static'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Правильные MIME типы
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    // Отключаем кеширование для разработки
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Логирование запросов к статике (для отладки)
app.use('/static', (req, res, next) => {
  //console.log(`📁 Статический файл: ${req.path}`);
  next();
});

// главная страница дашборда — ТОЛЬКО для админа.
// Врачей уводим в кабинет врача, пациентов/без роли — в личный кабинет.
app.get('/', async (req, res) => {
  try {
    const uid = req.session?.userId;
    if (!uid) {
      return res.redirect('/auth');
    }
    const u = await User.findById(uid).select('+isAdmin +isDoctor');
    if (!u) {
      req.session.destroy(() => {});
      return res.redirect('/auth');
    }
    if (u.isAdmin) {
      return res.sendFile(path.join(__dirname, 'web/views/index.html'));
    }
    if (u.isDoctor) {
      return res.redirect(302, '/doctor');
    }
    return res.redirect(302, '/patient');
  } catch (e) {
    console.error('GET / redirect:', e);
    return res.redirect('/auth');
  }
});

// Обработка 404 для API (ПОСЛЕ всех API маршрутов!)
app.use((req, res, next) => {
  // Проверяем, что это API запрос и он не был обработан
  if (req.path.startsWith('/api/')) {
    console.log(`❌ 404 API маршрут не найден: ${req.method} ${req.path}`);
    return res.status(404).json({ 
      error: 'API маршрут не найден',
      path: req.path,
      method: req.method
    });
  }
  next();
});

// Обработка всех остальных маршрутов (404 для HTML)
app.use((req, res) => {
  console.log(`❌ 404 маршрут не найден: ${req.method} ${req.path}`);
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Страница не найдена</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
      </style>
    </head>
    <body>
      <h1>404 - Страница не найдена</h1>
      <p><a href="/">Вернуться на главную</a></p>
    </body>
    </html>
  `);
});

// Глобальный обработчик ошибок (в самом конце)
app.use((error, req, res, next) => {
  console.error('❌ Необработанная ошибка:', error);
  console.error('   Путь:', req.path);
  console.error('   Метод:', req.method);
  console.error('   Stack:', error.stack);
  
  // Для API запросов возвращаем JSON
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Обратитесь к администратору',
      type: error.name
    });
  }
  
  // Для остальных - HTML
  res.status(500).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>500 - Ошибка сервера</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
      </style>
    </head>
    <body>
      <h1>500 - Ошибка сервера</h1>
      <p><a href="/">Вернуться на главную</a></p>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
const SERVER_IP = process.env.SERVER_IP || '0.0.0.0';

server.listen(PORT, SERVER_IP, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Дашборд: http://${SERVER_IP}:${PORT}`);
  //console.log(`🔌 WebSocket: ws://${SERVER_IP}:${PORT}`);
  console.log(`🌐 API: http://${SERVER_IP}:${PORT}/api`);
});
