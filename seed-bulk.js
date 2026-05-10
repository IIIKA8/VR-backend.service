#!/usr/bin/env node
/**
 * Массовое заполнение БД тестовыми данными.
 *
 * Переменные окружения (все необязательны):
 *   MONGODB_URI           — как в server.js (по умолчанию mongodb://localhost:27017/vr-app)
 *   SEED_DOCTOR_PASSWORD  — пароль врача (как в seed.js), по умолчанию doctor-demo-2024
 *   BULK_PATIENTS         — число пациентов (по умолчанию 200)
 *   BULK_DEVICES          — устройств (80)
 *   BULK_SCENES           — VR-сцен (60)
 *   BULK_LICENSES         — лицензий (не больше числа пользователей с лицензией; по умолчанию min(пациенты, 180))
 *   BULK_PERIODS          — периодов использования (400)
 *   BULK_SESSIONS         — VR-сессий (450)
 *   BULK_NOTES            — мед. записей (600)
 *   SEED_BULK_APPEND      — если "1" / "true", не очищать коллекции перед вставкой
 *
 * Запуск: node seed-bulk.js
 *         npm run seed:bulk
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { resolveMongoUri, mongoUriForLog } = require('./util/mongoUri');

const User = require('./models/User');
const Device = require('./models/Device');
const UsagePeriod = require('./models/UsagePeriod');
const VRSession = require('./models/VRSession');
const MedicalNote = require('./models/MedicalNote');
const VRScene = require('./models/VRScene');
const License = require('./models/License');

const PASSWORD_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString('hex');
}

const MONGODB_URI = resolveMongoUri();

const APPEND = ['1', 'true', 'yes'].includes(
  String(process.env.SEED_BULK_APPEND || '').toLowerCase()
);

function num(envKey, fallback) {
  const v = process.env[envKey];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const COUNTS = {
  patients: Math.max(1, num('BULK_PATIENTS', 200)),
  devices: Math.max(1, num('BULK_DEVICES', 80)),
  scenes: Math.max(0, num('BULK_SCENES', 60)),
  licenses: Math.max(0, num('BULK_LICENSES', Math.min(num('BULK_PATIENTS', 200), 180))),
  periods: Math.max(0, num('BULK_PERIODS', 400)),
  sessions: Math.max(0, num('BULK_SESSIONS', 450)),
  notes: Math.max(0, num('BULK_NOTES', 600))
};

const LN = [
  'Иванов', 'Петров', 'Сидоров', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соколов',
  'Лебедев', 'Кузнецов', 'Попов', 'Васильев', 'Семёнов', 'Голубев', 'Виноградов',
  'Богданов', 'Воробьёв', 'Фёдоров', 'Михайлов', 'Белов', 'Тарасов', 'Белов', 'Комаров',
  'Орлов', 'Киселёв', 'Макаров', 'Андреев', 'Ковалёв', 'Ильин', 'Гусев', 'Зайцев'
];
const FN = [
  'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Иван', 'Кирилл',
  'Михаил', 'Никита', 'Матвей', 'Роман', 'Егор', 'Артём', 'Илья', 'Тимофей', 'Владислав'
];
const MN = ['Иванович', 'Петрович', 'Александрович', 'Сергеевич', 'Дмитриевич', 'Николаевич'];

const TAG_POOL = ['post_stroke', 'phantom_limb', 'motor', 'balance', 'cognitive', 'pain_mgmt'];
const OBJ_TYPES = ['cube', 'sphere', 'plane', 'model', 'light', 'audio'];
const SESSION_STATUSES = ['waiting', 'active', 'paused', 'ended'];
const PERIOD_STATUSES = ['active', 'completed', 'cancelled'];
const LICENSE_STATUSES = ['active', 'revoked', 'expired'];
const DEVICE_STATUSES = ['active', 'maintenance', 'offline'];

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}

function pickTags() {
  const n = 1 + Math.floor(Math.random() * 3);
  const tags = [];
  for (let i = 0; i < n; i++) tags.push(pick(TAG_POOL));
  return [...new Set(tags)];
}

function randDate(from, to) {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function makeSceneObjects(seed) {
  const count = 2 + (seed % 4);
  const objects = [];
  for (let i = 0; i < count; i++) {
    const t = OBJ_TYPES[(seed + i) % OBJ_TYPES.length];
    objects.push({
      id: `obj_${seed}_${i}`,
      type: t,
      position: {
        x: Math.round((Math.random() - 0.5) * 20 * 10) / 10,
        y: Math.round(Math.random() * 5 * 10) / 10,
        z: Math.round((Math.random() - 0.5) * 20 * 10) / 10
      },
      rotation: { x: 0, y: Math.round(Math.random() * 360), z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {
        color: `#${((seed + i) * 9991).toString(16).slice(-6).padStart(6, '0')}`,
        physics:
          t === 'cube' || t === 'sphere'
            ? {
                enabled: Math.random() > 0.3,
                mass: Math.round(Math.random() * 5 * 10) / 10,
                friction: Math.round(Math.random() * 10) / 10,
                restitution: Math.round(Math.random() * 10) / 10
              }
            : undefined
      }
    });
  }
  return objects;
}

async function bulkSeed() {
  const t0 = Date.now();
  console.log('Подключение к MongoDB:', mongoUriForLog(MONGODB_URI));
  await mongoose.connect(MONGODB_URI);

  if (!APPEND) {
    console.log('Очистка коллекций...');
    await MedicalNote.deleteMany({});
    await VRSession.deleteMany({});
    await UsagePeriod.deleteMany({});
    await License.deleteMany({});
    await VRScene.deleteMany({});
    await Device.deleteMany({});
    await User.deleteMany({});
  }

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
    isPatient: false,
    passwordSalt: doctorSalt,
    passwordHash: doctorHash
  });

  const patientDocs = [];
  for (let i = 0; i < COUNTS.patients; i++) {
    const sn = pick(LN);
    const fn = pick(FN);
    const mn = pick(MN);
    patientDocs.push({
      username: `patient_bulk_${i}`,
      email: `patient_bulk_${i}@test.vr.local`,
      lastName: sn,
      firstName: fn,
      middleName: mn,
      age: 35 + Math.floor(Math.random() * 45),
      isPatient: true,
      assignedDoctor: doctor._id,
      isOnline: Math.random() > 0.65,
      lastSeen: randDate(new Date(Date.now() - 14 * 86400000), new Date()),
      clinicalProfile: {
        conditionSummary:
          Math.random() > 0.2
            ? `Наблюдение №${i}: показатели в норме / на контроле.`
            : '',
        tags: pickTags()
      }
    });
  }

  const patients = await User.insertMany(patientDocs);
  const patientIds = patients.map((p) => p._id);

  const deviceDocs = [];
  for (let i = 0; i < COUNTS.devices; i++) {
    deviceDocs.push({
      deviceId: `VR-BULK-${String(i).padStart(4, '0')}`,
      key: `bk-${crypto.randomBytes(9).toString('hex')}`,
      name: `Очки ${i + 1}`,
      status: pick(DEVICE_STATUSES),
      lastSeen: randDate(new Date(Date.now() - 30 * 86400000), new Date()),
      firmwareVersion: `${1 + (i % 3)}.${i % 10}.${i % 5}`,
      notes: i % 7 === 0 ? 'Периодическое ТО' : ''
    });
  }
  const devices = await Device.insertMany(deviceDocs);
  const deviceIds = devices.map((d) => d._id);

  const sceneDocs = [];
  const owners = [doctor._id, ...patientIds].sort(() => Math.random() - 0.5);
  for (let i = 0; i < COUNTS.scenes; i++) {
    const owner = owners[i % owners.length];
    sceneDocs.push({
      name: `Сцена реабилитации ${i + 1}`,
      description: `Тестовая среда #${i + 1}: упражнения на координацию и баланс.`,
      owner,
      environment: {
        skybox: i % 5 === 0 ? 'textures/sky_clear.hdr' : null,
        lighting: pick(['day', 'night', 'custom']),
        gravity: -9.81 + (Math.random() - 0.5) * 0.2
      },
      objects: makeSceneObjects(i),
      isPublic: Math.random() > 0.55,
      maxUsers: 5 + Math.floor(Math.random() * 16),
      currentUsers: []
    });
  }
  const scenes = await VRScene.insertMany(sceneDocs);
  const sceneIds = scenes.map((s) => s._id);

  const licenseTargetUsers = [...patientIds].sort(() => Math.random() - 0.5);
  const nLicenses = Math.min(COUNTS.licenses, licenseTargetUsers.length);
  const licenseDocs = [];
  for (let i = 0; i < nLicenses; i++) {
    const u = licenseTargetUsers[i];
    const devEmbedded = [];
    const nd = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < nd; j++) {
      const d = devices[(i + j) % devices.length];
      devEmbedded.push({
        deviceId: d.deviceId,
        lastSeen: d.lastSeen || new Date()
      });
    }
    const expired = Math.random() > 0.92;
    licenseDocs.push({
      key: `LIC-BULK-${Date.now()}-${i}-${crypto.randomBytes(4).toString('hex')}`,
      user: u,
      status: pick(LICENSE_STATUSES),
      expiresAt:
        expired
          ? new Date(Date.now() - 86400000 * (1 + Math.floor(Math.random() * 30)))
          : new Date(Date.now() + 86400000 * (30 + Math.floor(Math.random() * 330))),
      notes: i % 11 === 0 ? 'Массовый тестовый выпуск' : '',
      createdBy: 'seed-bulk',
      maxDevices: 2 + Math.floor(Math.random() * 3),
      devices: devEmbedded,
      lastValidatedAt: randDate(new Date(Date.now() - 7 * 86400000), new Date())
    });
  }
  await License.insertMany(licenseDocs);

  const periodDocs = [];
  const now = new Date();
  for (let i = 0; i < COUNTS.periods; i++) {
    const start = randDate(new Date(now.getTime() - 60 * 86400000), new Date(now.getTime() + 7 * 86400000));
    const end = new Date(start.getTime() + (1 + Math.floor(Math.random() * 45)) * 86400000);
    periodDocs.push({
      user: pick(patientIds),
      device: pick(deviceIds),
      startDate: start,
      endDate: end,
      status: pick(PERIOD_STATUSES),
      createdBy: 'seed-bulk',
      notes: i % 13 === 0 ? 'Авто-сгенерированный период' : ''
    });
  }
  await UsagePeriod.insertMany(periodDocs);

  const sessionDocs = [];
  const baseTs = Date.now();
  for (let i = 0; i < COUNTS.sessions; i++) {
    const host = pick(patientIds);
    const status = pick(SESSION_STATUSES);
    const withScene = Math.random() > 0.25;
    const withDevice = Math.random() > 0.15;
    const nPart = 1 + Math.floor(Math.random() * 4);
    const participants = [];
    for (let p = 0; p < nPart; p++) {
      participants.push({
        user: pick(patientIds),
        joinedAt: randDate(new Date(baseTs - 86400000), new Date()),
        position: {
          x: Math.round((Math.random() - 0.5) * 30),
          y: Math.round(Math.random() * 10),
          z: Math.round((Math.random() - 0.5) * 30)
        },
        rotation: { x: 0, y: Math.round(Math.random() * 360), z: 0 },
        isActive: status === 'active' || status === 'paused'
      });
    }
    sessionDocs.push({
      sessionId: `bulk_sess_${baseTs}_${i}_${crypto.randomBytes(3).toString('hex')}`,
      scene: withScene ? pick(sceneIds) : undefined,
      host,
      device: withDevice ? pick(deviceIds) : undefined,
      participants,
      status,
      startedAt: randDate(new Date(baseTs - 3 * 86400000), new Date()),
      endedAt: status === 'ended' ? new Date() : null,
      settings: {
        allowVoiceChat: Math.random() > 0.2,
        allowHandTracking: Math.random() > 0.15,
        maxParticipants: 5 + Math.floor(Math.random() * 20)
      }
    });
  }
  await VRSession.insertMany(sessionDocs);

  const noteBodies = [
    'Динамика положительная, переносимость VR хорошая.',
    'Жалобы на дискомфорт при длительной сессии — сократить время.',
    'Рекомендовано 3 сеанса в неделю по 20 минут.',
    'Оценка боли до 3/10, продолжить курс.',
    'Коррекция нагрузки, повторный осмотр через 2 недели.'
  ];
  const noteDocs = [];
  for (let i = 0; i < COUNTS.notes; i++) {
    noteDocs.push({
      doctor: doctor._id,
      patient: pick(patientIds),
      body: `${pick(noteBodies)} (запись #${i + 1})`
    });
  }
  await MedicalNote.insertMany(noteDocs);

  const ms = Date.now() - t0;
  console.log('\n=== Готово ===');
  console.log(`Врач: doctor_demo / ${doctorPlainPassword}`);
  console.log(`Пациенты: ${patients.length}`);
  console.log(`Устройства: ${devices.length}`);
  console.log(`Сцены: ${scenes.length}`);
  console.log(`Лицензии: ${nLicenses}`);
  console.log(`Периоды: ${periodDocs.length}`);
  console.log(`Сессии: ${sessionDocs.length}`);
  console.log(`Мед. записи: ${noteDocs.length}`);
  console.log(`Время: ${ms} мс`);
  console.log(APPEND ? '(режим APPEND — старые данные не удалялись)' : '');

  await mongoose.connection.close();
}

bulkSeed().catch((err) => {
  console.error(err);
  process.exit(1);
});
