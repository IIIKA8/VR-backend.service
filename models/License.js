const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now }
}, { _id: false });

const licenseSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
  expiresAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: 'system' },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, default: '' },
  maxDevices: { type: Number, default: 1 },
  devices: { type: [deviceSchema], default: [] },
  lastValidatedAt: { type: Date, default: null }
}, { timestamps: true });

licenseSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

module.exports = mongoose.model('License', licenseSchema);
