const { body, param } = require('express-validator');
const { ROLES } = require('../constants/enums.constant');

const createOrganizationValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Organization name is required.')
    .isLength({ min: 2, max: 120 })
    .withMessage('Organization name must be between 2 and 120 characters.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters.'),

  body('slug')
    .optional()
    .trim()
    .isSlug()
    .withMessage('Slug must be a valid URL slug (lowercase letters, numbers, and hyphens).'),
];

const updateOrganizationValidator = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Organization ID or slug is required.'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Organization name must be between 2 and 120 characters.'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters.'),
];

const addMemberValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Organization ID in URL.'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email to invite.')
    .normalizeEmail(),

  body('userId')
    .optional()
    .isMongoId()
    .withMessage('Invalid User ID format.'),

  body('role')
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage(`Role must be one of: ${Object.values(ROLES).join(', ')}`),

  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.userId) {
      throw new Error('Either email or userId is required to add an organization member.');
    }
    return true;
  }),
];

const updateMemberRoleValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Organization ID in URL.'),

  param('userId')
    .isMongoId()
    .withMessage('Invalid User ID in URL.'),

  body('role')
    .notEmpty()
    .withMessage('Role is required.')
    .isIn(Object.values(ROLES))
    .withMessage(`Role must be one of: ${Object.values(ROLES).join(', ')}`),
];

module.exports = {
  createOrganizationValidator,
  updateOrganizationValidator,
  addMemberValidator,
  updateMemberRoleValidator,
};
