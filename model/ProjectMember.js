const mongoose = require('mongoose');
const { PROJECT_MEMBER, PROJECT, ORGANIZATION, USER } = require('../constants/database.constant');
const { PROJECT_ROLES } = require('../constants/enums.constant');

const projectMemberSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: PROJECT,
      required: true,
      index: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: ORGANIZATION,
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: Object.values(PROJECT_ROLES),
      default: PROJECT_ROLES.MEMBER,
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate membership for the same user in a project
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Efficient querying for projects assigned to a user
projectMemberSchema.index({ userId: 1, organizationId: 1 });

module.exports = mongoose.model(PROJECT_MEMBER, projectMemberSchema);
