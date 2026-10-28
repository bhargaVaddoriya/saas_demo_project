const bcrypt = require('bcryptjs');
const { User, Organization, OrganizationMember } = require('../model');
const { ROLES } = require('../constants/enums.constant');

/**
 * Register a new user and automatically provision an initial organization/workspace with unique slug
 * POST /authentication/signup or /api/auth/register
 */
const signup = async (req, res) => {
  try {
    const { name, email, password, organizationName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 1. Create user
    const newUser = await User.create({
      name,
      email,
      passwordHash,
    });

    // 2. Automatically create organization for the registering admin user
    const finalOrgName = (organizationName && organizationName.trim())
      ? organizationName.trim()
      : `${name.trim()}'s Workspace`;

    const organization = await Organization.create({
      name: finalOrgName,
      description: `${name.trim()}'s primary organization workspace`,
      ownerId: newUser._id,
    });

    // 3. Assign user as OWNER in OrganizationMember
    const member = await OrganizationMember.create({
      organizationId: organization._id,
      userId: newUser._id,
      role: ROLES.OWNER,
    });

    // 4. Generate 24h JWT token
    const token = newUser.generateAuthToken();

    // 5. Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    const orgPayload = {
      id: organization._id,
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      ownerId: organization.ownerId,
      role: member.role,
      joinedAt: member.joinedAt,
      createdAt: organization.createdAt,
    };

    return res.status(201).json({
      success: true,
      message: 'Account and organization registered successfully.',
      token,
      expiresIn: '24h',
      user: {
        id: newUser._id,
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: member.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      },
      organization: orgPayload,
      currentOrganization: orgPayload,
      organizations: [
        {
          organization: orgPayload,
          id: organization._id,
          _id: organization._id,
          name: organization.name,
          slug: organization.slug,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      ],
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed.',
      error: error.message,
    });
  }
};

/**
 * Authenticate existing user & issue 24h JWT
 * POST /authentication/login or /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fetch user including hidden passwordHash
    const user = await User.findOne({ email }).select('+passwordHash');
    console.log('user', user)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Update lastLoginAt timestamp
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Fetch user's organizations
    let memberships = await OrganizationMember.find({ userId: user._id })
      .populate('organizationId')
      .sort({ createdAt: 1 });

    // Fallback: If user has no organization yet, auto-provision one so the UI always has a workspace
    if (!memberships || memberships.length === 0) {
      const fallbackOrg = await Organization.create({
        name: `${user.name.trim()}'s Workspace`,
        description: `${user.name.trim()}'s primary organization workspace`,
        ownerId: user._id,
      });

      const fallbackMember = await OrganizationMember.create({
        organizationId: fallbackOrg._id,
        userId: user._id,
        role: ROLES.OWNER,
      });

      fallbackMember.organizationId = fallbackOrg;
      memberships = [fallbackMember];
    }

    const orgList = memberships
      .filter((m) => m.organizationId && !m.organizationId.isArchived)
      .map((m) => {
        const orgDoc = m.organizationId;
        return {
          id: orgDoc._id,
          _id: orgDoc._id,
          name: orgDoc.name,
          slug: orgDoc.slug,
          description: orgDoc.description,
          ownerId: orgDoc.ownerId,
          role: m.role,
          joinedAt: m.joinedAt,
          organization: orgDoc,
        };
      });

    const activeOrg = orgList[0] || null;

    // Generate 24h JWT token
    const token = user.generateAuthToken();

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      expiresIn: '24h',
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: activeOrg ? activeOrg.role : ROLES.OWNER,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
      organization: activeOrg ? activeOrg.organization : null,
      currentOrganization: activeOrg ? activeOrg.organization : null,
      organizations: orgList,
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed.',
      error: error.message,
    });
  }
};

/**
 * Log out user (clear session/cookie)
 * POST /authentication/logout or /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    res.clearCookie('token');
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Logout failed.',
      error: error.message,
    });
  }
};

/**
 * Get currently authenticated user profile & memberships
 * GET /authentication/me or /api/auth/me
 */
const getProfile = async (req, res) => {
  try {
    const user = req.user;

    // Fetch organizations this user belongs to
    let memberships = await OrganizationMember.find({ userId: user._id })
      .populate('organizationId')
      .sort({ createdAt: 1 });

    // Fallback auto-provision if needed
    if (!memberships || memberships.length === 0) {
      const fallbackOrg = await Organization.create({
        name: `${user.name.trim()}'s Workspace`,
        description: `${user.name.trim()}'s primary organization workspace`,
        ownerId: user._id,
      });

      const fallbackMember = await OrganizationMember.create({
        organizationId: fallbackOrg._id,
        userId: user._id,
        role: ROLES.OWNER,
      });

      fallbackMember.organizationId = fallbackOrg;
      memberships = [fallbackMember];
    }

    const orgList = memberships
      .filter((m) => m.organizationId && !m.organizationId.isArchived)
      .map((m) => {
        const orgDoc = m.organizationId;
        return {
          id: orgDoc._id,
          _id: orgDoc._id,
          name: orgDoc.name,
          slug: orgDoc.slug,
          description: orgDoc.description,
          ownerId: orgDoc.ownerId,
          role: m.role,
          joinedAt: m.joinedAt,
          organization: orgDoc,
        };
      });

    const activeOrg = orgList[0] || null;

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: activeOrg ? activeOrg.role : ROLES.OWNER,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      organization: activeOrg ? activeOrg.organization : null,
      currentOrganization: activeOrg ? activeOrg.organization : null,
      organizations: orgList,
    });
  } catch (error) {
    console.error('Profile Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile.',
      error: error.message,
    });
  }
};

module.exports = {
  signup,
  register: signup,
  login,
  logout,
  getProfile,
  me: getProfile,
};
