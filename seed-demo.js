#!/usr/bin/env node
/**
 * seed-demo.js — единый демонстрационный сидер для защиты ВКР.
 *
 * Наполняет систему данными так, чтобы в браузере:
 *   - заполнилась шкала боли ВАШ (painBefore/painAfter) в кабинетах пациента и врача;
 *   - все графики (динамика балла и боли, средний балл по режимам, активность за 7 дней,
 *     упражнения по режимам) отображали данные;
 *   - можно было войти готовыми учётными записями врача и пациента.
 *
 * Создаёт:
 *   - врача (логин doctor_demo);
 *   - демо-пациентов с логинами (можно войти и сразу увидеть заполненные графики);
 *   - устройства, периоды использования, VR-сеансы за последние 7 дней;
 *   - историю VR-упражнений за ~28 дней (все 3 режима, тренд улучшения и снижения боли);
 *   - медицинские записи врача.
 *
 * Запуск (локально):           node seed-demo.js
 * Запуск в Docker:             docker compose exec app node seed-demo.js
 *
 * Переменные окружения:
 *   SEED_DOCTOR_PASSWORD   — пароль врача (по умолчанию doctor-demo-2024)
 *   SEED_PATIENT_PASSWORD  — пароль демо-пациентов (по умолчанию patient-demo-2024)
 *   SEED_PATIENT_LOGIN     — email или username существующего аккаунта: ему будут
 *                            назначены врач и история тренировок (чтобы графики
 *                            заполнились именно у вашего аккаунта).
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
const VRExerciseResult = require('./models/VRExerciseResult');

const PASSWORD_KEYLEN = 64;
const MODES = ['conveyor', 'tea', 'drum'];
const HANDS = ['left', 'right', 'both'];
const DAY = 86400000;

const DOCTOR_PASSWORD = process.env.SEED_DOCTOR_PASSWORD || 'doctor-demo-2024';
const PATIENT_PASSWORD = process.env.SEED_PATIENT_PASSWORD || 'patient-demo-2024';
const TARGET_LOGIN = (process.env.SEED_PATIENT_LOGIN || '').trim();

const rnd = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.round(rnd(min, max));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString('hex');
  return { passwordSalt: salt, passwordHash: hash };
}

// Метрики режима под «прогресс» p (0 — начало курса, 1 — конец курса)
function metricsFor(mode, p) {
  if (mode === 'conveyor') {
    const total = rndInt(16, 24);
    const correct = Math.min(total, Math.round(total * (0.5 + 0.45 * p)));
    const wrong = Math.min(total - correct, Math.round(total * 0.25 * (1 - p)));
    const missed = Math.max(0, total - correct - wrong);
    return { correct, wrong, missed };
  }
  if (mode === 'tea') {
    const targetTimeSec = 60;
    const completionTimeSec = Math.round(rnd(105, 115) - p * 55);
    return { targetTimeSec, completionTimeSec, completed: true };
  }
  const avgHitQuality = Math.min(100, Math.round(rnd(48, 56) + p * 38));
  const rhythmAccuracy = Math.min(100, Math.round(rnd(45, 55) + p * 40));
  return { avgHitQuality, rhythmAccuracy, totalHits: rndInt(30, 60) };
}

/**
 * История упражнений для одного пациента.
 * Гарантирует записи и в последние 7 дней (для дашборда и «за 7 дней»),
 * и более ранние (для общей динамики), охватывая все режимы.
 */
function buildResultsForPatient(patient, devices, count) {
  const docs = [];
  const now = Date.now();
  const COURSE_DAYS = 28;
  const n = count || rndInt(18, 26);

  for (let i = 0; i < n; i++) {
    const p = n > 1 ? i / (n - 1) : 1;
    // Распределяем по 28 дням; последняя четверть сессий — в пределах 7 дней
    let daysAgo;
    if (i >= n - 5) {
      daysAgo = rndInt(0, 6); // свежие тренировки (последняя неделя)
    } else {
      daysAgo = Math.round(COURSE_DAYS * (1 - p)) + rndInt(0, 1);
    }
    const startedAt = new Date(now - daysAgo * DAY - rndInt(0, 6) * 3600000);
    const durationSec = rndInt(180, 420);
    const endedAt = new Date(startedAt.getTime() + durationSec * 1000);

    // Каждый режим встречается гарантированно (по кругу) + случайные
    const mode = i < MODES.length ? MODES[i] : pick(MODES);

    // Боль по ВАШ: базовый уровень снижается, облегчение после сессии растёт
    const painBefore = Math.max(1, Math.round(7 - p * 2 + rnd(-0.5, 0.5)));
    const relief = Math.round(1 + p * 2 + rnd(0, 1));
    const painAfter = Math.max(0, painBefore - relief);

    docs.push({
      patient: patient._id,
      doctor: patient.assignedDoctor || null,
      device: devices.length ? pick(devices)._id : null,
      exerciseMode: mode,
      metrics: metricsFor(mode, p),
      painBefore,
      painAfter,
      hand: pick(HANDS),
      repetitions: rndInt(8, 30),
      comfortIssue: Math.random() < 0.08,
      durationSec,
      startedAt,
      endedAt
    });
  }
  return docs;
}

// VR-сеансы за последние 7 дней (для графика активности дашборда и сводки врача)
function buildSessionsForPatient(patient, devices) {
  const sessions = [];
  const now = Date.now();
  const count = rndInt(3, 6);
  for (let i = 0; i < count; i++) {
    const daysAgo = rndInt(0, 6);
    const startedAt = new Date(now - daysAgo * DAY - rndInt(0, 8) * 3600000);
    const durationMin = rndInt(8, 25);
    const ended = daysAgo > 0 || Math.random() < 0.6;
    const endedAt = ended ? new Date(startedAt.getTime() + durationMin * 60000) : null;
    sessions.push({
      sessionId: `demo_${patient._id}_${i}_${startedAt.getTime()}`,
      host: patient._id,
      device: devices.length ? pick(devices)._id : null,
      status: ended ? 'ended' : 'active',
      startedAt,
      endedAt,
      participants: [{
        user: patient._id,
        joinedAt: startedAt,
        position: { x: 0, y: 0, z: 0 },
        isActive: !ended
      }]
    });
  }
  return sessions;
}

async function ensureDoctor() {
  let doctor = await User.findOne({ username: 'doctor_demo' }).select('+isDoctor');
  if (doctor) {
    const creds = hashPassword(DOCTOR_PASSWORD);
    doctor.isDoctor = true;
    doctor.passwordSalt = creds.passwordSalt;
    doctor.passwordHash = creds.passwordHash;
    await doctor.save();
    console.log('♻️  Врач doctor_demo обновлён');
    return doctor;
  }
  doctor = await User.create({
    username: 'doctor_demo',
    email: 'doctor@rehab.local',
    lastName: 'Смирнов',
    firstName: 'Алексей',
    middleName: 'Петрович',
    age: 42,
    isDoctor: true,
    isAdmin: false,
    isPatient: false,
    ...hashPassword(DOCTOR_PASSWORD)
  });
  console.log('✅ Врач doctor_demo создан');
  return doctor;
}

const DEMO_PATIENTS = [
  {
    username: 'patient_demo',
    email: 'patient@rehab.local',
    lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович', age: 62,
    clinicalProfile: {
      conditionSummary: 'Ишемический инсульт, лёгкий левосторонний гемипарез. VR-тренировки моторики.',
      tags: ['post_stroke', 'motor']
    }
  },
  {
    username: 'patient_phantom',
    email: 'phantom@rehab.local',
    lastName: 'Петров', firstName: 'Пётр', middleName: 'Петрович', age: 58,
    clinicalProfile: {
      conditionSummary: 'Фантомные боли после ампутации нижней конечности. VR-терапия боли.',
      tags: ['phantom_limb']
    }
  },
  {
    username: 'patient_motor',
    email: 'motor@rehab.local',
    lastName: 'Сидорова', firstName: 'Анна', middleName: 'Олеговна', age: 55,
    clinicalProfile: {
      conditionSummary: 'Восстановление мелкой моторики кисти после инсульта.',
      tags: ['post_stroke', 'motor']
    }
  }
];

async function ensurePatient(spec, doctorId) {
  let patient = await User.findOne({ username: spec.username });
  if (patient) {
    patient.isPatient = true;
    patient.assignedDoctor = doctorId;
    patient.clinicalProfile = spec.clinicalProfile;
    const creds = hashPassword(PATIENT_PASSWORD);
    patient.passwordSalt = creds.passwordSalt;
    patient.passwordHash = creds.passwordHash;
    patient.lastSeen = new Date();
    await patient.save();
    return patient;
  }
  patient = await User.create({
    username: spec.username,
    email: spec.email,
    lastName: spec.lastName,
    firstName: spec.firstName,
    middleName: spec.middleName,
    age: spec.age,
    isOnline: Math.random() < 0.5,
    lastSeen: new Date(),
    isPatient: true,
    assignedDoctor: doctorId,
    clinicalProfile: spec.clinicalProfile,
    ...hashPassword(PATIENT_PASSWORD)
  });
  return patient;
}

async function ensureDevices() {
  const existing = await Device.find().select('_id').lean();
  if (existing.length >= 3) return existing;
  const specs = [
    { deviceId: 'VR-001', key: 'demo-key-001', name: 'Очки 1', status: 'active', firmwareVersion: '1.0.2' },
    { deviceId: 'VR-002', key: 'demo-key-002', name: 'Очки 2', status: 'active', firmwareVersion: '1.0.2' },
    { deviceId: 'VR-003', key: 'demo-key-003', name: 'Очки 3', status: 'maintenance', firmwareVersion: '1.0.1' }
  ];
  const created = [];
  for (const s of specs) {
    const found = await Device.findOne({ deviceId: s.deviceId });
    if (found) { created.push(found); continue; }
    created.push(await Device.create({ ...s, lastSeen: new Date() }));
  }
  console.log(`✅ Устройств готово: ${created.length}`);
  return created;
}

async function run() {
  const uri = resolveMongoUri();
  console.log('🔌 Подключение к MongoDB...', mongoUriForLog(uri));
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Подключено');

  const doctor = await ensureDoctor();
  const devices = await ensureDevices();

  // Демо-пациенты с логинами
  const patients = [];
  for (const spec of DEMO_PATIENTS) {
    patients.push(await ensurePatient(spec, doctor._id));
  }
  console.log(`✅ Демо-пациентов готово: ${patients.length}`);

  // Необязательно: привязать существующий аккаунт пользователя (его логин/почта)
  let targetUser = null;
  if (TARGET_LOGIN) {
    const login = TARGET_LOGIN;
    targetUser = await User.findOne({
      $or: [{ username: login }, { email: login.toLowerCase() }]
    });
    if (targetUser) {
      targetUser.isPatient = true;
      targetUser.assignedDoctor = doctor._id;
      if (!targetUser.clinicalProfile || !targetUser.clinicalProfile.conditionSummary) {
        targetUser.clinicalProfile = {
          conditionSummary: 'Демо-данные: VR-реабилитация (тестовый профиль).',
          tags: ['post_stroke']
        };
      }
      await targetUser.save();
      patients.push(targetUser);
      console.log(`🎯 Аккаунту "${login}" назначен врач и добавлена история тренировок`);
    } else {
      console.log(`⚠️  Аккаунт "${login}" не найден — пропускаю привязку`);
    }
  }

  const patientIds = patients.map((p) => p._id);

  // Чистим прежние демо-данные только для этих пациентов
  console.log('🧹 Очистка прежних результатов и демо-сеансов выбранных пациентов...');
  await VRExerciseResult.deleteMany({ patient: { $in: patientIds } });
  await VRSession.deleteMany({ host: { $in: patientIds } });

  // История упражнений (ВАШ + графики) и сеансы
  let allResults = [];
  let allSessions = [];
  for (const patient of patients) {
    allResults = allResults.concat(buildResultsForPatient(patient, devices));
    allSessions = allSessions.concat(buildSessionsForPatient(patient, devices));
  }
  await VRExerciseResult.create(allResults); // pre-save посчитает score/accuracy
  if (allSessions.length) await VRSession.insertMany(allSessions);
  console.log(`✅ Результатов упражнений: ${allResults.length}, VR-сеансов: ${allSessions.length}`);

  // Периоды использования (активные, чтобы устройства числились занятыми)
  const now = new Date();
  await UsagePeriod.deleteMany({ user: { $in: patientIds } });
  const periods = patients.slice(0, Math.min(patients.length, devices.length)).map((p, i) => ({
    user: p._id,
    device: devices[i % devices.length]._id,
    startDate: new Date(now.getTime() - 3 * DAY),
    endDate: new Date(now.getTime() + 7 * DAY),
    status: 'active'
  }));
  if (periods.length) await UsagePeriod.insertMany(periods);

  // Медицинские записи
  await MedicalNote.deleteMany({ patient: { $in: patientIds } });
  const notes = patients.map((p) => ({
    doctor: doctor._id,
    patient: p._id,
    body: 'Динамика положительная: балл по упражнениям растёт, уровень боли по ВАШ снижается. Продолжать курс VR-тренировок.'
  }));
  if (notes.length) await MedicalNote.insertMany(notes);

  // Сводка для проверки
  const painAgg = await VRExerciseResult.aggregate([
    { $match: { patient: { $in: patientIds } } },
    { $group: { _id: null, avgBefore: { $avg: '$painBefore' }, avgAfter: { $avg: '$painAfter' } } }
  ]);
  const pa = painAgg[0] || {};

  console.log('\n📊 Готово. Сводка:');
  console.log(`   Пациентов с данными: ${patients.length}`);
  console.log(`   Средняя боль ВАШ до: ${pa.avgBefore ? pa.avgBefore.toFixed(1) : '—'}, после: ${pa.avgAfter ? pa.avgAfter.toFixed(1) : '—'}`);
  console.log('\n🔑 Учётные данные для входа:');
  console.log(`   Врач:    doctor_demo / ${DOCTOR_PASSWORD}   (вход → /doctor)`);
  console.log(`   Пациент: patient_demo / ${PATIENT_PASSWORD}   (вход → /patient)`);
  console.log('   Ещё пациенты: patient_phantom, patient_motor (тот же пароль)');
  if (targetUser) {
    console.log(`   Ваш аккаунт "${TARGET_LOGIN}" теперь пациент с заполненными графиками.`);
  }

  await mongoose.connection.close();
  console.log('\n🔌 Соединение закрыто');
}

run()
  .then(() => { console.log('✨ Готово!'); process.exit(0); })
  .catch((e) => { console.error('❌ Ошибка:', e); process.exit(1); });
