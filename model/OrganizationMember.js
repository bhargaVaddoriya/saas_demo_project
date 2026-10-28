const mongoose = require("mongoose");
const { ORGANIZATION, USER, ORGANIZATION_MEMBER } = require('../constants/database.constant');
const { ROLES } = require('../constants/enums.constant');

const organizationMemberSchema = new mongoose.Schema(
  {
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
      enum: Object.values(ROLES),
      default: ROLES.MEMBER,
      required: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent duplicate membership for the same user in an organization
organizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true }
);

// Fast lookups for all organizations a user belongs to
organizationMemberSchema.index({ userId: 1, organizationId: 1 });

module.exports = mongoose.model(
  ORGANIZATION_MEMBER,
  organizationMemberSchema
);