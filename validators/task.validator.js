const { body, param, query } = require('express-validator');
const { TASK_STATUS, PRIORITY } = require('../constants/enums.constant');

const createTaskValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Task title is required.')
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters.'),

  body('projectId')
    .trim()
    .notEmpty()
    .withMessage('Project ID is required.')
    .isMongoId()
    .withMessage('Invalid Project ID format.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters.'),

  body('status')
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage(`Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`),

  body('priority')
    .optional()
    .isIn(Object.values(PRIORITY))
    .withMessage(`Priority must be one of: ${Object.values(PRIORITY).join(', ')}`),

  body('assigneeId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('Invalid Assignee ID format.'),

  body('dueDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Due date must be a valid ISO8601 date.'),

  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array of strings.'),
];

const updateTaskValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Task ID in URL.'),

  body('title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters.'),

  body('status')
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage(`Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`),

  body('priority')
    .optional()
    .isIn(Object.values(PRIORITY))
    .withMessage(`Priority must be one of: ${Object.values(PRIORITY).join(', ')}`),

  body('assigneeId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('Invalid Assignee ID format.'),

  body('dueDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Due date must be a valid ISO8601 date.'),

  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array of strings.'),

  body('order')
    .optional()
    .isNumeric()
    .withMessage('Order must be a number.'),
];

const updateTaskStatusValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Task ID in URL.'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required.')
    .isIn(Object.values(TASK_STATUS))
    .withMessage(`Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`),

  body('order')
    .optional()
    .isNumeric()
    .withMessage('Order must be a number.'),
];

const updateTaskAssigneeValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Task ID in URL.'),

  body('assigneeId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('Invalid Assignee ID format.'),
];

module.exports = {
  createTaskValidator,
  updateTaskValidator,
  updateTaskStatusValidator,
  updateTaskAssigneeValidator,
};
