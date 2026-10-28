const router = require('express').Router();
const activityController = require('../controllers/activity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware());

router.get('/', activityController.getOrganizationActivity);
router.get('/project/:projectId', activityController.getProjectActivity);

module.exports = router;
