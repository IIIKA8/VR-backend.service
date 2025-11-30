// models/UsagePeriod.js
const mongoose = require('mongoose');

const usagePeriodSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'cancelled'], 
    default: 'active' 
  },
  createdBy: { type: String, default: 'admin' },
  cancelledAt: { type: Date, default: null },
  cancelledReason: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('UsagePeriod', usagePeriodSchema);
