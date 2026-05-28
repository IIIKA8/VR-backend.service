// util/rehabAnalytics.js — выборка и агрегация результатов реабилитации.
// Используется кабинетом врача и личным кабинетом пациента.
const VRExerciseResult = require('../models/VRExerciseResult');

const MODE_LABELS = {
  conveyor: 'Конвейер',
  tea: 'Чай',
  drum: 'Барабан'
};

function buildMatch(patientId, { mode, from, to } = {}) {
  const match = { patient: patientId };
  if (mode && VRExerciseResult.EXERCISE_MODES.includes(mode)) {
    match.exerciseMode = mode;
  }
  if (from || to) {
    match.startedAt = {};
    if (from) match.startedAt.$gte = new Date(from);
    if (to) match.startedAt.$lte = new Date(to);
  }
  return match;
}

/** Список результатов пациента с пагинацией. */
async function listResults(patientId, opts = {}) {
  const match = buildMatch(patientId, opts);
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    VRExerciseResult.find(match)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('device', 'name key')
      .lean(),
    VRExerciseResult.countDocuments(match)
  ]);

  return {
    items: items.map((r) => ({ ...r, modeLabel: MODE_LABELS[r.exerciseMode] || r.exerciseMode })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit
  };
}

const round1 = (v) => Math.round((v || 0) * 10) / 10;

/** Агрегированная аналитика прогресса пациента. */
async function computeAnalytics(patientId) {
  const match = { patient: patientId };

  // Сводка по режимам
  const byModeAgg = await VRExerciseResult.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$exerciseMode',
        count: { $sum: 1 },
        avgScore: { $avg: '$score' },
        avgAccuracy: { $avg: '$accuracy' },
        bestScore: { $max: '$score' }
      }
    }
  ]);

  const byMode = VRExerciseResult.EXERCISE_MODES.map((mode) => {
    const found = byModeAgg.find((m) => m._id === mode);
    return {
      mode,
      label: MODE_LABELS[mode],
      count: found ? found.count : 0,
      avgScore: found ? round1(found.avgScore) : 0,
      avgAccuracy: found ? round1(found.avgAccuracy) : 0,
      bestScore: found ? round1(found.bestScore) : 0
    };
  });

  // Общие показатели
  const totalAgg = await VRExerciseResult.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        avgScore: { $avg: '$score' },
        avgAccuracy: { $avg: '$accuracy' },
        avgPainBefore: { $avg: '$painBefore' },
        avgPainAfter: { $avg: '$painAfter' }
      }
    }
  ]);
  const totals = totalAgg[0] || {};

  // Динамика боли и score за последние сессии (хронологически)
  const recent = await VRExerciseResult.find(match)
    .sort({ startedAt: 1 })
    .limit(120)
    .select('startedAt score accuracy painBefore painAfter exerciseMode')
    .lean();

  const timeline = recent.map((r) => ({
    date: r.startedAt,
    score: r.score,
    accuracy: r.accuracy,
    painBefore: r.painBefore,
    painAfter: r.painAfter,
    mode: r.exerciseMode
  }));

  // Приверженность: сессий за последние 7 / 28 дней
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 28 * 86400000);
  const [last7Days, last28Days] = await Promise.all([
    VRExerciseResult.countDocuments({ patient: patientId, startedAt: { $gte: weekAgo } }),
    VRExerciseResult.countDocuments({ patient: patientId, startedAt: { $gte: monthAgo } })
  ]);

  const avgPainBefore = totals.avgPainBefore != null ? round1(totals.avgPainBefore) : null;
  const avgPainAfter = totals.avgPainAfter != null ? round1(totals.avgPainAfter) : null;

  return {
    totalSessions: totals.total || 0,
    avgScore: round1(totals.avgScore),
    avgAccuracy: round1(totals.avgAccuracy),
    pain: {
      avgBefore: avgPainBefore,
      avgAfter: avgPainAfter,
      avgDelta:
        avgPainBefore != null && avgPainAfter != null
          ? round1(avgPainBefore - avgPainAfter)
          : null
    },
    byMode,
    timeline,
    adherence: { last7Days, last28Days }
  };
}

module.exports = { listResults, computeAnalytics, MODE_LABELS };
