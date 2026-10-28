const mongoose = require('mongoose');
const { TASK, PROJECT, ORGANIZATION, USER } = require('../constants/database.constant');
const { TASK_STATUS, PRIORITY } = require('../constants/enums.constant');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: ORGANIZATION,
      required: true,
      index: true,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: PROJECT,
      required: true,
      index: true,
    },

    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      default: null,
      index: true,
    },

    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      required: true,
      index: true,
    },

    priority: {
      type: String,
      enum: Object.values(PRIORITY),
      default: PRIORITY.MEDIUM,
      required: true,
      index: true,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    labels: {
      type: [String],
      default: [],
    },

    // Order index within the status column for Kanban drag-and-drop
    order: {
      type: Number,
      default: 0,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Kanban board fast fetch index (grouped by project and status, ordered by board column position)
taskSchema.index({ projectId: 1, status: 1, order: 1 });

// Task list & pagination index
taskSchema.index({ projectId: 1, isArchived: 1, createdAt: -1 });

// User workload & "Assigned to Me" query index
taskSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });

// Overdue tasks and reminder query index
taskSchema.index({ organizationId: 1, dueDate: 1, status: 1 });

// Text search on title and description
taskSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model(TASK, taskSchema);
