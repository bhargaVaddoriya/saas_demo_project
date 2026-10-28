const { Notification } = require('../model');
const { paginate } = require('../utils/paginate.util');

/**
 * Get user's notifications
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { isRead } = req.query;

    const filter = { recipientId: currentUserId };
    if (isRead !== undefined) {
      filter.isRead = isRead === 'true';
    }

    const [{ data: notifications, pagination }, unreadCount] = await Promise.all([
      paginate(Notification, {
        filter,
        queryParams: req.query,
        searchFields: ['message'],
        populate: [{ path: 'senderId', select: 'name email' }],
        defaultSort: { createdAt: -1 },
        defaultLimit: 20,
      }),
      Notification.countDocuments({ recipientId: currentUserId, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      unreadCount,
      pagination,
      notifications,
    });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications.',
      error: error.message,
    });
  }
};

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipientId: currentUserId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification,
    });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read.',
      error: error.message,
    });
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    await Notification.updateMany(
      { recipientId: currentUserId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    console.error('Mark All Read Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all as read.',
      error: error.message,
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
