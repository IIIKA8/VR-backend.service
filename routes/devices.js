// routes/devices.js
const express = require('express');
const Device = require('../models/Device');
const router = express.Router();

// Регистрация устройства с ключом (Type: regist)
router.post('/register', async (req, res) => {
  try {
    console.log(`[VR][${new Date().toISOString()}] /devices/register: Body:`, JSON.stringify(req.body, null, 2));
    const { type, key, deviceId, name, firmwareVersion } = req.body;
    
    // Проверяем тип запроса
    if (type === 'regist' && key) {
      // Регистрация с ключом (первый запуск)
      let device = await Device.findOne({ key });
      
      if (device) {
        // Устройство уже зарегистрировано с этим ключом
        device.lastSeen = new Date();
        device.status = 'active';
        if (deviceId) device.deviceId = deviceId;
        if (name) device.name = name;
        if (firmwareVersion) device.firmwareVersion = firmwareVersion;
        await device.save();
        
        return res.json({
          success: true,
          type: 'regist',
          id: device._id,
          key: device.key,
          message: 'Устройство уже зарегистрировано'
        });
      }
      
      // Создаём новое устройство с ключом
      device = await Device.create({
        key,
        deviceId: deviceId || `device_${Date.now()}`,
        name: name || `Очки ${Date.now()}`,
        firmwareVersion: firmwareVersion || '1.0.0',
        status: 'active'
      });
      
      return res.json({
        success: true,
        type: 'regist',
        id: device._id,
        key: device.key
      });
    }
    
    // Старая логика регистрации (без ключа)
    const { deviceId: oldDeviceId } = req.body;
    let device = await Device.findOne({ deviceId: oldDeviceId });
    
    if (device) {
      device.lastSeen = new Date();
      device.status = 'active';
      await device.save();
      return res.json({ device, isNew: false });
    }
    
    device = await Device.create({
      deviceId: oldDeviceId || `device_${Date.now()}`,
      name: name || `Очки ${Date.now()}`,
      firmwareVersion: firmwareVersion || '1.0.0'
    });
    
    console.log(`[VR][${new Date().toISOString()}] /devices/register: Device created:`, JSON.stringify(device, null, 2));
    res.status(201).json({ device, isNew: true });
  } catch (error) {
    console.error('Ошибка регистрации устройства:', error);
    res.status(400).json({ error: 'Ошибка регистрации устройства', details: error.message });
  }
});

// Проверка доступа (Type: check)
router.post('/check', async (req, res) => {
  try {
    console.log(`[VR][${new Date().toISOString()}] /devices/check: Body:`, JSON.stringify(req.body, null, 2));
    const { type, key } = req.body;
    
    if (type !== 'check' || !key) {
      return res.status(400).json({ 
        permission: false, 
        reason: 'INVALID_REQUEST',
        message: 'Требуется type: "check" и key' 
      });
    }
    
    // Находим устройство по ключу
    const device = await Device.findOne({ key });
    if (!device) {
      return res.status(404).json({ 
        permission: false, 
        reason: 'DEVICE_NOT_FOUND',
        message: 'Устройство с таким ключом не найдено' 
      });
    }
    
    // Обновляем lastSeen
    device.lastSeen = new Date();
    await device.save();
    
    // Проверяем периодический доступ (UsagePeriod)
    const UsagePeriod = require('../models/UsagePeriod');
    const now = new Date();
    const activePeriod = await UsagePeriod.findOne({
      device: device._id,
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate('user', 'lastName firstName middleName age username email');
    
    // Проверяем сессионный доступ (VRSession) - ищем по device._id
    const VRSession = require('../models/VRSession');
    const activeSession = await VRSession.findOne({
      status: 'active',
      device: device._id  // Ищем сессию по устройству
    }).populate('host', 'lastName firstName middleName age username email');
    
    // Определяем разрешение
    let permission = false;
    let accessType = null;
    let user = null;
    let period = null;
    let session = null;
    
    // Приоритет: сначала периодический доступ, потом сессионный
    if (activePeriod && activePeriod.user) {
      permission = true;
      accessType = 'periodic';
      user = {
        uid: activePeriod.user._id,
        username: activePeriod.user.username || '',
        email: activePeriod.user.email || '',
        lastName: activePeriod.user.lastName || '',
        firstName: activePeriod.user.firstName || '',
        middleName: activePeriod.user.middleName || '',
        age: activePeriod.user.age || null
      };
      period = {
        id: activePeriod._id,
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate
      };
    } else if (activeSession && activeSession.host) {
      permission = true;
      accessType = 'session';
      user = {
        uid: activeSession.host._id,
        username: activeSession.host.username || '',
        email: activeSession.host.email || '',
        lastName: activeSession.host.lastName || '',
        firstName: activeSession.host.firstName || '',
        middleName: activeSession.host.middleName || '',
        age: activeSession.host.age || null
      };
      session = {
        id: activeSession._id,
        sessionId: activeSession.sessionId
      };
    }
    
    return res.json({
      permission,
      accessType,
      id: device._id,
      key: device.key,
      user,
      period,
      session
    });
  } catch (error) {
    console.error('Ошибка проверки доступа:', error);
    res.status(500).json({ 
      permission: false, 
      reason: 'SERVER_ERROR',
      message: error.message 
    });
  }
});

// Список всех устройств
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find().sort({ createdAt: -1 });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения устройств' });
  }
});

// Обновить статус устройства
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const device = await Device.findByIdAndUpdate(
      req.params.id,
      { status, lastSeen: new Date() },
      { new: true }
    );
    res.json(device);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка обновления статуса' });
  }
});

module.exports = router;
