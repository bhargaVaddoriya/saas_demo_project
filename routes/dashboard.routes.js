const router = require('express').Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware());

router.get('/', dashboardController.getDashboardAnalytics);

module.exports = router;
