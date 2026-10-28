const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Organization, OrganizationMember, User, Project, ProjectMember, Task, Invitation } = require('../model');
const { ROLES, NOTIFICATION_TYPE } = require('../constants/enums.constant');
const { paginate } = require('../utils/paginate.util');
const { createNotification } = require('../services/notification.service');
const { sendInvitationEmail } = require('../services/email.service');

/**
 * Create a new organization
 * POST /api/organizations
 */
const createOrganization = async (req, res) => {
  try {
    const { name, description, slug } = req.body;
    const userId = req.user._id;

    // Generate unique slug if not provided or ensure uniqueness
    const finalSlug = slug
      ? await Organization.generateUniqueSlug(slug)
      : await Organization.generateUniqueSlug(name);

    // Create organization
    const organization = await Organization.create({
      name,
      slug: finalSlug,
      description: description || '',
      ownerId: userId,
    });

    // Add creator as OWNER in OrganizationMember
    const member = await OrganizationMember.create({
      organizationId: organization._id,
      userId,
      role: ROLES.OWNER,
    });

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully.',
      organization: {
        id: organization._id,
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        ownerId: organization.ownerId,
        role: member.role,
        createdAt: organization.createdAt,
      },
      role: member.role,
    });
  } catch (error) {
    console.error('Create Organization Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create organization.',
      error: error.message,
    });
  }
};

/**
 * List organizations the authenticated user belongs to
 * GET /api/organizations
 */
const getOrganizations = async (req, res) => {
  try {
    const userId = req.user._id;

    const memberships = await OrganizationMember.find({ userId })
      .populate('organizationId')
      .sort({ createdAt: -1 });

    const organizations = memberships
      .filter((m) => m.organizationId && !m.organizationId.isArchived)
      .map((m) => ({
        id: m.organizationId._id,
        _id: m.organizationId._id,
        name: m.organizationId.name,
        slug: m.organizationId.slug,
        description: m.organizationId.description,
        ownerId: m.organizationId.ownerId,
        role: m.role,
        joinedAt: m.joinedAt,
        createdAt: m.organizationId.createdAt,
      }));

    return res.status(200).json({
      success: true,
      count: organizations.length,
      organizations,
    });
  } catch (error) {
    console.error('Get Organizations Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch organizations.',
      error: error.message,
    });
  }
};

/**
 * Get organization by ID or slug with summary
 * GET /api/organizations/:id
 */
const getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const isMongoId = mongoose.Types.ObjectId.isValid(id);
    const orgFilter = isMongoId ? { _id: id } : { slug: id.toLowerCase() };

    const organization = await Organization.findOne(orgFilter).populate('ownerId', 'name email');
    if (!organization || organization.isArchived) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found.',
      });
    }

    // Verify membership
    const membership = await OrganizationMember.findOne({
      organizationId: organization._id,
      userId,
    });

    if (!membership && organization.ownerId._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this organization.',
      });
    }

    // Counts for dashboard quick view
    const [membersCount, projectsCount] = await Promise.all([
      OrganizationMember.countDocuments({ organizationId: organization._id }),
      Project.countDocuments({ organizationId: organization._id, isArchived: false }),
    ]);

    return res.status(200).json({
      success: true,
      organization: {
        id: organization._id,
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        owner: organization.ownerId,
        isArchived: organization.isArchived,
        membersCount,
        projectsCount,
        myRole: membership ? membership.role : ROLES.OWNER,
        createdAt: organization.createdAt,
      },
    });
  } catch (error) {
    console.error('Get Organization Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch organization details.',
      error: error.message,
    });
  }
};

/**
 * Update organization (OWNER or ADMIN)
 * PUT /api/organizations/:id
 */
const updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const isMongoId = mongoose.Types.ObjectId.isValid(id);
    const orgFilter = isMongoId ? { _id: id } : { slug: id.toLowerCase() };

    const organization = await Organization.findOne(orgFilter);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found.',
      });
    }

    if (name && name !== organization.name) {
      organization.name = name;
      organization.slug = await Organization.generateUniqueSlug(name, organization._id);
    }

    if (description !== undefined) organization.description = description;

    await organization.save();

    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully.',
      organization: {
        id: organization._id,
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        updatedAt: organization.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update Organization Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update organization.',
      error: error.message,
    });
  }
};

/**
 * Invite / Add member to organization
 * POST /api/organizations/:id/members
 *
 * Flow:
 *   1. If user exists in DB → add them immediately + send in-app notification + invite email
 *   2. If user does NOT exist → auto-register (no password), create invitation token,
 *      send email with link to accept invite & set password
 */
const addMember = async (req, res) => {
  try {
    const { id: organizationId } = req.params;
    const { email, userId: targetUserId, role = ROLES.MEMBER } = req.body;
    const inviterId = req.user._id;

    // Resolve the organization
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found.',
      });
    }

    // ── Try to find existing user ───────────────────────────────
    let userToAdd = null;
    if (targetUserId) {
      userToAdd = await User.findById(targetUserId);
    } else if (email) {
      userToAdd = await User.findOne({ email: email.toLowerCase().trim() });
    }

    const inviteEmail = (email || (userToAdd && userToAdd.email) || '').toLowerCase().trim();
    if (!inviteEmail) {
      return res.status(400).json({
        success: false,
        message: 'An email address is required to send an invitation.',
      });
    }

    // Generate a secure invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteLink = `${frontendUrl}/accept-invite?token=${inviteToken}`;

    // ── CASE 1: User already exists ────────────────────────────
    if (userToAdd) {
      // Check if already an active member
      const existingMember = await OrganizationMember.findOne({
        organizationId,
        userId: userToAdd._id,
      });

      if (existingMember) {
        return res.status(409).json({
          success: false,
          message: 'User is already a member of this organization.',
        });
      }

      // Upsert pending invitation record
      await Invitation.findOneAndUpdate(
        { organizationId, email: userToAdd.email.toLowerCase(), status: 'PENDING' },
        {
          organizationId,
          email: userToAdd.email.toLowerCase(),
          role,
          invitedBy: inviterId,
          token: inviteToken,
          status: 'PENDING',
          expiresAt,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Send in-app notification
      try {
        await createNotification({
          recipientId: userToAdd._id,
          senderId: inviterId,
          organizationId,
          type: NOTIFICATION_TYPE.PROJECT_MEMBER_ADDED,
          message: `${req.user.name} invited you to join organization "${organization.name}" as ${role}. Use the invite link sent to your email to join.`,
          entityId: organization._id,
          entityType: 'ORGANIZATION',
        });
      } catch (notifErr) {
        console.warn('Failed to send in-app notification:', notifErr.message);
      }

      // Send invitation email via nodemailer with invite link
      sendInvitationEmail({
        toEmail: userToAdd.email,
        inviterName: req.user.name,
        organizationName: organization.name,
        role,
        inviteLink,
        isNewUser: false,
      }).catch((err) => console.error('Failed to send invite email to existing user:', err.message));

      return res.status(201).json({
        success: true,
        message: `Invitation sent to ${userToAdd.name || userToAdd.email}. In-app notification and email invite link have been dispatched.`,
        invitation: {
          email: userToAdd.email,
          role,
          status: 'PENDING',
          isNewUser: false,
          expiresAt,
          inviteLink,
        },
      });
    }

    // ── CASE 2: User does NOT exist → auto-register + invite ──
    const placeholderPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(placeholderPassword, 10);

    const newUser = await User.create({
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      passwordHash,
      isActive: false, // Inactive until invitation accepted + password set
    });

    // Create the invitation record
    await Invitation.create({
      organizationId,
      email: inviteEmail,
      role,
      invitedBy: inviterId,
      token: inviteToken,
      status: 'PENDING',
      expiresAt,
    });

    // Send invitation email with setup password link
    sendInvitationEmail({
      toEmail: inviteEmail,
      inviterName: req.user.name,
      organizationName: organization.name,
      role,
      inviteLink,
      isNewUser: true,
    }).catch((err) => console.error('Failed to send invite email to new user:', err.message));

    return res.status(201).json({
      success: true,
      message: `User registered and invitation sent to ${inviteEmail}. An email with a link to setup password and join has been dispatched.`,
      invitation: {
        email: inviteEmail,
        role,
        status: 'PENDING',
        isNewUser: true,
        expiresAt,
        inviteLink,
      },
    });
  } catch (error) {
    console.error('Add Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to invite member to organization.',
      error: error.message,
    });
  }
};

/**
 * Accept an organization invitation & set password
 * POST /api/auth/accept-invite
 *
 * Body: { token, name? (optional), password }
 *
 * Flow:
 *   1. Validate token is PENDING and not expired
 *   2. Activate the user account, set their password
 *   3. Add the user as an OrganizationMember with the invited role
 *   4. Mark invitation as ACCEPTED
 *   5. Return a JWT so the user is logged in immediately
 */
const acceptInvitation = async (req, res) => {
  try {
    const { token, password, name } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token is required.',
      });
    }

    // Find the pending invitation
    const invitation = await Invitation.findOne({
      token,
      status: 'PENDING',
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or already used invitation link.',
      });
    }

    // Check expiry
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'EXPIRED';
      await invitation.save();
      return res.status(410).json({
        success: false,
        message: 'This invitation has expired. Please request a new invitation.',
      });
    }

    // Find or verify the user
    const user = await User.findOne({ email: invitation.email }).select('+passwordHash');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account associated with this invitation was not found.',
      });
    }

    // Set or update password
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long.',
        });
      }
      user.passwordHash = await bcrypt.hash(password, 10);
      user.isActive = true;
    } else if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to set up your new account.',
      });
    }

    if (name && name.trim()) {
      user.name = name.trim();
    }
    await user.save();

    // Add user to the organization with the assigned role
    await OrganizationMember.findOneAndUpdate(
      { organizationId: invitation.organizationId, userId: user._id },
      {
        organizationId: invitation.organizationId,
        userId: user._id,
        role: invitation.role,
        joinedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Mark invitation as accepted
    invitation.status = 'ACCEPTED';
    invitation.acceptedAt = new Date();
    await invitation.save();

    // Notify inviter that member accepted
    const org = await Organization.findById(invitation.organizationId);
    try {
      await createNotification({
        recipientId: invitation.invitedBy,
        senderId: user._id,
        organizationId: invitation.organizationId,
        type: NOTIFICATION_TYPE.PROJECT_MEMBER_ADDED,
        message: `${user.name} accepted your invitation to join "${org ? org.name : 'Organization'}" as ${invitation.role}.`,
        entityId: invitation.organizationId,
        entityType: 'ORGANIZATION',
      });
    } catch (notifErr) {
      console.warn('Failed to notify inviter of acceptance:', notifErr.message);
    }

    // Generate JWT so user is immediately logged in
    const jwtToken = user.generateAuthToken();

    return res.status(200).json({
      success: true,
      message: 'Invitation accepted! You have successfully joined the organization.',
      token: jwtToken,
      expiresIn: '24h',
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: invitation.role,
        isActive: true,
      },
      organization: org
        ? {
            id: org._id,
            _id: org._id,
            name: org.name,
            slug: org.slug,
            role: invitation.role,
          }
        : null,
    });
  } catch (error) {
    console.error('Accept Invitation Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept invitation.',
      error: error.message,
    });
  }
};

/**
 * Verify an invitation token (check validity without accepting)
 * GET /api/auth/verify-invite?token=... or GET /api/organizations/verify-invite?token=...
 */
const verifyInvitation = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required.' });
    }

    const invitation = await Invitation.findOne({ token, status: 'PENDING' });
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invalid or already used invitation link.' });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = 'EXPIRED';
      await invitation.save();
      return res.status(410).json({ success: false, message: 'This invitation has expired.' });
    }

    const org = await Organization.findById(invitation.organizationId).select('name slug');
    const inviter = await User.findById(invitation.invitedBy).select('name email');
    const user = await User.findOne({ email: invitation.email }).select('name isActive');

    return res.status(200).json({
      success: true,
      invitation: {
        email: invitation.email,
        role: invitation.role,
        organization: org ? { id: org._id, name: org.name, slug: org.slug } : null,
        invitedBy: inviter ? { name: inviter.name } : { name: 'Workspace Admin' },
        expiresAt: invitation.expiresAt,
        isNewUser: !user || !user.isActive,
        userName: user ? user.name : '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to verify invitation.', error: error.message });
  }
};

/**
 * Remove member from organization
 * DELETE /api/organizations/:id/members/:userId
 */
const removeMember = async (req, res) => {
  try {
    const { id: organizationId, userId: targetUserId } = req.params;

    // Check if user is trying to remove the owner
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found.',
      });
    }

    if (organization.ownerId.toString() === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the organization owner.',
      });
    }

    const deleted = await OrganizationMember.findOneAndDelete({
      organizationId,
      userId: targetUserId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this organization.',
      });
    }

    // Cascading cleanup: Remove user from all project memberships within this organization
    await ProjectMember.deleteMany({
      organizationId,
      userId: targetUserId,
    });

    // Cascading cleanup: Unassign tasks assigned to this user in this organization
    await Task.updateMany(
      { organizationId, assigneeId: targetUserId },
      { $unset: { assigneeId: 1 } }
    );

    return res.status(200).json({
      success: true,
      message: 'Member removed from organization successfully.',
    });
  } catch (error) {
    console.error('Remove Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove member.',
      error: error.message,
    });
  }
};

/**
 * Update member role (OWNER or ADMIN only)
 * PATCH /api/organizations/:id/members/:userId
 */
const updateMemberRole = async (req, res) => {
  try {
    const { id: organizationId, userId: targetUserId } = req.params;
    const { role } = req.body;

    const organization = await Organization.findById(organizationId);
    if (organization && organization.ownerId.toString() === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot alter role of primary organization owner.',
      });
    }

    const member = await OrganizationMember.findOneAndUpdate(
      { organizationId, userId: targetUserId },
      { role },
      { new: true }
    ).populate('userId', 'name email');

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in organization.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Member role updated successfully.',
      member: {
        id: member._id,
        userId: member.userId._id,
        name: member.userId.name,
        email: member.userId.email,
        role: member.role,
      },
    });
  } catch (error) {
    console.error('Update Member Role Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update member role.',
      error: error.message,
    });
  }
};

/**
 * List all members of an organization
 * GET /api/organizations/:id/members
 */
const getMembers = async (req, res) => {
  try {
    const { id: organizationId } = req.params;

    const { data: members, pagination } = await paginate(OrganizationMember, {
      filter: { organizationId },
      queryParams: req.query,
      populate: [{ path: 'userId', select: 'name email lastLoginAt' }],
      defaultSort: { createdAt: 1 },
      defaultLimit: 50,
    });

    return res.status(200).json({
      success: true,
      pagination,
      count: members.length,
      members: members.map((m) => ({
        id: m._id,
        userId: m.userId?._id || m.userId,
        user: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error('Get Members Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch members.',
      error: error.message,
    });
  }
};

module.exports = {
  createOrganization,
  getOrganizations,
  getOrganizationById,
  updateOrganization,
  addMember,
  removeMember,
  updateMemberRole,
  getMembers,
  acceptInvitation,
  verifyInvitation,
};
