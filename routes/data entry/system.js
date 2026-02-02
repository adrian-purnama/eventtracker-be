const express = require('express');
const router = express.Router();
const systemModel = require('../../model/system.model');
const { validateToken, requireAdrian } = require('../../helper/validate.helper');

router.use(validateToken);

// GET / – read the single system config (any logged-in user)
router.get('/', async (req, res) => {
  try {
    const doc = await systemModel.findOne({});
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'System config not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get system config',
    });
  }
});

// PUT / – update system config (adrian only)
router.put('/', requireAdrian, async (req, res) => {
  try {
    const { appName, openRegistration } = req.body;
    const doc = await systemModel.findOneAndUpdate(
      {},
      {
        ...(appName !== undefined && { appName }),
        ...(openRegistration !== undefined && { openRegistration }),
      },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'System config not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'System config updated',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update system config',
    });
  }
});

module.exports = router;
