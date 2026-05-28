#!/usr/bin/env node
// seed-results.js — демо-результаты VR-упражнений для пациентов.
// Генерирует историю тренировок (Конвейер / Чай / Барабан) с трендом
// улучшения: рост балла и снижение уровня боли по шкале ВАШ.
//
// Запуск: node seed-results.js  (после seed.js, когда пациенты уже созданы)

require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, mongoUriForLog } = require('./util/mongoUri');

const User = require('./models/User');
const Device = require('./models/Device');
const VRExerciseResult = require('./models/VRExerciseResult');

const MODES = ['conveyor', 'tea', 'drum'];
const HANDS = ['left', 'right', 'both'];

const rnd = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.round(rnd(min, max));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Метрики режима под заданный «прогресс» p (0 — начало курса, 1 — конец)
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
    const completionTimeSec = Math.round(rnd(105, 115) - p * 55); // 110 → ~55
    return { targetTimeSec, completionTimeSec, completed: true };
  }
  // drum
  const avgHitQuality = Math.round(rnd(48, 56) + p * 38); // ~52 → ~92
  const rhythmAccuracy = Math.round(rnd(45, 55) + p * 40);
  return { avgHitQuality: Math.min(100, avgHitQuality), rhythmAccuracy: Math.min(100, rhythmAccuracy), totalHits: rndInt(30, 60) };
}

async function run() {
  const uri = resolveMongoUri();
  console.log('🔌 Подключение к MongoDB...', mongoUriForLog(uri));
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Подключено');

  const patients = await User.find({ isPatient: true })
    .select('_id assignedDoctor lastName firstName')
    .lean();

  if (!patients.length) {
    console.log('⚠️  Пациенты не найдены. Сначала запустите seed.js.');
    await mongoose.connection.close();
    return;
  }

  const devices = await Device.find().select('_id').lean();

  console.log('🧹 Очистка прежних результатов VRExerciseResult...');
  await VRExerciseResult.deleteMany({});

  const docs = [];
  const now = Date.now();
  const COURSE_DAYS = 28;

  for (const patient of patients) {
    const sessionsCount = rndInt(14, 22); // тренировок за курс
    for (let i = 0; i < sessionsCount; i++) {
      // p: 0 (давно) → 1 (недавно) — прогресс улучшается со временем
      const p = sessionsCount > 1 ? i / (sessionsCount - 1) : 1;
      const daysAgo = Math.round(COURSE_DAYS * (1 - p)) + rndInt(0, 1);
      const startedAt = new Date(now - daysAgo * 86400000 - rndInt(0, 6) * 3600000);
      const durationSec = rndInt(180, 420);
      const endedAt = new Date(startedAt.getTime() + durationSec * 1000);

      const mode = pick(MODES);

      // Боль: базовый уровень снижается, облегчение после сессии растёт
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
  }

  // create(array) запускает pre-save → автоподсчёт score/accuracy
  await VRExerciseResult.create(docs);

  console.log(`✅ Создано ${docs.length} результатов для ${patients.length} пациентов.`);
  const byMode = await VRExerciseResult.aggregate([
    { $group: { _id: '$exerciseMode', count: { $sum: 1 }, avgScore: { $avg: '$score' } } }
  ]);
  byMode.forEach((m) => console.log(`   ${m._id}: ${m.count} шт., средний балл ${Math.round(m.avgScore)}`));

  await mongoose.connection.close();
  console.log('🔌 Соединение закрыто');
}

run()
  .then(() => { console.log('✨ Готово!'); process.exit(0); })
  .catch((e) => { console.error('❌ Ошибка:', e); process.exit(1); });
