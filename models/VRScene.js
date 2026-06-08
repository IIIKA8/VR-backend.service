/**
 * @module models/VRScene
 * @description VR-сцена и объекты окружения.
 */
const mongoose = require('mongoose');

const vrSceneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  environment: {
    skybox: {
      type: String,
      default: null
    },
    lighting: {
      type: String,
      enum: ['day', 'night', 'custom'],
      default: 'day'
    },
    gravity: {
      type: Number,
      default: -9.81
    }
  },
  objects: [{
    id: String,
    type: {
      type: String,
      enum: ['cube', 'sphere', 'plane', 'model', 'light', 'audio'],
      required: true
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
    scale: {
      x: Number,
      y: Number,
      z: Number
    },
    properties: {
      color: String,
      material: String,
      texture: String,
      physics: {
        enabled: Boolean,
        mass: Number,
        friction: Number,
        restitution: Number
      }
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  maxUsers: {
    type: Number,
    default: 10
  },
  currentUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('VRScene', vrSceneSchema);
