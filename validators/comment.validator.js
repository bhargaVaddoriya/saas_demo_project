const { body, param } = require('express-validator');

const createCommentValidator = [
  param('taskId')
    .isMongoId()
    .withMessage('Invalid Task ID in URL.'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content cannot be empty.')
    .isLength({ max: 3000 })
    .withMessage('Comment cannot exceed 3000 characters.'),

  body('mentions')
    .optional()
    .isArray()
    .withMessage('Mentions must be an array of user IDs.'),
];

const updateCommentValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Comment ID in URL.'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content cannot be empty.')
    .isLength({ max: 3000 })
    .withMessage('Comment cannot exceed 3000 characters.'),
];

module.exports = {
  createCommentValidator,
  updateCommentValidator,
};
