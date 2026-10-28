const { ActivityLog, OrganizationMember } = require('../model');
const { paginate } = require('../utils/paginate.util');

/**
 * Get activity log feed for a project
 * GET /api/projects/:projectId/activity or GET /api/activity/project/:projectId
 */
const getProjectActivity = async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: activities, pagination } = await paginate(ActivityLog, {
      filter: { projectId },
      queryParams: req.query,
      searchFields: ['summary', 'action'],
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'taskId', select: 'title status' },
      ],
      defaultSort: { createdAt: -1 },
      defaultLimit: 30,
    });

    return res.status(200).json({
      success: true,
      pagination,
      activities,
    });
  } catch (error) {
    console.error('Get Project Activity Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs.',
      error: error.message,
    });
  }
};

/**
 * Get organization-wide activity feed
 * GET /api/activity?organizationId=...
 */
const getOrganizationActivity = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const currentUserId = req.user._id;

    let targetOrgId = organizationId || req.headers['x-organization-id'];
    if (!targetOrgId) {
      const firstMem = await OrganizationMember.findOne({ userId: currentUserId }).sort({ createdAt: 1 });
      if (firstMem) targetOrgId = firstMem.organizationId;
    }

    if (!targetOrgId) {
      return res.status(200).json({
        success: true,
        pagination: { total: 0, page: 1, limit: 30, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        activities: [],
      });
    }

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

    const { data: activities, pagination } = await paginate(ActivityLog, {
      filter: { organizationId: targetOrgId },
      queryParams: req.query,
      searchFields: ['summary', 'action'],
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'projectId', select: 'name' },
        { path: 'taskId', select: 'title status' },
      ],
      defaultSort: { createdAt: -1 },
      defaultLimit: 30,
    });

    return res.status(200).json({
      success: true,
      pagination,
      activities,
    });
  } catch (error) {
    console.error('Get Org Activity Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch activity stream.',
      error: error.message,
    });
  }
};

module.exports = {
  getProjectActivity,
  getOrganizationActivity,
};
