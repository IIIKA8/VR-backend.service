// routes/patient.js — личный кабинет пациента (только свои данные, read-only).
// Доступ ограничен patientGuard в server.js (не админ и не врач).
/**
 * @module routes/patient
 * @description API кабинета пациента (требует {@link module:server~patientGuard}). Префикс: `/api/patient`.
 */
const express = require('express');
const User = require('../models/User');
const MedicalNote = require('../models/MedicalNote');
const { listResults, computeAnalytics } = require('../util/rehabAnalytics');

const router = express.Router();

/** GET /api/patient/me — профиль пациента и лечащий врач */
router.get('/me', async (req, res) => {
  try {
    const userId = req.session.userId;
    const u = await User.findById(userId)
      .select('lastName firstName middleName age username email isPatient clinicalProfile assignedDoctor')
      .populate('assignedDoctor', 'lastName firstName middleName')
      .lean();
    if (!u) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({
      id: u._id,
      lastName: u.lastName,
      firstName: u.firstName,
      middleName: u.middleName,
      age: u.age,
      username: u.username,
      email: u.email,
      isPatient: !!u.isPatient,
      assignedDoctor: u.assignedDoctor || null,
      clinicalProfile: u.clinicalProfile || { conditionSummary: '', tags: [] }
    });
  } catch (e) {
    console.error('patient/me:', e);
    res.status(500).json({ error: 'Ошибка профиля' });
  }
});

/** GET /api/patient/results — свои результаты упражнений (пагинация) */
router.get('/results', async (req, res) => {
  try {
    const userId = req.session.userId;
    const data = await listResults(userId, {
      mode: req.query.mode,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(data);
  } catch (e) {
    console.error('patient/results:', e);
    res.status(500).json({ error: 'Ошибка результатов' });
  }
});

/** GET /api/patient/analytics — собственный прогресс и динамика боли */
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.session.userId;
    const data = await computeAnalytics(userId);
    res.json(data);
  } catch (e) {
    console.error('patient/analytics:', e);
    res.status(500).json({ error: 'Ошибка аналитики' });
  }
});

/** GET /api/patient/notes — медзаписи врача о пациенте (только чтение) */
router.get('/notes', async (req, res) => {
  try {
    const userId = req.session.userId;
    const notes = await MedicalNote.find({ patient: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('doctor', 'lastName firstName middleName')
      .lean();
    res.json(notes);
  } catch (e) {
    console.error('patient/notes:', e);
    res.status(500).json({ error: 'Ошибка записей' });
  }
});

module.exports = router;
