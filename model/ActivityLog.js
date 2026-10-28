const mongoose = require('mongoose');
const { ACTIVITY_LOG, ORGANIZATION, PROJECT, TASK, USER } = require('../constants/database.constant');
const { ACTIVITY_ACTION } = require('../constants/enums.constant');

const activityLogSchema = new mongoose.Schema(
  {
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

    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: TASK,
      default: null,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: Object.values(ACTIVITY_ACTION),
      required: true,
    },

    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable audit log
  }
);

// High performance timeline feeds
activityLogSchema.index({ projectId: 1, createdAt: -1 });
activityLogSchema.index({ organizationId: 1, createdAt: -1 });
activityLogSchema.index({ taskId: 1, createdAt: -1 });

module.exports = mongoose.model(ACTIVITY_LOG, activityLogSchema);
