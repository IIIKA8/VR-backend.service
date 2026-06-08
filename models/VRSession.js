/**
 * @module models/VRSession
 * @description Сеанс VR: хост, участники, устройство, статус.
 */
const mongoose = require('mongoose');

const vrSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  scene: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VRScene',
    required: false // Сделаем необязательным для сессионных лицензий
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: false // Добавляем связь с устройством
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    position: {
      x: Number,
      y: Number,
      z: Number
    },
    rotation: {
      x: Number,
      y: Number,
      z: Number
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  status: {
    type: String,
    enum: ['waiting', 'active', 'paused', 'ended'],
    default: 'waiting'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  settings: {
    allowVoiceChat: {
      type: Boolean,
      default: true
    },
    allowHandTracking: {
      type: Boolean,
      default: true
    },
    maxParticipants: {
      type: Number,
      default: 10
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VRSession', vrSessionSchema);
