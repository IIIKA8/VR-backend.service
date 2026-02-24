const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    default: function() {
      // Генерируем username по умолчанию если не указан
      return `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    default: function() {
      // Генерируем email по умолчанию если не указан
      return `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}@vr-app.local`;
    }
  },
  // Поля согласно дизайну админки
  lastName: {
    type: String,
    default: ''
  },
  firstName: {
    type: String,
    default: ''
  },
  middleName: {
    type: String,
    default: ''
  },
  age: {
    type: Number,
    default: null
  },
  // Полное имя для обратной совместимости
  fullName: {
    type: String,
    default: '',
    get: function() {
      return [this.lastName, this.firstName, this.middleName].filter(Boolean).join(' ').trim();
    }
  },
  avatar: {
    type: String,
    default: null
  },
  vrSettings: {
    handTracking: {
      type: Boolean,
      default: true
    },
    locomotion: {
      type: String,
      enum: ['teleport', 'smooth', 'both'],
      default: 'both'
    },
    comfortMode: {
      type: Boolean,
      default: false
    }
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false,
    select: false
  },
  isDoctor: {
    type: Boolean,
    default: false,
    select: false
  },
  passwordHash: {
    type: String,
    default: null,
    select: false
  },
  passwordSalt: {
    type: String,
    default: null,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { getters: true }
});

module.exports = mongoose.model('User', userSchema);
