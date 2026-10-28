const jwt = require('jsonwebtoken');
const { User, Organization, OrganizationMember, Project, ProjectMember } = require('../model');
const { ROLES } = require('../constants/enums.constant');

/**
 * Universal Authentication & Role/Permission Middleware
 * 
 * Can be used as:
 * 1. Simple auth check:
 *    router.get('/me', authMiddleware, controller.getProfile);
 * 
 * 2. Role validation (arguments list):
 *    router.post('/projects', authMiddleware(ROLES.OWNER, ROLES.ADMIN), controller.createProject);
 * 
 * 3. Configuration object with Org and Project role rules:
 *    router.delete('/tasks/:id', authMiddleware({ 
 *      roles: [ROLES.OWNER, ROLES.ADMIN],
 *      projectRoles: ['MANAGER']
 *    }), controller.deleteTask);
 */
const authMiddleware = (options = {}) => {
  // If invoked directly as middleware without calling it as a factory:
  // e.g. router.get('/me', authMiddleware, handler)
  if (typeof options === 'object' && options.headers && typeof options.get === 'function') {
    return handleAuthAndRoles({}, options, arguments[1], arguments[2]);
  }

  // If invoked with a list of roles e.g. authMiddleware('OWNER', 'ADMIN')
  let config = {};
  if (typeof options === 'string') {
    config = { roles: Array.from(arguments) };
  } else if (Array.isArray(options)) {
    config = { roles: options };
  } else {
    config = options;
  }

  return (req, res, next) => {
    return handleAuthAndRoles(config, req, res, next);
  };
};

/**
 * Core authentication and authorization handler
 */
async function handleAuthAndRoles(config, req, res, next) {
  try {
    const {
      roles = [],          // Allowed Organization roles: ['OWNER', 'ADMIN', 'MEMBER']
      projectRoles = [],   // Allowed Project roles: ['MANAGER', 'MEMBER']
      allowOwner = true,   // Org OWNER automatically has access to sub-resources
      requireActive = true // User must be active
    } = config;

    // 1. Extract Token from Authorization header or cookies
    let token = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1].trim();
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.',
      });
    }

    // 2. Verify JWT Token (checks 24h expiration and signature)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_project_management_saas_2026');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.',
          expired: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    // 3. Find User & Ensure Account is Active
    const user = await User.findById(decoded.id || decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    if (requireActive && user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    // Attach authenticated user to request
    req.user = user;
    req.token = token;

    // If no specific role validation is requested, proceed to controller
    if (roles.length === 0 && projectRoles.length === 0) {
      return next();
    }

    // 4. Resolve Organization ID Context
    let organizationId =
      req.params.organizationId ||
      req.headers['x-organization-id'] ||
      req.body.organizationId ||
      req.query.organizationId;

    // Fallback: If route is /organizations/:id
    if (!organizationId && req.baseUrl.includes('organization') && req.params.id) {
      organizationId = req.params.id;
    }

    // 5. Resolve Project ID Context
    let projectId =
      req.params.projectId ||
      req.headers['x-project-id'] ||
      req.body.projectId ||
      req.query.projectId;

    if (!projectId && req.baseUrl.includes('project') && req.params.id) {
      projectId = req.params.id;
    }

    // If we have a projectId but no organizationId, look up project to get organizationId
    if (projectId && !organizationId) {
      const projectDoc = await Project.findById(projectId).select('organizationId ownerId');
      if (projectDoc) {
        organizationId = projectDoc.organizationId;
        req.project = projectDoc;
      }
    }

    // 6. Organization Role Validation
    if (roles.length > 0) {
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required for role validation.',
        });
      }

      // Check organization membership
      const member = await OrganizationMember.findOne({
        organizationId,
        userId: user._id,
      });

      // Also check if user is the direct organization owner
      const organization = await Organization.findById(organizationId).select('ownerId');
      const isDirectOrgOwner = organization && organization.ownerId.toString() === user._id.toString();

      if (!member && !isDirectOrgOwner) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a member of this organization.',
        });
      }

      const userOrgRole = isDirectOrgOwner ? ROLES.OWNER : member.role;
      req.organizationId = organizationId;
      req.organizationMember = member;
      req.userOrgRole = userOrgRole;

      // Allow OWNER bypass if configured
      const hasOrgPermission = roles.includes(userOrgRole) || (allowOwner && userOrgRole === ROLES.OWNER);

      if (!hasOrgPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires one of roles: [${roles.join(', ')}]. Your role: ${userOrgRole}`,
        });
      }
    }

    // 7. Project Role Validation
    if (projectRoles.length > 0) {
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Project ID is required for project role validation.',
        });
      }

      // If org OWNER and allowOwner is true, org owner automatically has full project access
      if (allowOwner && req.userOrgRole === ROLES.OWNER) {
        return next();
      }

      const projectMember = await ProjectMember.findOne({
        projectId,
        userId: user._id,
      });

      if (!projectMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this project.',
        });
      }

      if (!projectRoles.includes(projectMember.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires project role: [${projectRoles.join(', ')}].`,
        });
      }

      req.projectId = projectId;
      req.projectMember = projectMember;
      req.userProjectRole = projectMember.role;
    }

    return next();
  } catch (error) {
    console.error('Auth & Role Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal authorization error.',
      error: error.message,
    });
  }
}

module.exports = {
  authMiddleware,
  // Convenient aliases
  verifyAuth: authMiddleware,
  authorizeRoles: (...roles) => authMiddleware({ roles }),
  authorizeProject: (...projectRoles) => authMiddleware({ projectRoles }),
};
