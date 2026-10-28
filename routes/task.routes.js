const router = require('express').Router();
const taskController = require('../controllers/task.controller');
const commentController = require('../controllers/comment.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createTaskValidator,
  updateTaskValidator,
  updateTaskStatusValidator,
  updateTaskAssigneeValidator,
} = require('../validators/task.validator');
const { createCommentValidator } = require('../validators/comment.validator');

// All task routes require authentication
router.use(authMiddleware());

// Kanban board tasks query
router.get('/kanban', taskController.getKanbanBoard);

// Collection routes
router.post('/', validate(createTaskValidator), taskController.createTask);
router.get('/', taskController.getTasks);

// Comments nested under tasks (as specified in PDF Section 11 & 12)
router.post('/:taskId/comments', validate(createCommentValidator), commentController.addComment);
router.get('/:taskId/comments', commentController.getTaskComments);

// Single task routes
router.get('/:id', taskController.getTaskById);
router.put('/:id', validate(updateTaskValidator), taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

// Dedicated status and assignee updates
router.patch('/:id/status', validate(updateTaskStatusValidator), taskController.updateStatus);
router.patch('/:id/assignee', validate(updateTaskAssigneeValidator), taskController.updateAssignee);

module.exports = router;
