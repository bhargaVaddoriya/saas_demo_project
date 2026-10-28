const router = require('express').Router();
const authController = require('../controllers/authentication.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { signupValidator, loginValidator } = require('../validators');

const orgController = require('../controllers/organization.controller');

// Public routes with express-validator validation
router.post('/signup', validate(signupValidator), authController.signup);
router.post('/register', validate(signupValidator), authController.register);
router.post('/login', validate(loginValidator), authController.login);
router.post('/logout', authController.logout);

// Invitation acceptance & token verification
router.get('/verify-invite', orgController.verifyInvitation);
router.post('/accept-invite', orgController.acceptInvitation);

// Protected routes (validates 24h JWT token)
router.get('/me', authMiddleware(), authController.getProfile);

module.exports = router;