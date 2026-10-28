const router = require('express').Router();
const commentController = require('../controllers/comment.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createCommentValidator,
  updateCommentValidator,
} = require('../validators/comment.validator');

router.use(authMiddleware());

// Direct comment actions by comment ID
router.put('/:id', validate(updateCommentValidator), commentController.updateComment);
router.delete('/:id', commentController.deleteComment);

// Task scoped comment actions
router.post('/task/:taskId', validate(createCommentValidator), commentController.addComment);
router.get('/task/:taskId', commentController.getTaskComments);

module.exports = router;
