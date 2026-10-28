const mongoose = require('mongoose');
const { ORGANIZATION, USER } = require('../constants/database.constant');
const { ROLES } = require('../constants/enums.constant');

const invitationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: ORGANIZATION,
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.MEMBER,
      required: true,
    },

    // The user who sent the invitation
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
    },

    // Secure token for accepting the invitation via link
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Status tracking
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },

    // Token expiry (default: 7 days from creation)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate pending invitations for the same email + organization
invitationSchema.index(
  { organizationId: 1, email: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('db_invitations', invitationSchema);
