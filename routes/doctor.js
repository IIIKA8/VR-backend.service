const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const VRSession = require('../models/VRSession');
const UsagePeriod = require('../models/UsagePeriod');
const Device = require('../models/Device');
const MedicalNote = require('../models/MedicalNote');

const router = express.Router();

function isOid(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function getPatientForDoctor(patientId, doctorId) {
  if (!isOid(patientId)) return null;
  return User.findOne({
    _id: patientId,
    assignedDoctor: doctorId,
    isPatient: true
  }).select('+clinicalProfile');
}

/** GET /api/doctor/me */
router.get('/me', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const u = await User.findById(doctorId).select(
      'username email lastName firstName middleName isDoctor'
    );
    if (!u || !u.isDoctor) {
      return res.status(403).json({ error: 'Не врач' });
    }
    res.json({
      id: u._id,
      username: u.username,
      email: u.email,
      lastName: u.lastName,
      firstName: u.firstName,
      middleName: u.middleName
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка профиля' });
  }
});

/** GET /api/doctor/overview — сводка по пациентам врача */
router.get('/overview', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const patientIds = await User.find({
      assignedDoctor: doctorId,
      isPatient: true
    }).distinct('_id');

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const periodDevices = await UsagePeriod.distinct('device', {
      user: { $in: patientIds },
      status: 'active',
      endDate: { $gte: now },
      startDate: { $lte: now }
    });

    const [sessionsWeek, notesCount] = await Promise.all([
      VRSession.countDocuments({
        host: { $in: patientIds },
        startedAt: { $gte: weekAgo }
      }),
      MedicalNote.countDocuments({ doctor: doctorId })
    ]);

    res.json({
      patientsTotal: patientIds.length,
      vrSessionsLast7Days: sessionsWeek,
      medicalNotesTotal: notesCount,
      activePeriodDevicesApprox: periodDevices.length,
      _hint: 'Расширенная аналитика — позже'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сводки' });
  }
});

/** GET /api/doctor/patients */
router.get('/patients', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const list = await User.find({ assignedDoctor: doctorId, isPatient: true })
      .select('lastName firstName middleName age email username lastSeen isOnline clinicalProfile createdAt')
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка списка пациентов' });
  }
});

/** GET /api/doctor/patients/:patientId */
router.get('/patients/:patientId', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден или не в вашем списке' });
    }
    const o = p.toObject ? p.toObject() : p;
    delete o.passwordHash;
    delete o.passwordSalt;
    res.json(o);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка загрузки пациента' });
  }
});

/** PATCH /api/doctor/patients/:patientId/clinical */
router.patch('/patients/:patientId/clinical', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден или не в вашем списке' });
    }
    const { conditionSummary, tags } = req.body || {};
    if (conditionSummary !== undefined) {
      p.clinicalProfile = p.clinicalProfile || {};
      p.clinicalProfile.conditionSummary = String(conditionSummary).slice(0, 8000);
    }
    if (tags !== undefined && Array.isArray(tags)) {
      p.clinicalProfile = p.clinicalProfile || {};
      p.clinicalProfile.tags = tags.map((t) => String(t).slice(0, 64)).filter(Boolean).slice(0, 32);
    }
    await p.save();
    res.json({
      clinicalProfile: p.clinicalProfile || { conditionSummary: '', tags: [] }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

/** GET /api/doctor/patients/:patientId/sessions */
router.get('/patients/:patientId/sessions', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден' });
    }
    const lim = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const sessions = await VRSession.find({ host: p._id })
      .sort({ startedAt: -1 })
      .limit(lim)
      .populate('device', 'name key deviceId status')
      .populate('scene', 'name')
      .lean();
    res.json(sessions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сессий' });
  }
});

/** GET /api/doctor/patients/:patientId/periods */
router.get('/patients/:patientId/periods', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден' });
    }
    const periods = await UsagePeriod.find({ user: p._id })
      .sort({ startDate: -1 })
      .limit(100)
      .populate('device', 'name key deviceId')
      .lean();
    res.json(periods);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка периодов' });
  }
});

/** GET /api/doctor/patients/:patientId/notes */
router.get('/patients/:patientId/notes', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден' });
    }
    const notes = await MedicalNote.find({ patient: p._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('doctor', 'lastName firstName middleName')
      .lean();
    res.json(notes);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка записей' });
  }
});

/** POST /api/doctor/patients/:patientId/notes */
router.post('/patients/:patientId/notes', async (req, res) => {
  try {
    const doctorId = req.session.userId;
    const p = await getPatientForDoctor(req.params.patientId, doctorId);
    if (!p) {
      return res.status(404).json({ error: 'Пациент не найден' });
    }
    const body = (req.body && req.body.body) ? String(req.body.body).trim() : '';
    if (!body) {
      return res.status(400).json({ error: 'Пустая запись' });
    }
    const note = await MedicalNote.create({
      doctor: doctorId,
      patient: p._id,
      body: body.slice(0, 16000)
    });
    await note.populate('doctor', 'lastName firstName middleName');
    res.status(201).json(note);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сохранения записи' });
  }
});

module.exports = router;
