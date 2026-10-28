const { body, param, query } = require('express-validator');
const { PROJECT_STATUS, PRIORITY, PROJECT_ROLES } = require('../constants/enums.constant');

const createProjectValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Project name is required.')
    .isLength({ min: 2, max: 120 })
    .withMessage('Project name must be between 2 and 120 characters.'),

  body('organizationId')
    .optional()
    .trim()
    .isMongoId()
    .withMessage('Invalid Organization ID format.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters.'),

  body('status')
    .optional()
    .isIn(Object.values(PROJECT_STATUS))
    .withMessage(`Status must be one of: ${Object.values(PROJECT_STATUS).join(', ')}`),

  body('priority')
    .optional()
    .isIn(Object.values(PRIORITY))
    .withMessage(`Priority must be one of: ${Object.values(PRIORITY).join(', ')}`),

  body('startDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Start date must be a valid ISO8601 date.'),

  body('dueDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Due date must be a valid ISO8601 date.'),
];

const updateProjectValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Project ID in URL.'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Project name must be between 2 and 120 characters.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters.'),

  body('status')
    .optional()
    .isIn(Object.values(PROJECT_STATUS))
    .withMessage(`Status must be one of: ${Object.values(PROJECT_STATUS).join(', ')}`),

  body('priority')
    .optional()
    .isIn(Object.values(PRIORITY))
    .withMessage(`Priority must be one of: ${Object.values(PRIORITY).join(', ')}`),

  body('startDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Start date must be a valid ISO8601 date.'),

  body('dueDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Due date must be a valid ISO8601 date.'),

  body('isArchived')
    .optional()
    .isBoolean()
    .withMessage('isArchived must be a boolean.'),
];

const addProjectMemberValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Project ID in URL.'),

  body('userId')
    .trim()
    .notEmpty()
    .withMessage('User ID is required.')
    .isMongoId()
    .withMessage('Invalid User ID format.'),

  body('role')
    .optional()
    .isIn(Object.values(PROJECT_ROLES))
    .withMessage(`Project role must be one of: ${Object.values(PROJECT_ROLES).join(', ')}`),
];

module.exports = {
  createProjectValidator,
  updateProjectValidator,
  addProjectMemberValidator,
};
