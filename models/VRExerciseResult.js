/**
 * @module models/VRExerciseResult
 * @description Результат VR-упражнения: ВАШ, режим, метрики.
 */
const mongoose = require('mongoose');

/**
 * Результат одного выполненного VR-упражнения реабилитации.
 * Данные приходят с VR-очков (Godot) после завершения упражнения.
 *
 * Режимы (exerciseMode):
 *  - conveyor (Конвейер): сортировка/сбор объектов — correct / missed / wrong
 *  - tea (Чай): выполнение последовательности — completionTimeSec против targetTimeSec
 *  - drum (Барабан): ритмика ударов — totalHits, avgHitQuality, rhythmAccuracy
 *
 * Общие медицинские метрики (важны при фантомных болях):
 *  - painBefore / painAfter — уровень боли по шкале ВАШ (0..10) до и после сессии
 *  - hand — какая конечность тренировалась
 *  - comfortIssue — признак дискомфорта/киберукачивания
 */

const EXERCISE_MODES = ['conveyor', 'tea', 'drum'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;

const vrExerciseResultSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    default: null
  },
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VRSession',
    default: null
  },
  exerciseMode: {
    type: String,
    enum: EXERCISE_MODES,
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  durationSec: {
    type: Number,
    default: 0,
    min: 0
  },
  // Итоговые показатели (вычисляются автоматически из metrics)
  score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  accuracy: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Метрики, специфичные для режима
  metrics: {
    // conveyor (Конвейер)
    correct: { type: Number, default: 0, min: 0 },
    missed: { type: Number, default: 0, min: 0 },
    wrong: { type: Number, default: 0, min: 0 },
    // tea (Чай)
    completionTimeSec: { type: Number, default: 0, min: 0 },
    targetTimeSec: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false },
    // drum (Барабан)
    totalHits: { type: Number, default: 0, min: 0 },
    avgHitQuality: { type: Number, default: 0, min: 0, max: 100 },
    rhythmAccuracy: { type: Number, default: 0, min: 0, max: 100 }
  },
  // Общие медицинские метрики
  painBefore: { type: Number, default: null, min: 0, max: 10 },
  painAfter: { type: Number, default: null, min: 0, max: 10 },
  hand: { type: String, enum: ['left', 'right', 'both'], default: 'both' },
  repetitions: { type: Number, default: 0, min: 0 },
  comfortIssue: { type: Boolean, default: false }
}, {
  timestamps: true
});

vrExerciseResultSchema.index({ patient: 1, startedAt: -1 });
vrExerciseResultSchema.index({ doctor: 1, startedAt: -1 });

/**
 * Считает accuracy (%) и score (0..100) исходя из режима и метрик.
 * Возвращает { accuracy, score }.
 */
vrExerciseResultSchema.statics.computeScores = function computeScores(mode, metrics = {}) {
  let accuracy = 0;
  let score = 0;

  if (mode === 'conveyor') {
    const correct = Number(metrics.correct) || 0;
    const missed = Number(metrics.missed) || 0;
    const wrong = Number(metrics.wrong) || 0;
    const total = correct + missed + wrong;
    accuracy = total > 0 ? (correct / total) * 100 : 0;
    // Ошибочные действия штрафуем сильнее пропусков
    const penalty = total > 0 ? (wrong / total) * 100 * 0.5 : 0;
    score = clamp(accuracy - penalty, 0, 100);
  } else if (mode === 'tea') {
    const t = Number(metrics.completionTimeSec) || 0;
    const target = Number(metrics.targetTimeSec) || 0;
    const completed = !!metrics.completed;
    if (target > 0 && t > 0) {
      // Уложился в норматив или быстрее — 100; медленнее — пропорционально хуже
      score = clamp((target / t) * 100, 0, 100);
    } else {
      score = completed ? 70 : 0;
    }
    if (!completed) score *= 0.5;
    accuracy = score;
  } else if (mode === 'drum') {
    const quality = Number(metrics.avgHitQuality) || 0;
    const rhythm = Number(metrics.rhythmAccuracy) || 0;
    // Итог — среднее качества удара и точности ритма
    score = clamp((quality + rhythm) / 2 || quality, 0, 100);
    accuracy = clamp(rhythm || quality, 0, 100);
  }

  return { accuracy: round1(accuracy), score: round1(score) };
};

vrExerciseResultSchema.pre('save', function preSave(next) {
  const { accuracy, score } = this.constructor.computeScores(
    this.exerciseMode,
    this.metrics || {}
  );
  this.accuracy = accuracy;
  this.score = score;
  if (this.endedAt && this.startedAt && !this.durationSec) {
    this.durationSec = Math.max(0, Math.round((this.endedAt - this.startedAt) / 1000));
  }
  next();
});

vrExerciseResultSchema.statics.EXERCISE_MODES = EXERCISE_MODES;

module.exports = mongoose.model('VRExerciseResult', vrExerciseResultSchema);
