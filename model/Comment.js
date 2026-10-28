const mongoose = require('mongoose');
const { COMMENT, TASK, PROJECT, ORGANIZATION, USER } = require('../constants/database.constant');

const commentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: TASK,
      required: true,
      index: true,
    },

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

    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: USER,
      },
    ],

    isEdited: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Chronological retrieval of comments per task
commentSchema.index({ taskId: 1, createdAt: 1 });

module.exports = mongoose.model(COMMENT, commentSchema);
