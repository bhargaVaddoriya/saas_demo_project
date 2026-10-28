const mongoose = require('mongoose');
const { PROJECT, ORGANIZATION, USER } = require('../constants/database.constant');
const { PROJECT_STATUS, PRIORITY } = require('../constants/enums.constant');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: ORGANIZATION,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(PROJECT_STATUS),
      default: PROJECT_STATUS.PLANNING,
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

    startDate: {
      type: Date,
      default: null,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for tenant-isolated queries and dashboard metrics
projectSchema.index({ organizationId: 1, isArchived: 1, status: 1 });
projectSchema.index({ organizationId: 1, createdAt: -1 });

// Full text search on project name and description
projectSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model(PROJECT, projectSchema);
