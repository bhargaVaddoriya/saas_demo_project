const { ActivityLog } = require('../model');

/**
 * Record an activity / audit event in the project or organization stream.
 * 
 * @param {Object} params
 * @param {ObjectId|string} params.organizationId
 * @param {ObjectId|string} params.projectId
 * @param {ObjectId|string} [params.taskId]
 * @param {ObjectId|string} params.userId
 * @param {string} params.action (ACTIVITY_ACTION enum)
 * @param {string} params.summary Human readable description
 * @param {Object} [params.details] Key-value metadata
 */
const logActivity = async ({
  organizationId,
  projectId,
  taskId = null,
  userId,
  action,
  summary,
  details = {},
}) => {
  try {
    if (!organizationId || !projectId || !userId || !action || !summary) {
      console.warn('ActivityLog skipped: missing mandatory parameters');
      return null;
    }

    const log = await ActivityLog.create({
      organizationId,
      projectId,
      taskId,
      userId,
      action,
      summary,
      details,
    });

    return log;
  } catch (error) {
    console.error('Failed to log activity event:', error.message);
    return null;
  }
};

module.exports = { logActivity };
