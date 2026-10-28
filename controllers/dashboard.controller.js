const { Project, Task, OrganizationMember } = require('../model');

/**
 * Get comprehensive analytics dashboard for an organization
 * GET /api/dashboard?organizationId=...
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const currentUserId = req.user._id;

    let targetOrgId = organizationId || req.headers['x-organization-id'];
    if (!targetOrgId) {
      const firstMem = await OrganizationMember.findOne({ userId: currentUserId }).sort({ createdAt: 1 });
      if (firstMem) targetOrgId = firstMem.organizationId;
    }

    if (!targetOrgId) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required for dashboard analytics.',
      });
    }

    // Verify user belongs to organization
    const membership = await OrganizationMember.findOne({
      organizationId: targetOrgId,
      userId: currentUserId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    const now = new Date();

    // 1. Projects statistics
    const [totalProjects, activeProjects, completedProjects, planningProjects] = await Promise.all([
      Project.countDocuments({ organizationId: targetOrgId, isArchived: false }),
      Project.countDocuments({ organizationId: targetOrgId, status: 'ACTIVE', isArchived: false }),
      Project.countDocuments({ organizationId: targetOrgId, status: 'COMPLETED', isArchived: false }),
      Project.countDocuments({ organizationId: targetOrgId, status: 'PLANNING', isArchived: false }),
    ]);

    // 2. Tasks statistics
    const [
      totalTasks,
      completedTasks,
      overdueTasks,
      myAssignedTasks,
      todoTasks,
      inProgressTasks,
      inReviewTasks,
    ] = await Promise.all([
      Task.countDocuments({ organizationId: targetOrgId, isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, status: 'COMPLETED', isArchived: false }),
      Task.countDocuments({
        organizationId: targetOrgId,
        isArchived: false,
        status: { $ne: 'COMPLETED' },
        dueDate: { $lt: now, $ne: null },
      }),
      Task.countDocuments({
        organizationId: targetOrgId,
        assigneeId: currentUserId,
        isArchived: false,
      }),
      Task.countDocuments({ organizationId: targetOrgId, status: 'TODO', isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, status: 'IN_PROGRESS', isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, status: 'IN_REVIEW', isArchived: false }),
    ]);

    // 3. Tasks by priority breakdown
    const [lowPriority, mediumPriority, highPriority, criticalPriority] = await Promise.all([
      Task.countDocuments({ organizationId: targetOrgId, priority: 'LOW', isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, priority: 'MEDIUM', isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, priority: 'HIGH', isArchived: false }),
      Task.countDocuments({ organizationId: targetOrgId, priority: 'CRITICAL', isArchived: false }),
    ]);

    // 4. Recent project activity summary
    const recentProjects = await Project.find({ organizationId: targetOrgId, isArchived: false })
      .populate('ownerId', 'name email')
      .sort({ updatedAt: -1 })
      .limit(5);

    // 5. My upcoming tasks
    const upcomingTasks = await Task.find({
      organizationId: targetOrgId,
      assigneeId: currentUserId,
      status: { $ne: 'COMPLETED' },
      isArchived: false,
    })
      .populate('projectId', 'name')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      analytics: {
        projects: {
          total: totalProjects,
          active: activeProjects,
          completed: completedProjects,
          planning: planningProjects,
        },
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          overdue: overdueTasks,
          assignedToMe: myAssignedTasks,
          byStatus: {
            TODO: todoTasks,
            IN_PROGRESS: inProgressTasks,
            IN_REVIEW: inReviewTasks,
            COMPLETED: completedTasks,
          },
          byPriority: {
            LOW: lowPriority,
            MEDIUM: mediumPriority,
            HIGH: highPriority,
            CRITICAL: criticalPriority,
          },
        },
        recentProjects,
        upcomingTasks,
      },
    });
  } catch (error) {
    console.error('Dashboard Analytics Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard analytics.',
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardAnalytics,
};
