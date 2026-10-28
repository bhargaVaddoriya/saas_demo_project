const router = require('express').Router();
const projectController = require('../controllers/project.controller');
const activityController = require('../controllers/activity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createProjectValidator,
  updateProjectValidator,
  addProjectMemberValidator,
} = require('../validators/project.validator');

// All project routes require authentication
router.use(authMiddleware());

// Project collection routes
router.post('/', validate(createProjectValidator), projectController.createProject);
router.get('/', projectController.getProjects);
router.get('/list', projectController.getProjects);

// Specific project routes
router.get('/:id', projectController.getProjectById);
router.put('/:id', validate(updateProjectValidator), projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

// Project progress & analytics
router.get('/:id/progress', projectController.getProjectProgress);

// Project activity feed (as specified in PDF Section 11 & 12)
router.get('/:projectId/activity', activityController.getProjectActivity);

// Member management
router.get('/:id/members', projectController.getMembers);
router.post('/:id/members', validate(addProjectMemberValidator), projectController.addMember);
router.delete('/:id/members/:userId', projectController.removeMember);

module.exports = router;
