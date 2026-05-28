// routes/vr.js — приём данных реабилитации с VR-очков (Godot)
const express = require('express');
const mongoose = require('mongoose');
const Device = require('../models/Device');
const UsagePeriod = require('../models/UsagePeriod');
const VRSession = require('../models/VRSession');
const User = require('../models/User');
const VRExerciseResult = require('../models/VRExerciseResult');

const router = express.Router();

const MODE_LABELS = {
  conveyor: 'Конвейер',
  tea: 'Чай',
  drum: 'Барабан'
};

// Список поддерживаемых режимов (для клиента VR и интерфейсов)
router.get('/modes', (req, res) => {
  res.json(
    VRExerciseResult.EXERCISE_MODES.map((id) => ({ id, label: MODE_LABELS[id] || id }))
  );
});

/**
 * Определяет пациента (и его лечащего врача) по ключу устройства:
 * приоритет — активный период доступа, затем активная сессия.
 * Возвращает { patientId, doctorId, device, sessionId } или null.
 */
async function resolvePatientByDeviceKey(key) {
  const device = await Device.findOne({ key });
  if (!device) return null;

  device.lastSeen = new Date();
  await device.save();

  const now = new Date();
  const activePeriod = await UsagePeriod.findOne({
    device: device._id,
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).select('user');

  let patientId = activePeriod ? activePeriod.user : null;
  let sessionId = null;

  if (!patientId) {
    const activeSession = await VRSession.findOne({
      status: 'active',
      device: device._id
    }).select('host');
    if (activeSession) {
      patientId = activeSession.host;
      sessionId = activeSession._id;
    }
  }

  if (!patientId) return { device, patientId: null, doctorId: null, sessionId: null };

  const patient = await User.findById(patientId).select('assignedDoctor');
  return {
    device,
    patientId,
    doctorId: patient ? patient.assignedDoctor : null,
    sessionId
  };
}

/**
 * POST /api/vr/results — сохранить результат упражнения с очков.
 * Тело:
 * {
 *   deviceKey?: string,   // ключ очков (предпочтительно)
 *   patientId?: string,   // явный id пациента (fallback / тесты)
 *   exerciseMode: 'conveyor'|'tea'|'drum',
 *   metrics: { ... },     // см. модель VRExerciseResult
 *   painBefore?, painAfter?, hand?, repetitions?, comfortIssue?,
 *   durationSec?, startedAt?, endedAt?
 * }
 */
router.post('/results', async (req, res) => {
  try {
    const body = req.body || {};
    const {
      deviceKey,
      patientId: patientIdRaw,
      exerciseMode,
      metrics,
      painBefore,
      painAfter,
      hand,
      repetitions,
      comfortIssue,
      durationSec,
      startedAt,
      endedAt
    } = body;

    if (!exerciseMode || !VRExerciseResult.EXERCISE_MODES.includes(exerciseMode)) {
      return res.status(400).json({
        error: 'Некорректный режим упражнения',
        allowed: VRExerciseResult.EXERCISE_MODES
      });
    }

    let device = null;
    let patientId = null;
    let doctorId = null;
    let sessionId = null;

    if (deviceKey) {
      const resolved = await resolvePatientByDeviceKey(deviceKey);
      if (!resolved) {
        return res.status(404).json({ error: 'Устройство с таким ключом не найдено' });
      }
      device = resolved.device;
      patientId = resolved.patientId;
      doctorId = resolved.doctorId;
      sessionId = resolved.sessionId;
    }

    // Fallback: явный patientId (например, тестовые отправки без активного доступа)
    if (!patientId && patientIdRaw && mongoose.Types.ObjectId.isValid(patientIdRaw)) {
      const patient = await User.findById(patientIdRaw).select('assignedDoctor');
      if (patient) {
        patientId = patient._id;
        doctorId = patient.assignedDoctor;
      }
    }

    if (!patientId) {
      return res.status(409).json({
        error: 'Не удалось определить пациента: нет активного доступа на устройстве и не передан patientId'
      });
    }

    const result = new VRExerciseResult({
      patient: patientId,
      doctor: doctorId || null,
      device: device ? device._id : null,
      session: sessionId,
      exerciseMode,
      metrics: metrics || {},
      painBefore: painBefore != null ? Number(painBefore) : null,
      painAfter: painAfter != null ? Number(painAfter) : null,
      hand: ['left', 'right', 'both'].includes(hand) ? hand : 'both',
      repetitions: repetitions != null ? Number(repetitions) : 0,
      comfortIssue: !!comfortIssue,
      durationSec: durationSec != null ? Number(durationSec) : 0,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      endedAt: endedAt ? new Date(endedAt) : new Date()
    });

    await result.save();

    return res.status(201).json({
      success: true,
      id: result._id,
      exerciseMode: result.exerciseMode,
      score: result.score,
      accuracy: result.accuracy
    });
  } catch (error) {
    console.error('Ошибка сохранения результата VR:', error);
    return res.status(500).json({ error: 'Ошибка сохранения результата', details: error.message });
  }
});

module.exports = router;
