const { Task, Project, ProjectMember, OrganizationMember, User } = require('../model');
const { ACTIVITY_ACTION, NOTIFICATION_TYPE, TASK_STATUS, ROLES } = require('../constants/enums.constant');
const { logActivity } = require('../services/activity.service');
const { createNotification } = require('../services/notification.service');
const { paginate } = require('../utils/paginate.util');

/**
 * Create a new task within a project
 * POST /api/tasks
 */
const createTask = async (req, res) => {
  try {
    const { title, description, projectId, assigneeId, status = TASK_STATUS.TODO, priority, dueDate, labels } = req.body;
    const currentUserId = req.user._id;

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project || project.isArchived) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or archived.',
      });
    }

    // Verify tenant access
    const orgMember = await OrganizationMember.findOne({
      organizationId: project.organizationId,
      userId: currentUserId,
    });

    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    // Calculate next order in this status column
    const highestOrderTask = await Task.findOne({ projectId, status })
      .sort({ order: -1 })
      .select('order');
    const order = highestOrderTask ? highestOrderTask.order + 1 : 0;

    // Create task
    const task = await Task.create({
      title,
      description: description || '',
      organizationId: project.organizationId,
      projectId,
      assigneeId: assigneeId || null,
      reporterId: currentUserId,
      status,
      priority,
      dueDate: dueDate || null,
      labels: labels || [],
      order,
    });

    // Populate for response
    await task.populate('reporterId', 'name email');
    if (task.assigneeId) {
      await task.populate('assigneeId', 'name email');
    }

    // Log activity
    logActivity({
      organizationId: project.organizationId,
      projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.TASK_CREATED,
      summary: `${req.user.name} created task "${task.title}"`,
      details: { priority: task.priority, status: task.status },
    });

    // Dispatch notification if assigned immediately
    if (assigneeId) {
      createNotification({
        recipientId: assigneeId,
        senderId: currentUserId,
        organizationId: project.organizationId,
        type: NOTIFICATION_TYPE.TASK_ASSIGNED,
        message: `${req.user.name} assigned you to task "${task.title}"`,
        entityId: task._id,
        entityType: 'TASK',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      task,
    });
  } catch (error) {
    console.error('Create Task Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create task.',
      error: error.message,
    });
  }
};

/**
 * Helper to resolve user permissions for a specific task
 */
async function getTaskUserRole(task, userId) {
  const orgMember = await OrganizationMember.findOne({
    organizationId: task.organizationId,
    userId,
  });
  if (!orgMember) return { hasOrgAccess: false };

  const isOrgAdmin = [ROLES.OWNER, ROLES.ADMIN].includes(orgMember.role);
  
  const projMember = await ProjectMember.findOne({
    projectId: task.projectId,
    userId,
  });

  const isProjManager = projMember && projMember.role === 'MANAGER';
  const isAssignee = task.assigneeId && task.assigneeId.toString() === userId.toString();
  const isReporter = task.reporterId && task.reporterId.toString() === userId.toString();

  return {
    hasOrgAccess: true,
    orgRole: orgMember.role,
    isOrgAdmin,
    isProjManager,
    isAssignee,
    isReporter,
    canManage: isOrgAdmin || isProjManager || isReporter,
    canUpdateStatus: isOrgAdmin || isProjManager || isReporter || isAssignee || !!projMember,
  };
}

/**
 * Get tasks with filtering, search, and pagination
 * GET /api/tasks?projectId=...&organizationId=...&status=...&priority=...&assigneeId=...&search=...&page=1&limit=20
 */
const getTasks = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const {
      projectId,
      organizationId,
      status,
      priority,
      assigneeId,
      search,
      isArchived = 'false',
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const filter = {
      isArchived: isArchived === 'true',
    };

    if (projectId) filter.projectId = projectId;
    if (organizationId) filter.organizationId = organizationId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assigneeId) filter.assigneeId = assigneeId;

    // If neither projectId nor organizationId was provided, filter by organizations the user belongs to
    if (!projectId && !organizationId) {
      const myMemberships = await OrganizationMember.find({ userId: currentUserId }).select('organizationId');
      const orgIds = myMemberships.map((m) => m.organizationId);
      filter.organizationId = { $in: orgIds };
    }

    const { data: tasks, pagination } = await paginate(Task, {
      filter,
      queryParams: req.query,
      searchFields: ['title', 'description'],
      populate: [
        { path: 'assigneeId', select: 'name email' },
        { path: 'reporterId', select: 'name email' },
        { path: 'projectId', select: 'name status' },
      ],
      defaultSort: { createdAt: -1 },
    });

    return res.status(200).json({
      success: true,
      pagination,
      tasks,
    });
  } catch (error) {
    console.error('Get Tasks Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks.',
      error: error.message,
    });
  }
};

/**
 * Get Kanban Board tasks grouped by status for a project
 * GET /api/tasks/kanban?projectId=...
 */
const getKanbanBoard = async (req, res) => {
  try {
    const { projectId } = req.query;
    const currentUserId = req.user._id;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "projectId" is required for Kanban board.',
      });
    }

    // Verify project exists and tenant isolation
    const project = await Project.findById(projectId);
    if (!project || project.isArchived) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.',
      });
    }

    const orgMember = await OrganizationMember.findOne({
      organizationId: project.organizationId,
      userId: currentUserId,
    });

    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have access to this project.',
      });
    }

    const tasks = await Task.find({ projectId, isArchived: false })
      .populate('assigneeId', 'name email')
      .populate('reporterId', 'name email')
      .sort({ order: 1, createdAt: 1 });

    // Group columns
    const columns = {
      TODO: [],
      IN_PROGRESS: [],
      IN_REVIEW: [],
      COMPLETED: [],
    };

    tasks.forEach((task) => {
      if (columns[task.status]) {
        columns[task.status].push(task);
      } else {
        columns.TODO.push(task);
      }
    });

    return res.status(200).json({
      success: true,
      columns,
      totalCount: tasks.length,
    });
  } catch (error) {
    console.error('Get Kanban Board Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Kanban board tasks.',
      error: error.message,
    });
  }
};

/**
 * Get single task by ID
 * GET /api/tasks/:id
 */
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const task = await Task.findById(id)
      .populate('assigneeId', 'name email')
      .populate('reporterId', 'name email')
      .populate('projectId', 'name status organizationId');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const orgMember = await OrganizationMember.findOne({
      organizationId: task.organizationId,
      userId: currentUserId,
    });

    if (!orgMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    return res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('Get Task By ID Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch task.',
      error: error.message,
    });
  }
};

/**
 * Update task
 * PUT /api/tasks/:id
 */
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;
    const { title, description, status, priority, assigneeId, dueDate, labels, order } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const authCheck = await getTaskUserRole(task, currentUserId);
    if (!authCheck.hasOrgAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    if (!authCheck.canManage && !authCheck.isAssignee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions to modify this task.',
      });
    }

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (status) task.status = status;
    if (priority) task.priority = priority;
    if (assigneeId !== undefined) task.assigneeId = assigneeId || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    if (labels) task.labels = labels;
    if (order !== undefined) task.order = order;

    await task.save();

    await task.populate('assigneeId', 'name email');
    await task.populate('reporterId', 'name email');

    logActivity({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.TASK_UPDATED,
      summary: `${req.user.name} updated task "${task.title}"`,
    });

    return res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      task,
    });
  } catch (error) {
    console.error('Update Task Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update task.',
      error: error.message,
    });
  }
};

/**
 * Update task status (Kanban movement)
 * PATCH /api/tasks/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, order } = req.body;
    const currentUserId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const authCheck = await getTaskUserRole(task, currentUserId);
    if (!authCheck.hasOrgAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    if (!authCheck.canUpdateStatus) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to update status on this project.',
      });
    }

    const previousStatus = task.status;
    task.status = status;
    if (order !== undefined) {
      task.order = order;
    }

    await task.save();
    await task.populate('assigneeId', 'name email');

    // Log status change activity
    logActivity({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.TASK_STATUS_CHANGED,
      summary: `${req.user.name} moved "${task.title}" from ${previousStatus} to ${status}`,
      details: { previousStatus, newStatus: status },
    });

    // Notify assignee if someone else moved their task
    if (task.assigneeId && task.assigneeId._id.toString() !== currentUserId.toString()) {
      createNotification({
        recipientId: task.assigneeId._id,
        senderId: currentUserId,
        organizationId: task.organizationId,
        type: NOTIFICATION_TYPE.TASK_STATUS_CHANGED,
        message: `${req.user.name} moved your task "${task.title}" to ${status}`,
        entityId: task._id,
        entityType: 'TASK',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Task status updated successfully.',
      task,
    });
  } catch (error) {
    console.error('Update Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status.',
      error: error.message,
    });
  }
};

/**
 * Update task assignee
 * PATCH /api/tasks/:id/assignee
 */
const updateAssignee = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigneeId } = req.body;
    const currentUserId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const authCheck = await getTaskUserRole(task, currentUserId);
    if (!authCheck.hasOrgAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    if (!authCheck.canManage) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only managers or admins can assign tasks.',
      });
    }

    task.assigneeId = assigneeId || null;
    await task.save();

    await task.populate('assigneeId', 'name email');

    logActivity({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.TASK_ASSIGNED,
      summary: task.assigneeId
        ? `${req.user.name} assigned task "${task.title}" to ${task.assigneeId.name}`
        : `${req.user.name} unassigned task "${task.title}"`,
    });

    if (task.assigneeId) {
      createNotification({
        recipientId: task.assigneeId._id,
        senderId: currentUserId,
        organizationId: task.organizationId,
        type: NOTIFICATION_TYPE.TASK_ASSIGNED,
        message: `${req.user.name} assigned task "${task.title}" to you`,
        entityId: task._id,
        entityType: 'TASK',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Task assignee updated successfully.',
      task,
    });
  } catch (error) {
    console.error('Update Assignee Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update assignee.',
      error: error.message,
    });
  }
};

/**
 * Archive / Delete task
 * DELETE /api/tasks/:id
 */
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const authCheck = await getTaskUserRole(task, currentUserId);
    if (!authCheck.hasOrgAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not belong to this organization.',
      });
    }

    if (!authCheck.canManage) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions to archive this task.',
      });
    }

    task.isArchived = true;
    await task.save();

    logActivity({
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task._id,
      userId: currentUserId,
      action: ACTIVITY_ACTION.TASK_ARCHIVED,
      summary: `${req.user.name} archived task "${task.title}"`,
    });

    return res.status(200).json({
      success: true,
      message: 'Task archived successfully.',
    });
  } catch (error) {
    console.error('Delete Task Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to archive task.',
      error: error.message,
    });
  }
};

module.exports = {
  createTask,
  getTasks,
  getKanbanBoard,
  getTaskById,
  updateTask,
  updateStatus,
  updateAssignee,
  deleteTask,
};
