/**
 * @module models/Device
 * @description Зарегистрированное VR-устройство (deviceId, статус, привязка).
 */
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  // Добавляем ключ устройства согласно диаграмме
  key: { type: String, unique: true, sparse: true }, // например "18 символов из букв и цифр"
  name: { type: String, required: true }, // "Очки 1", "Очки 2"
  status: { 
    type: String, 
    enum: ['active', 'maintenance', 'offline'], 
    default: 'active' 
  },
  lastSeen: { type: Date, default: Date.now },
  firmwareVersion: { type: String, default: '1.0.0' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
