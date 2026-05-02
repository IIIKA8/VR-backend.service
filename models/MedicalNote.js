const mongoose = require('mongoose');

const medicalNoteSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true }
}, { timestamps: true });

medicalNoteSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.model('MedicalNote', medicalNoteSchema);
