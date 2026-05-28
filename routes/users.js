const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verboseLog } = require('../util/logger');

// Middleware для логирования запросов (только в dev / при LOG_VERBOSE=1)
router.use((req, res, next) => {
  verboseLog(` [${new Date().toISOString()}] Users API: ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Получить пользователей.
// Без query — массив (обратная совместимость). С ?page — объект пагинации.
// Поддержка: ?search= (ФИО/username/email), ?status=online|offline, ?role=patient|doctor|admin
router.get('/', async (req, res) => {
  try {
    const { page, limit, search, status, role } = req.query;
    const filter = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { lastName: rx }, { firstName: rx }, { middleName: rx },
        { username: rx }, { email: rx }
      ];
    }
    if (status === 'online') filter.isOnline = true;
    else if (status === 'offline') filter.isOnline = false;
    if (role === 'patient') {
      filter.isPatient = true;
      filter.isDoctor = { $ne: true };
      filter.isAdmin = { $ne: true };
    } else if (role === 'doctor') {
      filter.isDoctor = true;
      filter.isAdmin = { $ne: true };
    } else if (role === 'admin') {
      filter.isAdmin = true;
    }

    const baseQuery = User.find(filter).select('-__v').sort({ lastSeen: -1 });

    if (page === undefined) {
      const users = await baseQuery;
      return res.json(users);
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (p - 1) * lim;
    const [items, total] = await Promise.all([
      baseQuery.skip(skip).limit(lim),
      User.countDocuments(filter)
    ]);
    res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / lim)), limit: lim });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении пользователей' });
  }
});

// Получить пользователя по ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-__v');
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении пользователя' });
  }
});

// Создать нового пользователя (с поддержкой ФИО и возраста)
router.post('/', async (req, res) => {
  try {
    verboseLog(`➕ [${new Date().toISOString()}] Создание пользователя`);
    verboseLog(`📦 Тело запроса:`, JSON.stringify(req.body, null, 2));
    
    // Проверка подключения к MongoDB
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB не подключен!');
      return res.status(503).json({ 
        error: 'База данных недоступна',
        details: 'Проверьте подключение к MongoDB'
      });
    }
    
    // Поддерживаем формат из админки: lastName, firstName, middleName, age
    const { lastName, firstName, middleName, age } = req.body;
    
    // Проверяем обязательные поля
    if (!lastName || !firstName) {
      verboseLog(`❌ Отсутствуют обязательные поля: lastName=${!!lastName}, firstName=${!!firstName}`);
      return res.status(400).json({ 
        error: 'Фамилия и имя обязательны для заполнения',
        received: { lastName: !!lastName, firstName: !!firstName }
      });
    }
    
    // Генерируем уникальные username и email на основе ФИО
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 6);
    const baseUsername = `${lastName.toLowerCase()}_${firstName.toLowerCase()}_${timestamp}`;
    const username = baseUsername.replace(/[^a-z0-9_]/g, '');
    const email = `${username}@vr-app.local`;
    
    verboseLog(`🔧 Генерируемые данные: username=${username}, email=${email}`);
    
    // Проверяем уникальность username и email
    let finalUsername = username;
    let finalEmail = email;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      try {
        const existingUser = await User.findOne({ 
          $or: [{ username: finalUsername }, { email: finalEmail }] 
        });
        
        if (!existingUser) {
          break;
        }
        
        verboseLog(`⚠️ Конфликт уникальности, попытка ${attempts + 1}`);
        finalUsername = `${username}_${randomSuffix}_${attempts}`;
        finalEmail = `${finalUsername}@vr-app.local`;
        attempts++;
      } catch (dbError) {
        console.error('❌ Ошибка проверки уникальности:', dbError);
        throw dbError;
      }
    }
    
    if (attempts >= maxAttempts) {
      console.error(`❌ Не удалось создать уникальный username после ${maxAttempts} попыток`);
      return res.status(500).json({ 
        error: 'Не удалось создать уникального пользователя. Попробуйте еще раз.' 
      });
    }
    
    // Формируем полное имя
    const fullName = [lastName, firstName, middleName]
      .filter(Boolean)
      .join(' ')
      .trim();
    
    const userData = {
      username: finalUsername,
      email: finalEmail,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      middleName: middleName ? middleName.trim() : '',
      age: age ? parseInt(age) : null,
      fullName: fullName
    };
    
    verboseLog(`📝 Данные для создания:`, JSON.stringify(userData, null, 2));
    
    const user = new User(userData);
    await user.save();
    
    verboseLog(`✅ Пользователь создан: ID=${user._id}, username=${user.username}`);
    res.status(201).json(user);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Ошибка создания пользователя:`);
    console.error(`   Тип: ${error.name}`);
    console.error(`   Сообщение: ${error.message}`);
    console.error(`   Stack:`, error.stack);
    
    // Обработка различных типов ошибок
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'поле';
      console.error(`❌ Дубликат в поле: ${field}`);
      return res.status(400).json({ 
        error: `Пользователь с таким ${field === 'username' ? 'именем пользователя' : field === 'email' ? 'email' : field} уже существует`,
        details: error.message
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map(err => err.message);
      console.error(`❌ Ошибки валидации:`, messages);
      return res.status(400).json({ 
        error: 'Ошибка валидации', 
        details: messages.join(', '),
        errors: error.errors
      });
    }
    
    // Проверка подключения к MongoDB
    if (error.name === 'MongoServerError' || error.message.includes('Mongo') || error.message.includes('connection')) {
      console.error(`❌ Ошибка MongoDB:`, error.message);
      return res.status(503).json({ 
        error: 'Ошибка базы данных', 
        details: 'Проверьте подключение к MongoDB',
        message: error.message
      });
    }
    
    // Общая ошибка
    return res.status(500).json({ 
      error: 'Ошибка при создании пользователя', 
      details: error.message,
      type: error.name
    });
  }
});

// Обновить пользователя
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-__v');
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении пользователя' });
  }
});

// Удалить пользователя
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ message: 'Пользователь удален' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении пользователя' });
  }
});

// Обновить статус онлайн
router.patch('/:id/online', async (req, res) => {
  try {
    const isOnline = req.body.isOnline;
    verboseLog(`🔄 [${new Date().toISOString()}] Обновление статуса пользователя ${req.params.id}: ${isOnline ? 'онлайн' : 'оффлайн'}`);
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        isOnline: isOnline,
        lastSeen: new Date()
      },
      { new: true }
    ).select('-__v');
    
    if (!user) {
      console.log(`⚠️ [${new Date().toISOString()}] Пользователь ${req.params.id} не найден`);
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    console.log(`✅ [${new Date().toISOString()}] Статус пользователя ${user.username} обновлен`);
    res.json(user);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Ошибка обновления статуса:`, error);
    res.status(400).json({ error: 'Ошибка при обновлении статуса' });
  }
});

module.exports = router;
