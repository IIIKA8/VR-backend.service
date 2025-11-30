const express = require('express');
const router = express.Router();
const VRScene = require('../models/VRScene');

// Список всех сцен (для дашборда)
router.get('/', async (req, res) => {
  try {
    const scenes = await VRScene.find()
      .populate('owner', 'username avatar')
      .select('-__v')
      .sort({ createdAt: -1 });
    res.json(scenes);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сцен' });
  }
});

// Получить все публичные сцены
router.get('/public', async (req, res) => {
  try {
    const scenes = await VRScene.find({ isPublic: true })
      .populate('owner', 'username avatar')
      .select('-__v');
    res.json(scenes);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сцен' });
  }
});

// Получить сцены пользователя
router.get('/user/:userId', async (req, res) => {
  try {
    const scenes = await VRScene.find({ owner: req.params.userId })
      .populate('owner', 'username avatar')
      .select('-__v');
    res.json(scenes);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сцен пользователя' });
  }
});

// Получить сцену по ID
router.get('/:id', async (req, res) => {
  try {
    const scene = await VRScene.findById(req.params.id)
      .populate('owner', 'username avatar')
      .populate('currentUsers', 'username avatar')
      .select('-__v');
    
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    
    res.json(scene);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении сцены' });
  }
});

// Создать новую сцену
router.post('/', async (req, res) => {
  try {
    const scene = new VRScene(req.body);
    await scene.save();
    await scene.populate('owner', 'username avatar');
    res.status(201).json(scene);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при создании сцены' });
  }
});

// Обновить сцену
router.put('/:id', async (req, res) => {
  try {
    const scene = await VRScene.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('owner', 'username avatar')
    .populate('currentUsers', 'username avatar')
    .select('-__v');
    
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    
    res.json(scene);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении сцены' });
  }
});

// Удалить сцену
router.delete('/:id', async (req, res) => {
  try {
    const scene = await VRScene.findByIdAndDelete(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    res.json({ message: 'Сцена удалена' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении сцены' });
  }
});

// Добавить объект в сцену
router.post('/:id/objects', async (req, res) => {
  try {
    const scene = await VRScene.findById(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    
    scene.objects.push(req.body);
    await scene.save();
    
    res.json(scene);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при добавлении объекта' });
  }
});

// Обновить объект в сцене
router.put('/:id/objects/:objectId', async (req, res) => {
  try {
    const scene = await VRScene.findById(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    
    const object = scene.objects.id(req.params.objectId);
    if (!object) {
      return res.status(404).json({ error: 'Объект не найден' });
    }
    
    Object.assign(object, req.body);
    await scene.save();
    
    res.json(scene);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при обновлении объекта' });
  }
});

// Удалить объект из сцены
router.delete('/:id/objects/:objectId', async (req, res) => {
  try {
    const scene = await VRScene.findById(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Сцена не найдена' });
    }
    
    scene.objects.id(req.params.objectId).remove();
    await scene.save();
    
    res.json(scene);
  } catch (error) {
    res.status(400).json({ error: 'Ошибка при удалении объекта' });
  }
});

module.exports = router;
