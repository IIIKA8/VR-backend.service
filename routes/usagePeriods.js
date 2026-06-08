// routes/usagePeriods.js
/**
 * @module routes/usagePeriods
 * @description Периоды использования VR. Префикс: `/api/usage-periods`.
 */
const express = require('express');
const UsagePeriod = require('../models/UsagePeriod');
const User = require('../models/User');
const Device = require('../models/Device');
const router = express.Router();

// Создать период пользования (можно по deviceId или key)
router.post('/', async (req, res) => {
  try {
    const { userId, deviceId, deviceKey, startDate, endDate, notes } = req.body;
    
    // Проверяем, что пользователь существует
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    // Находим устройство по deviceId или key
    let device = null;
    if (deviceKey) {
      device = await Device.findOne({ key: deviceKey });
    } else if (deviceId) {
      device = await Device.findById(deviceId);
    }
    
    if (!device) return res.status(404).json({ error: 'Устройство не найдено' });
    
    // Проверяем, что устройство свободно в этот период
    const conflicting = await UsagePeriod.findOne({
      device: device._id,
      status: 'active',
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });
    
    if (conflicting) {
      return res.status(400).json({ error: 'Устройство занято в этот период' });
    }
    
    const period = await UsagePeriod.create({
      user: userId,
      device: device._id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notes
    });
    
    await period.populate('user', 'username email fullName age');
    await period.populate('device', 'name deviceId key');
    
    res.status(201).json(period);
  } catch (error) {
    console.error('Ошибка создания периода:', error);
    res.status(400).json({ error: 'Ошибка создания периода', details: error.message });
  }
});

// Список периодов
router.get('/', async (req, res) => {
  try {
    const periods = await UsagePeriod.find()
      .populate('user', 'username email')
      .populate('device', 'name deviceId')
      .sort({ startDate: -1 });
    res.json(periods);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения периодов' });
  }
});

// Отменить период
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const period = await UsagePeriod.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledReason: reason || ''
      },
      { new: true }
    ).populate('user', 'username email').populate('device', 'name deviceId');
    
    res.json(period);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка отмены периода' });
  }
});

module.exports = router;
