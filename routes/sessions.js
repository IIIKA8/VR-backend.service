const express = require('express');
const router = express.Router();
const VRSession = require('../models/VRSession');

// Список сессий (для дашборда).
// Без query — массив (обратная совместимость). С ?page — объект пагинации.
// Поддержка: ?status=waiting|active|paused|ended
router.get('/', async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const filter = {};
    if (['waiting', 'active', 'paused', 'ended'].includes(status)) {
      filter.status = status;
    }

    const baseQuery = VRSession.find(filter)
      .populate('scene', 'name description')
      .populate('host', 'username lastName firstName middleName avatar')
      .populate('participants.user', 'username avatar')
      .select('-__v')
      .sort({ startedAt: -1 });

    if (page === undefined) {
      const sessions = await baseQuery;
      return res.json(sessions);
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (p - 1) * lim;
    const [items, total] = await Promise.all([
      baseQuery.skip(skip).limit(lim),
      VRSession.countDocuments(filter)
    ]);
    res.json({ items, total, page: p, pages: Math.max(1, Math.ceil(total / lim)), limit: lim });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сессий' });
  }
});

// Получить активные сессии
router.get('/active', async (req, res) => {
  try {
    const sessions = await VRSession.find({ status: 'active' })
      .populate('scene', 'name description environment')
      .populate('host', 'username avatar')
      .populate('participants.user', 'username avatar')
      .select('-__v');
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении активных сессий' });
  }
});

// Получить сессию по ID
router.get('/:id', async (req, res) => {
  try {
    const session = await VRSession.findById(req.params.id)
      .populate('scene', 'name description environment objects')
      .populate('host', 'username avatar')
      .populate('participants.user', 'username avatar')
      .select('-__v');
    
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сессии' });
  }
});

// Создать новую сессию (с привязкой к устройству)
router.post('/', async (req, res) => {
  try {
    const { deviceId, deviceKey, ...sessionData } = req.body;
    
    // Если передан deviceId или deviceKey, привязываем устройство
    if (deviceId || deviceKey) {
      const Device = require('../models/Device');
      const device = deviceKey 
        ? await Device.findOne({ key: deviceKey })
        : await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ error: 'Устройство не найдено' });
      }
      
      // Можно сохранить deviceId в сессии для связи
      sessionData.device = device._id;
    }
    
    const session = new VRSession(sessionData);
    await session.save();
    await session.populate('scene', 'name description environment');
    await session.populate('host', 'username email fullName age');
    res.status(201).json(session);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при создании сессии', details: error.message });
  }
});

// Присоединиться к сессии
router.post('/:id/join', async (req, res) => {
  try {
    const session = await VRSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    if (session.participants.length >= session.settings.maxParticipants) {
      return res.status(400).json({ error: 'Сессия заполнена' });
    }
    
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Сессия не активна' });
    }
    
    const participant = {
      user: req.body.userId,
      position: req.body.position || { x: 0, y: 0, z: 0 },
      rotation: req.body.rotation || { x: 0, y: 0, z: 0 }
    };
    
    session.participants.push(participant);
    await session.save();
    
    await session.populate('participants.user', 'username avatar');
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при присоединении к сессии' });
  }
});

// Покинуть сессию
router.post('/:id/leave', async (req, res) => {
  try {
    const session = await VRSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    session.participants = session.participants.filter(
      p => p.user.toString() !== req.body.userId
    );
    
    await session.save();
    await session.populate('participants.user', 'username avatar');
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при выходе из сессии' });
  }
});

// Обновить позицию пользователя в сессии
router.patch('/:id/position/:userId', async (req, res) => {
  try {
    const session = await VRSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    const participant = session.participants.find(
      p => p.user.toString() === req.params.userId
    );
    
    if (!participant) {
      return res.status(404).json({ error: 'Пользователь не найден в сессии' });
    }
    
    participant.position = req.body.position;
    participant.rotation = req.body.rotation;
    await session.save();
    
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении позиции' });
  }
});

// Обновить статус сессии
router.patch('/:id/status', async (req, res) => {
  try {
    const session = await VRSession.findByIdAndUpdate(
      req.params.id,
      { 
        status: req.body.status,
        ...(req.body.status === 'ended' && { endedAt: new Date() })
      },
      { new: true }
    )
    .populate('scene', 'name description environment')
    .populate('host', 'username avatar')
    .populate('participants.user', 'username avatar')
    .select('-__v');
    
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении статуса сессии' });
  }
});

module.exports = router;
