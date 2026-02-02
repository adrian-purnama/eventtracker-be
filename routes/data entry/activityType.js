const express = require('express');
const router = express.Router();
const activityTypeModel = require('../../model/activityType.model');
const { validateToken, requireAdrian } = require('../../helper/validate.helper');

router.use(validateToken);

// GET / – list all activity types (any logged-in user)
router.get('/', async (req, res) => {
  try {
    const list = await activityTypeModel.find().sort({ name: 1 });
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list activity types',
    });
  }
});

// GET /:id – get one by id
router.get('/:id', async (req, res) => {
  try {
    const doc = await activityTypeModel.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Activity type not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get activity type',
    });
  }
});

// POST / – create (adrian only)
router.post('/', requireAdrian, async (req, res) => {
  try {
    const { name, description, active } = req.body;
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'name and description are required',
      });
    }
    const doc = await activityTypeModel.create({
      name,
      description,
      active: active !== undefined ? active : true,
    });
    return res.status(201).json({
      success: true,
      message: 'Activity type created',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create activity type',
    });
  }
});

// PUT /:id – update (adrian only)
router.put('/:id', requireAdrian, async (req, res) => {
  try {
    const { name, description, active } = req.body;
    const doc = await activityTypeModel.findByIdAndUpdate(
      req.params.id,
      { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(active !== undefined && { active }) },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Activity type not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Activity type updated',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update activity type',
    });
  }
});

// DELETE /:id – delete (adrian only)
router.delete('/:id', requireAdrian, async (req, res) => {
  try {
    const doc = await activityTypeModel.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Activity type not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Activity type deleted',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete activity type',
    });
  }
});

module.exports = router;
