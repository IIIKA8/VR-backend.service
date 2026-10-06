/**
 * @module routes/licenses
 * @description Лицензии, выдача админом, валидация, purge. Префикс: `/api/licenses`.
 */
const express = require('express');
const crypto = require('crypto');
const License = require('../models/License');
const User = require('../models/User');
const { Types } = require('mongoose');
const isObjectId = (v) => Types.ObjectId.isValid(v);
const { verifyLicensePurgePassword } = require('../util/licensePurgeAuth');

const router = express.Router();

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без O, I, 0, 1
function generateKey() {
  let raw = '';
  for (let i = 0; i < 20; i++) {
    raw += KEY_ALPHABET[crypto.randomInt(0, KEY_ALPHABET.length)];
  }
  return raw.match(/.{1,5}/g).join('-'); // XXXXX-XXXXX-XXXXX-XXXXX
}

// Выдать лицензию (сессионную или периодическую) - для админки
router.post('/issue-admin', async (req, res) => {
  try {
    console.log(`[ADMIN][${new Date().toISOString()}] /licenses/issue-admin: Body:`, JSON.stringify(req.body, null, 2));
    const { deviceId, userId, isSession, startDate, endDate } = req.body;
    
    if (!deviceId || !userId) {
      return res.status(400).json({ error: 'deviceId и userId обязательны' });
    }
    
    const Device = require('../models/Device');
    const VRSession = require('../models/VRSession');
    const UsagePeriod = require('../models/UsagePeriod');

    // Проверяем устройство
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }
    
    // Проверяем пользователя
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    let result = null;
    
    if (isSession) {
      // Создаём сессионный доступ
      const session = await VRSession.create({
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        host: userId,
        device: deviceId, // связь устройства!
        status: 'active',
        scene: null, 
        startedAt: new Date()
      });
      
      // Связываем устройство с сессией 
      result = {
        type: 'session',
        id: session._id,
        sessionId: session.sessionId,
        device: device,
        user: user,
        createdAt: session.createdAt
      };
      } else {
      // Создаём периодический доступ
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Для периодического доступа нужны startDate и endDate' });
      }
      
      // Проверяем конфликты
      const conflicting = await UsagePeriod.findOne({
        device: deviceId,
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
        device: deviceId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'active'
      });
      
      await period.populate('user', 'lastName firstName middleName age');
      await period.populate('device', 'name deviceId key');
      
      result = {
        type: 'period',
        id: period._id,
        device: period.device,
        user: period.user,
        startDate: period.startDate,
        endDate: period.endDate,
        createdAt: period.createdAt
      };
    }
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Ошибка выдачи лицензии:', error);
    res.status(400).json({ error: 'Ошибка выдачи лицензии', details: error.message });
  }
});

// Получить все лицензии для админки (сессионные + периодические)
router.get('/admin/all', async (req, res) => {
  try {
    const VRSession = require('../models/VRSession');
    const UsagePeriod = require('../models/UsagePeriod');
    const Device = require('../models/Device');
    
    // Получаем сессионные лицензии
    const sessions = await VRSession.find({ status: 'active' })
      .populate('host', 'lastName firstName middleName age')
      .populate('device', 'name deviceId key')
      .sort({ createdAt: -1 });
    
    // Получаем периодические лицензии
    const periods = await UsagePeriod.find({ status: 'active' })
      .populate('user', 'lastName firstName middleName age')
      .populate('device', 'name deviceId key')
      .sort({ createdAt: -1 });
    
    // Формируем единый список
    const licenses = [
      ...sessions.map(s => ({
        code: s.sessionId,
        type: 'Сессия',
        lastName: s.host?.lastName || '',
        firstName: s.host?.firstName || '',
        middleName: s.host?.middleName || '',
        age: s.host?.age || null,
        deviceId: s.device?._id || null,
        deviceName: s.device?.name || '',
        startDate: null,
        endDate: null,
        createdAt: s.createdAt,
        _id: s._id,
        _type: 'session'
      })),
      ...periods.map(p => ({
        code: `PERIOD-${p._id}`,
        type: 'Период',
        lastName: p.user?.lastName || '',
        firstName: p.user?.firstName || '',
        middleName: p.user?.middleName || '',
        age: p.user?.age || null,
        deviceId: p.device?._id || null,
        deviceName: p.device?.name || '',
        startDate: p.startDate,
        endDate: p.endDate,
        createdAt: p.createdAt,
        _id: p._id,
        _type: 'period'
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`[ADMIN][${new Date().toISOString()}] /licenses/admin/all: Licenses:`, JSON.stringify(licenses, null, 2));
    res.json(licenses);
  } catch (error) {
    console.error('Ошибка получения лицензий:', error);
    res.status(500).json({ error: 'Ошибка получения лицензий', details: error.message });
  }
    });

// Удалить лицензию (сессионную или периодическую)
router.delete('/admin/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    if (type === 'session') {
      const VRSession = require('../models/VRSession');
      const session = await VRSession.findByIdAndUpdate(id, { status: 'ended', endedAt: new Date() }, { new: true });
      if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
      console.log(`[ADMIN][${new Date().toISOString()}] /licenses/admin/:type/:id: Deleted:`, JSON.stringify(session, null, 2));
      res.json({ success: true, message: 'Сессия завершена' });
    } else if (type === 'period') {
      const UsagePeriod = require('../models/UsagePeriod');
      const period = await UsagePeriod.findByIdAndUpdate(
        id,
        { status: 'cancelled', cancelledAt: new Date() },
        { new: true }
      );
      if (!period) return res.status(404).json({ error: 'Период не найден' });
      console.log(`[ADMIN][${new Date().toISOString()}] /licenses/admin/:type/:id: Deleted:`, JSON.stringify(period, null, 2));
      res.json({ success: true, message: 'Период отменён' });
    } else {
      res.status(400).json({ error: 'Неверный тип лицензии' });
    }
  } catch (error) {
    console.error('Ошибка удаления лицензии:', error);
    res.status(500).json({ error: 'Ошибка удаления лицензии', details: error.message });
  }
});

// Отозвать лицензию
router.post('/revoke', async (req, res) => {
  try {
    const { key, reason = '' } = req.body;
    const license = await License.findOne({ key });
    if (!license) return res.status(404).json({ error: 'Лицензия не найдена' });
    license.status = 'revoked';
    license.revokedAt = new Date();
    license.revokedReason = reason;
    await license.save();
    res.json(license);
  } catch (e) {
    res.status(400).json({ error: 'Ошибка отзыва лицензии' });
  }
});

// Список лицензий (по userId или email)
router.get('/', async (req, res) => {
  try {
    const { userId, email } = req.query;
    let filter = {};
    if (userId) filter.user = userId;
    if (email) {
      const user = await User.findOne({ email });
      filter.user = user ? user._id : null;
    }
    const licenses = await License.find(filter).populate('user', 'username email').sort({ createdAt: -1 });
    console.log(`[ADMIN][${new Date().toISOString()}] /licenses/: Licenses:`, JSON.stringify(licenses, null, 2));
    res.json(licenses);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка получения лицензий' });
  }
});

// Валидация лицензии (Godot-клиент)
router.post('/validate', async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    if (!key) return res.status(400).json({ valid: false, reason: 'NO_KEY' });

    const lic = await License.findOne({ key }).populate('user', 'username email isOnline');
    if (!lic) return res.status(404).json({ valid: false, reason: 'NOT_FOUND' });

    if (lic.status === 'revoked') return res.status(403).json({ valid: false, reason: 'REVOKED' });
    if (lic.isExpired()) {
      lic.status = 'expired';
      await lic.save();
      return res.status(403).json({ valid: false, reason: 'EXPIRED' });
    }

    // Проверка устройств
    if (deviceId) {
      const idx = lic.devices.findIndex(d => d.deviceId === deviceId);
      if (idx === -1) {
        if (lic.devices.length >= lic.maxDevices) {
          return res.status(403).json({ valid: false, reason: 'DEVICES_LIMIT' });
        }
        lic.devices.push({ deviceId, lastSeen: new Date() });
      } else {
        lic.devices[idx].lastSeen = new Date();
      }
    }

    lic.lastValidatedAt = new Date();
    await lic.save();

    res.json({
      valid: true,
      user: { id: lic.user._id, username: lic.user.username, email: lic.user.email },
      key: lic.key,
      expiresAt: lic.expiresAt,
      status: lic.status,
      devices: lic.devices,
      maxDevices: lic.maxDevices
    });
  } catch (e) {
    res.status(500).json({ valid: false, reason: 'SERVER_ERROR' });
  }
});

// Удалить ЛИЦЕНЗИЮ полностью по ключу (безвозвратно)
router.delete('/purge/key/:key', async (req, res) => {
  try {
    const { admin_password } = req.body || {};
    const purgeAuth = verifyLicensePurgePassword(admin_password);
    if (!purgeAuth.ok) {
      return res.status(purgeAuth.status).json({ error: purgeAuth.error });
    }
    const { key } = req.params;
    const del = await License.deleteOne({ key });
    if (del.deletedCount === 0) return res.status(404).json({ error: 'not_found' });
    console.log(`[ADMIN][${new Date().toISOString()}] /licenses/purge/key/:key: Deleted:`, JSON.stringify(del, null, 2));
    res.json({ ok: true, deleted: 1, key });
  } catch (e) {
    res.status(500).json({ error: 'purge_failed' });
  }
});

// Удалить ВСЕ лицензии пользователя (email | userId(ObjectId) | username)
router.delete('/purge/user', async (req, res) => {
  try {
    const { admin_password, email, userId } = req.body || {};
    const purgeAuth = verifyLicensePurgePassword(admin_password);
    if (!purgeAuth.ok) {
      return res.status(purgeAuth.status).json({ error: purgeAuth.error });
    }

    let user = null;
    // userId может быть ObjectId или username/email строкой
    if (userId) {
      if (isObjectId(userId)) {
        user = await User.findById(userId);
      } else {
        user = await User.findOne({
          $or: [{ username: userId }, { email: ('' + userId).toLowerCase() }],
        });
      }
    }
    if (!user && email) {
      user = await User.findOne({ email: ('' + email).toLowerCase() });
    }
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const del = await License.deleteMany({ user: user._id });
    console.log(`[ADMIN][${new Date().toISOString()}] /licenses/purge/user: Deleted:`, JSON.stringify(del, null, 2));
    return res.json({ ok: true, deleted: del.deletedCount, user: String(user._id) });
  } catch (e) {
    console.error('PURGE USER error:', e);
    return res.status(500).json({ error: 'purge_failed' });
  }
});

module.exports = router;
