const { Project, ProjectMember, OrganizationMember, Task, User } = require('../model');
const { PROJECT_ROLES, ACTIVITY_ACTION, NOTIFICATION_TYPE, ROLES } = require('../constants/enums.constant');
const { logActivity } = require('../services/activity.service');
const { createNotification } = require('../services/notification.service');
const { paginate } = require('../utils/paginate.util');

/**
 * Create a new project within an organization
 * POST /api/projects
 */
const createProject = async (req, res) => {
  try {
    const { name, description, organizationId, status, priority, startDate, dueDate } = req.body;
    const userId = req.user._id;

    // Resolve organization from body, headers, or user's active membership
    let targetOrgId = organizationId || req.headers['x-organization-id'];
    if (!targetOrgId) {
      const firstMem = await OrganizationMember.findOne({ userId }).sort({ createdAt: 1 });
      if (firstMem) targetOrgId = firstMem.organizationId;
    }

    if (!targetOrgId) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required. Please create an organization first.',
      });
    }

    // Verify organization membership
    const orgMember = await OrganizationMember.findOne({
      organizationId: targetOrgId,
      userId,
    });

    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this organization.',
      });
    }

    // Create project
    const project = await Project.create({
      name,
      description: description || '',
      organizationId: targetOrgId,
      status,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      ownerId: userId,
    });

    // Add creator as MANAGER in ProjectMember
    await ProjectMember.create({
      projectId: project._id,
      organizationId: targetOrgId,
      userId,
      role: PROJECT_ROLES.MANAGER,
    });

    // Record activity log
    logActivity({
      organizationId: targetOrgId,
      projectId: project._id,
      userId,
      action: ACTIVITY_ACTION.PROJECT_CREATED,
      summary: `${req.user.name} created project "${project.name}"`,
    });

    return res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      project,
      data: project,
    });
  } catch (error) {
    console.error('Create Project Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create project.',
      error: error.message,
    });
  }
};

/**
 * Get projects with search, filter, and pagination
 * GET /api/projects?organizationId=...&status=...&priority=...&search=...&page=1&limit=20
 */
const getProjects = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      organizationId,
      status,
      priority,
      isArchived = 'false',
    } = req.query;

    let targetOrgId = organizationId || req.headers['x-organization-id'];
    if (!targetOrgId) {
      const firstMem = await OrganizationMember.findOne({ userId }).sort({ createdAt: 1 });
      if (firstMem) targetOrgId = firstMem.organizationId;
    }

    if (!targetOrgId) {
      return res.status(200).json({
        success: true,
        pagination: { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        projects: [],
        data: [],
      });
    }

    // Verify membership in organization
    const orgMember = await OrganizationMember.findOne({ organizationId: targetOrgId, userId });
    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this organization.',
      });
    }

    // Build filter query
    const filter = {
      organizationId: targetOrgId,
      isArchived: isArchived === 'true',
    };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // If user is regular MEMBER, limit to projects they are assigned to
    if (orgMember.role === ROLES.MEMBER) {
      const assignedProjects = await ProjectMember.find({ userId, organizationId: targetOrgId }).select('projectId');
      const projectIds = assignedProjects.map((p) => p.projectId);
      filter._id = { $in: projectIds };
    }

    const { data: projects, pagination } = await paginate(Project, {
      filter,
      queryParams: req.query,
      searchFields: ['name', 'description'],
      populate: [{ path: 'ownerId', select: 'name email' }],
      defaultSort: { createdAt: -1 },
    });

    return res.status(200).json({
      success: true,
      pagination,
      projects,
      data: projects,
    });

  } catch (error) {
    console.error('Get Projects Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch projects.',
      error: error.message,
    });
  }
};

/**
 * Get project by ID with task and member metrics
 * GET /api/projects/:id
 */
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const project = await Project.findById(id)
      .populate('ownerId', 'name email')
      .populate('organizationId', 'name');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Verify tenant access
    const orgMember = await OrganizationMember.findOne({
      organizationId: project.organizationId._id,
      userId,
    });

    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to the project organization.',
      });
    }

    // Check project-specific role
    const projectMember = await ProjectMember.findOne({ projectId: id, userId });

    // Aggregate task statistics
    const [totalTasks, completedTasks, memberCount] = await Promise.all([
      Task.countDocuments({ projectId: id, isArchived: false }),
      Task.countDocuments({ projectId: id, status: 'COMPLETED', isArchived: false }),
      ProjectMember.countDocuments({ projectId: id }),
    ]);

    const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    return res.status(200).json({
      success: true,
      project: {
        ...project.toObject(),
        myProjectRole: projectMember ? projectMember.role : (orgMember.role === ROLES.OWNER ? 'OWNER' : null),
        stats: {
          totalTasks,
          completedTasks,
          progressPercentage,
          memberCount,
        },
      },
    });
  } catch (error) {
    console.error('Get Project By ID Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch project details.',
      error: error.message,
    });
  }
};

/**
 * Update project details
 * PUT /api/projects/:id
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, priority, startDate, dueDate, isArchived } = req.body;
    const userId = req.user._id;

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Authorization: Organization OWNER/ADMIN or Project MANAGER
    const [orgMember, projectMember] = await Promise.all([
      OrganizationMember.findOne({ organizationId: project.organizationId, userId }),
      ProjectMember.findOne({ projectId: id, userId }),
    ]);

    const isAuthorized =
      (orgMember && [ROLES.OWNER, ROLES.ADMIN].includes(orgMember.role)) ||
      (projectMember && projectMember.role === PROJECT_ROLES.MANAGER) ||
      project.ownerId.toString() === userId.toString();

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions to modify this project.',
      });
    }

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (status) project.status = status;
    if (priority) project.priority = priority;
    if (startDate !== undefined) project.startDate = startDate;
    if (dueDate !== undefined) project.dueDate = dueDate;
    if (isArchived !== undefined) project.isArchived = isArchived;

    await project.save();

    // Log update activity
    logActivity({
      organizationId: project.organizationId,
      projectId: project._id,
      userId,
      action: isArchived ? ACTIVITY_ACTION.PROJECT_ARCHIVED : ACTIVITY_ACTION.PROJECT_UPDATED,
      summary: `${req.user.name} updated project "${project.name}"`,
    });

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully.',
      project,
    });
  } catch (error) {
    console.error('Update Project Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update project.',
      error: error.message,
    });
  }
};

/**
 * Archive or Delete project
 * DELETE /api/projects/:id
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    const orgMember = await OrganizationMember.findOne({ organizationId: project.organizationId, userId });
    const isOwnerOrAdmin = orgMember && [ROLES.OWNER, ROLES.ADMIN].includes(orgMember.role);

    if (!isOwnerOrAdmin && project.ownerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only organization owners/admins or project creator can delete/archive.',
      });
    }

    // Soft delete / archive project
    project.isArchived = true;
    project.status = 'ARCHIVED';
    await project.save();

    // Cascading soft-delete / archive on all associated tasks
    await Task.updateMany({ projectId: project._id }, { isArchived: true });

    logActivity({
      organizationId: project.organizationId,
      projectId: project._id,
      userId,
      action: ACTIVITY_ACTION.PROJECT_ARCHIVED,
      summary: `${req.user.name} archived project "${project.name}"`,
    });

    return res.status(200).json({
      success: true,
      message: 'Project archived successfully.',
    });
  } catch (error) {
    console.error('Delete Project Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to archive project.',
      error: error.message,
    });
  }
};

/**
 * Add member to project
 * POST /api/projects/:id/members
 */
const addMember = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { userId: targetUserId, role = PROJECT_ROLES.MEMBER } = req.body;
    const currentUserId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    // Ensure target user belongs to the organization first
    const isTargetInOrg = await OrganizationMember.findOne({
      organizationId: project.organizationId,
      userId: targetUserId,
    });

    if (!isTargetInOrg) {
      return res.status(400).json({
        success: false,
        message: 'User must be a member of the organization before joining this project.',
      });
    }

    // Check if already in project
    const existing = await ProjectMember.findOne({ projectId, userId: targetUserId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'User is already a member of this project.',
      });
    }

    const projectMember = await ProjectMember.create({
      projectId,
      organizationId: project.organizationId,
      userId: targetUserId,
      role,
    });

    const targetUser = await User.findById(targetUserId).select('name email');

    // Notify user
    createNotification({
      recipientId: targetUserId,
      senderId: currentUserId,
      organizationId: project.organizationId,
      type: NOTIFICATION_TYPE.PROJECT_MEMBER_ADDED,
      message: `${req.user.name} added you to project "${project.name}"`,
      entityId: project._id,
      entityType: 'PROJECT',
    });

    // Log activity
    logActivity({
      organizationId: project.organizationId,
      projectId: project._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.PROJECT_MEMBER_ADDED,
      summary: `${req.user.name} added ${targetUser ? targetUser.name : 'user'} to project`,
      details: { targetUserId, role },
    });

    return res.status(201).json({
      success: true,
      message: 'Member added to project successfully.',
      member: {
        id: projectMember._id,
        user: targetUser,
        role: projectMember.role,
        joinedAt: projectMember.createdAt,
      },
    });
  } catch (error) {
    console.error('Add Project Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add project member.',
      error: error.message,
    });
  }
};

/**
 * Remove member from project
 * DELETE /api/projects/:id/members/:userId
 */
const removeMember = async (req, res) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    const deleted = await ProjectMember.findOneAndDelete({
      projectId,
      userId: targetUserId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'User is not a member of this project.',
      });
    }

    // Cascading cleanup: unassign any active tasks assigned to this removed member in this project
    await Task.updateMany(
      { projectId, assigneeId: targetUserId },
      { $unset: { assigneeId: 1 } }
    );

    logActivity({
      organizationId: project.organizationId,
      projectId: project._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.PROJECT_MEMBER_REMOVED,
      summary: `${req.user.name} removed a member from project`,
      details: { targetUserId },
    });

    return res.status(200).json({
      success: true,
      message: 'Member removed from project successfully.',
    });
  } catch (error) {
    console.error('Remove Project Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove member from project.',
      error: error.message,
    });
  }
};

/**
 * List project members
 * GET /api/projects/:id/members
 */
const getMembers = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    const { data: members, pagination } = await paginate(ProjectMember, {
      filter: { projectId },
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
        user: m.userId,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get Project Members Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch project members.',
      error: error.message,
    });
  }
};

/**
 * Get project progress and status breakdown
 * GET /api/projects/:id/progress
 */
const getProjectProgress = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    const [todo, inProgress, inReview, completed] = await Promise.all([
      Task.countDocuments({ projectId, status: 'TODO', isArchived: false }),
      Task.countDocuments({ projectId, status: 'IN_PROGRESS', isArchived: false }),
      Task.countDocuments({ projectId, status: 'IN_REVIEW', isArchived: false }),
      Task.countDocuments({ projectId, status: 'COMPLETED', isArchived: false }),
    ]);

    const total = todo + inProgress + inReview + completed;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    return res.status(200).json({
      success: true,
      progress: {
        totalTasks: total,
        completedTasks: completed,
        percentage,
        breakdown: {
          TODO: todo,
          IN_PROGRESS: inProgress,
          IN_REVIEW: inReview,
          COMPLETED: completed,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch project progress.',
      error: error.message,
    });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  getMembers,
  getProjectProgress,
};
