var express = require('express');
var router = express.Router();

const authRoutes = require('./authentication.routes');
const organizationRoutes = require('./organization.routes');
const projectRoutes = require('./project.routes');
const taskRoutes = require('./task.routes');
const commentRoutes = require('./comment.routes');
const activityRoutes = require('./activity.routes');
const dashboardRoutes = require('./dashboard.routes');
const notificationRoutes = require('./notification.routes');


router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/comments', commentRoutes);
router.use('/activity', activityRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics', dashboardRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
