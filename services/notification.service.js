const { Notification } = require('../model');

/**
 * Dispatch an in-app notification to a user.
 * 
 * @param {Object} params
 * @param {ObjectId|string} params.recipientId
 * @param {ObjectId|string} [params.senderId]
 * @param {ObjectId|string} params.organizationId
 * @param {string} params.type (NOTIFICATION_TYPE enum)
 * @param {string} params.message
 * @param {ObjectId|string} params.entityId
 * @param {string} params.entityType ('TASK' | 'PROJECT' | 'COMMENT' | 'ORGANIZATION')
 */
const createNotification = async ({
  recipientId,
  senderId = null,
  organizationId,
  type,
  message,
  entityId,
  entityType,
}) => {
  try {
    // Prevent notifying oneself
    if (senderId && recipientId && senderId.toString() === recipientId.toString()) {
      return null;
    }

    if (!recipientId || !organizationId || !type || !message) {
      return null;
    }

    const notification = await Notification.create({
      recipientId,
      senderId,
      organizationId,
      type,
      message,
      entityId,
      entityType,
    });

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error.message);
    return null;
  }
};

module.exports = { createNotification };
