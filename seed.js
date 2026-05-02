#!/usr/bin/env node
// seed.js - Скрипт для добавления тестовых данных

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Подключение моделей
const User = require('./models/User');
const Device = require('./models/Device');
const UsagePeriod = require('./models/UsagePeriod');
const VRSession = require('./models/VRSession');
const MedicalNote = require('./models/MedicalNote');

const PASSWORD_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString('hex');
}

// Подключение к MongoDB (используем тот же URI что и в server.js)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vr-app';

async function seed() {
  try {
    console.log('🔌 Подключение к MongoDB...');
    console.log('📊 URI:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@')); // Скрываем пароль в логах
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Подключено к MongoDB');

    // Очистка существующих данных (опционально - можно закомментировать)
    console.log('\n🧹 Очистка старых данных...');
    try {
      await MedicalNote.deleteMany({});
      await User.deleteMany({});
      await Device.deleteMany({});
      await UsagePeriod.deleteMany({});
      await VRSession.deleteMany({});
      console.log('✅ Данные очищены');
    } catch (cleanError) {
      console.log('⚠️  Не удалось очистить данные (возможно, нет прав или данных нет):', cleanError.message);
      console.log('📝 Продолжаем без очистки...');
    }

    // Лечащий врач (кабинет /doctor) — пароль из SEED_DOCTOR_PASSWORD или по умолчанию
    console.log('\n👨‍⚕️ Создание учётной записи врача...');
    const doctorSalt = crypto.randomBytes(16).toString('hex');
    const doctorPlainPassword = process.env.SEED_DOCTOR_PASSWORD || 'doctor-demo-2024';
    const doctorHash = hashPassword(doctorPlainPassword, doctorSalt);
    const doctor = await User.create({
      username: 'doctor_demo',
      email: 'doctor@rehab.local',
      lastName: 'Смирнов',
      firstName: 'Алексей',
      middleName: 'Петрович',
      age: 42,
      isDoctor: true,
      isAdmin: false,
      isPatient: false,
      passwordSalt: doctorSalt,
      passwordHash: doctorHash
    });
    console.log(`✅ Врач: ${doctor.username} / ${doctorPlainPassword} (смените пароль в проде)`);

    // Пациенты реабилитации, закреплённые за врачом
    console.log('\n👥 Создание пациентов...');
    const users = await User.insertMany([
      {
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: 'Иванович',
        age: 62,
        isOnline: true,
        lastSeen: new Date(),
        isPatient: true,
        assignedDoctor: doctor._id,
        clinicalProfile: {
          conditionSummary: 'Ишемический инсульт в прошлом году, лёгкая хемипарез слева.',
          tags: ['post_stroke']
        }
      },
      {
        lastName: 'Петров',
        firstName: 'Петр',
        middleName: 'Петрович',
        age: 58,
        isOnline: false,
        lastSeen: new Date(Date.now() - 3600000),
        isPatient: true,
        assignedDoctor: doctor._id,
        clinicalProfile: {
          conditionSummary: 'Фантомные боли после ампутации нижней конечности.',
          tags: ['phantom_limb']
        }
      },
      {
        lastName: 'Сидоров',
        firstName: 'Сидор',
        middleName: 'Сидорович',
        age: 55,
        isOnline: true,
        lastSeen: new Date(),
        isPatient: true,
        assignedDoctor: doctor._id,
        clinicalProfile: { conditionSummary: 'Восстановление моторики кисти.', tags: ['post_stroke', 'motor'] }
      },
      {
        lastName: 'Кулькоя',
        firstName: 'Александр',
        middleName: 'Дмитриевич',
        age: 49,
        isOnline: true,
        lastSeen: new Date(),
        isPatient: true,
        assignedDoctor: doctor._id,
        clinicalProfile: { tags: ['post_stroke'] }
      },
      {
        lastName: 'Палин',
        firstName: 'Дмитрий',
        middleName: 'Иванович',
        age: 67,
        isOnline: false,
        lastSeen: new Date(Date.now() - 7200000),
        isPatient: true,
        assignedDoctor: doctor._id,
        clinicalProfile: { conditionSummary: 'Под наблюдением, VR-тренировки моторики.', tags: ['post_stroke'] }
      }
    ]);
    console.log(`✅ Создано ${users.length} пациентов (закреплены за ${doctor.username})`);

    await MedicalNote.create({
      doctor: doctor._id,
      patient: users[1]._id,
      body: 'Первичный осмотр: жалобы на фантомные боли 4–6 по шкале. Рекомендованы сеансы VR.'
    });

    // Создание тестовых устройств
    console.log('\n🥽 Создание тестовых устройств...');
    const devices = await Device.insertMany([
      {
        deviceId: 'VR-001',
        key: 'f1k3-7n1t-abc123',
        name: 'Очки 1',
        status: 'active',
        lastSeen: new Date(),
        firmwareVersion: '1.0.0'
      },
      {
        deviceId: 'VR-002',
        key: 'f1k3-7n1t-def456',
        name: 'Очки 2',
        status: 'active',
        lastSeen: new Date(),
        firmwareVersion: '1.0.1'
      },
      {
        deviceId: 'VR-003',
        key: 'f1k3-7n1t-ghi789',
        name: 'Очки 3',
        status: 'maintenance',
        lastSeen: new Date(Date.now() - 86400000), // день назад
        firmwareVersion: '1.0.0'
      },
      {
        deviceId: 'VR-004',
        key: 'f1k3-7n1t-jkl012',
        name: 'Очки 4',
        status: 'active',
        lastSeen: new Date(),
        firmwareVersion: '1.0.2'
      }
    ]);
    console.log(`✅ Создано ${devices.length} устройств`);

    // Создание тестовых периодов использования
    console.log('\n📅 Создание тестовых периодов использования...');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    
    const periods = await UsagePeriod.insertMany([
      {
        user: users[0]._id,
        device: devices[0]._id,
        startDate: now,
        endDate: tomorrow,
        status: 'active'
      },
      {
        user: users[1]._id,
        device: devices[1]._id,
        startDate: now,
        endDate: nextWeek,
        status: 'active'
      },
      {
        user: users[2]._id,
        device: devices[3]._id,
        startDate: tomorrow,
        endDate: nextWeek,
        status: 'active'
      }
    ]);
    console.log(`✅ Создано ${periods.length} периодов использования`);

    // Создание тестовых сессий
    console.log('\n🎮 Создание тестовых сессий...');
    const sessions = await VRSession.insertMany([
      {
        sessionId: `session_${Date.now()}_001`,
        host: users[0]._id,
        device: devices[0]._id,
        status: 'active',
        startedAt: new Date(),
        participants: [
          {
            user: users[0]._id,
            joinedAt: new Date(),
            position: { x: 0, y: 0, z: 0 },
            isActive: true
          }
        ]
      },
      {
        sessionId: `session_${Date.now()}_002`,
        host: users[2]._id,
        device: devices[3]._id,
        status: 'active',
        startedAt: new Date(Date.now() - 1800000), // 30 минут назад
        participants: [
          {
            user: users[2]._id,
            joinedAt: new Date(Date.now() - 1800000),
            position: { x: 10, y: 5, z: -3 },
            isActive: true
          },
          {
            user: users[3]._id,
            joinedAt: new Date(Date.now() - 900000), // 15 минут назад
            position: { x: -5, y: 2, z: 8 },
            isActive: true
          }
        ]
      }
    ]);
    console.log(`✅ Создано ${sessions.length} сессий`);

    // Итоговая статистика
    console.log('\n📊 Итоговая статистика:');
    console.log(`   👥 Пользователей: ${await User.countDocuments()}`);
    console.log(`   🟢 Онлайн: ${await User.countDocuments({ isOnline: true })}`);
    console.log(`   🥽 Устройств: ${await Device.countDocuments()}`);
    console.log(`   ⚡ Активных устройств: ${await Device.countDocuments({ status: 'active' })}`);
    console.log(`   📅 Периодов использования: ${await UsagePeriod.countDocuments()}`);
    console.log(`   🎮 Активных сессий: ${await VRSession.countDocuments({ status: 'active' })}`);

    console.log('\n✅ Тестовые данные успешно добавлены!');
    console.log('\n📋 Созданные данные:');
    console.log('\n👥 Пользователи:');
    users.forEach((u, i) => {
      const name = [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ');
      console.log(`   ${i + 1}. ${name} (${u.age} лет) - ${u.isOnline ? '🟢 онлайн' : '⚪ оффлайн'}`);
    });
    
    console.log('\n🥽 Устройства:');
    devices.forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.name} (${d.deviceId}) - Ключ: ${d.key} - ${d.status}`);
    });

    console.log('\n📅 Периоды использования:');
    for (const period of periods) {
      const user = users.find(u => u._id.toString() === period.user.toString());
      const device = devices.find(d => d._id.toString() === period.device.toString());
      const userName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
      console.log(`   - ${userName} → ${device.name} (${period.startDate.toLocaleDateString('ru-RU')} - ${period.endDate.toLocaleDateString('ru-RU')})`);
    }

    console.log('\n🎮 Сессии:');
    sessions.forEach((s, i) => {
      const host = users.find(u => u._id.toString() === s.host.toString());
      const hostName = [host.lastName, host.firstName, host.middleName].filter(Boolean).join(' ');
      console.log(`   ${i + 1}. ${s.sessionId} - Хост: ${hostName} - Участников: ${s.participants.length}`);
    });

  } catch (error) {
    console.error('❌ Ошибка при добавлении тестовых данных:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Соединение с MongoDB закрыто');
  }
}

// Запуск
seed()
  .then(() => {
    console.log('\n✨ Готово!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Критическая ошибка:', error);
    process.exit(1);
  });
