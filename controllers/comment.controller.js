const { Comment, Task, OrganizationMember, ProjectMember } = require('../model');
const { ACTIVITY_ACTION, NOTIFICATION_TYPE, ROLES, PROJECT_ROLES } = require('../constants/enums.constant');
const { logActivity } = require('../services/activity.service');
const { createNotification } = require('../services/notification.service');
const { paginate } = require('../utils/paginate.util');

/**
 * Add a comment to a task
 * POST /api/tasks/:taskId/comments
 */
const addComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content, mentions = [] } = req.body;
    const currentUserId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Create comment
    const comment = await Comment.create({
      taskId,
      projectId: task.projectId,
      organizationId: task.organizationId,
      authorId: currentUserId,
      content,
      mentions,
    });

    await comment.populate('authorId', 'name email');
    if (mentions.length > 0) {
      await comment.populate('mentions', 'name email');
    }

    // Log activity
    logActivity({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.COMMENT_ADDED,
      summary: `${req.user.name} commented on task "${task.title}"`,
    });

    // Notify mentioned users
    if (Array.isArray(mentions)) {
      mentions.forEach((mentionedUserId) => {
        createNotification({
          recipientId: mentionedUserId,
          senderId: currentUserId,
          organizationId: task.organizationId,
          type: NOTIFICATION_TYPE.USER_MENTIONED,
          message: `${req.user.name} mentioned you in a comment on "${task.title}"`,
          entityId: task._id,
          entityType: 'TASK',
        });
      });
    }

    // Notify task assignee if commenter is not assignee
    if (task.assigneeId && task.assigneeId.toString() !== currentUserId.toString()) {
      createNotification({
        recipientId: task.assigneeId,
        senderId: currentUserId,
        organizationId: task.organizationId,
        type: NOTIFICATION_TYPE.TASK_STATUS_CHANGED,
        message: `${req.user.name} commented on your task "${task.title}"`,
        entityId: task._id,
        entityType: 'TASK',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully.',
      comment,
    });
  } catch (error) {
    console.error('Add Comment Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add comment.',
      error: error.message,
    });
  }
};

/**
 * Get all comments for a task
 * GET /api/tasks/:taskId/comments
 */
const getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;

    const { data: comments, pagination } = await paginate(Comment, {
      filter: { taskId },
      queryParams: req.query,
      searchFields: ['content'],
      populate: [
        { path: 'authorId', select: 'name email' },
        { path: 'mentions', select: 'name email' },
      ],
      defaultSort: { createdAt: 1 },
      defaultLimit: 50,
    });

    return res.status(200).json({
      success: true,
      pagination,
      count: comments.length,
      comments,
    });
  } catch (error) {
    console.error('Get Task Comments Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch comments.',
      error: error.message,
    });
  }
};

/**
 * Update comment (author only)
 * PUT /api/comments/:id
 */
const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const currentUserId = req.user._id;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found.',
      });
    }

    if (comment.authorId.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only edit your own comments.',
      });
    }

    comment.content = content;
    comment.isEdited = true;
    await comment.save();

    await comment.populate('authorId', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Comment updated successfully.',
      comment,
    });
  } catch (error) {
    console.error('Update Comment Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update comment.',
      error: error.message,
    });
  }
};

/**
 * Delete comment (author or ADMIN/MANAGER)
 * DELETE /api/comments/:id
 */
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found.',
      });
    }

    // Check if author
    const isAuthor = comment.authorId.toString() === currentUserId.toString();

    // Or check if organization owner/admin or project manager
    const [orgMember, projectMember] = await Promise.all([
      OrganizationMember.findOne({ organizationId: comment.organizationId, userId: currentUserId }),
      ProjectMember.findOne({ projectId: comment.projectId, userId: currentUserId }),
    ]);

    const isModerator =
      (orgMember && [ROLES.OWNER, ROLES.ADMIN].includes(orgMember.role)) ||
      (projectMember && projectMember.role === PROJECT_ROLES.MANAGER);

    if (!isAuthor && !isModerator) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You cannot delete this comment.',
      });
    }

    await Comment.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully.',
    });
  } catch (error) {
    console.error('Delete Comment Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete comment.',
      error: error.message,
    });
  }
};

module.exports = {
  addComment,
  getTaskComments,
  updateComment,
  deleteComment,
};
