const router = require('express').Router();
const orgController = require('../controllers/organization.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createOrganizationValidator,
  updateOrganizationValidator,
  addMemberValidator,
  updateMemberRoleValidator,
} = require('../validators/organization.validator');
const { ROLES } = require('../constants/enums.constant');

// Public invitation routes (accessible without login)
router.get('/verify-invite', orgController.verifyInvitation);
router.post('/accept-invite', orgController.acceptInvitation);

// All subsequent organization routes require authenticated user
router.use(authMiddleware());

// Top level organization routes
router.post('/', validate(createOrganizationValidator), orgController.createOrganization);
router.get('/', orgController.getOrganizations);
router.get('/:id', orgController.getOrganizationById);

// Restricted to OWNER or ADMIN
router.put(
  '/:id',
  authMiddleware({ roles: [ROLES.OWNER, ROLES.ADMIN] }),
  validate(updateOrganizationValidator),
  orgController.updateOrganization
);

// Member management (OWNER or ADMIN only)
router.get('/:id/members', orgController.getMembers);

router.post(
  '/:id/members',
  authMiddleware({ roles: [ROLES.OWNER, ROLES.ADMIN] }),
  validate(addMemberValidator),
  orgController.addMember
);

router.delete(
  '/:id/members/:userId',
  authMiddleware({ roles: [ROLES.OWNER, ROLES.ADMIN] }),
  orgController.removeMember
);

router.patch(
  '/:id/members/:userId',
  authMiddleware({ roles: [ROLES.OWNER, ROLES.ADMIN] }),
  validate(updateMemberRoleValidator),
  orgController.updateMemberRole
);

module.exports = router;
