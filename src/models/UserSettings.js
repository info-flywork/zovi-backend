'use strict';

class UserSettings {
  constructor(row) {
    this.userId = row.user_id;
    this.pushEnabled = Boolean(row.push_enabled);
    this.chatNotifications = Boolean(row.chat_notifications);
    this.storyNotifications = Boolean(row.story_notifications);
    this.pulseNotifications = Boolean(row.pulse_notifications);
    this.checkInNotifications = Boolean(row.check_in_notifications);
    this.friendRequestNotifications = Boolean(row.friend_request_notifications);
    this.planNotifications = Boolean(row.plan_notifications);
    this.mentionNotifications = Boolean(row.mention_notifications);
    this.mapShareLocation = Boolean(row.map_share_location);
    this.showOnlineStatus = Boolean(row.show_online_status);
    this.preferredLanguage = row.preferred_language;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new UserSettings(row);
  }

  toJSON() {
    return {
      userId: this.userId,
      pushEnabled: this.pushEnabled,
      chatNotifications: this.chatNotifications,
      storyNotifications: this.storyNotifications,
      pulseNotifications: this.pulseNotifications,
      checkInNotifications: this.checkInNotifications,
      friendRequestNotifications: this.friendRequestNotifications,
      planNotifications: this.planNotifications,
      mentionNotifications: this.mentionNotifications,
      mapShareLocation: this.mapShareLocation,
      showOnlineStatus: this.showOnlineStatus,
      preferredLanguage: this.preferredLanguage,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { UserSettings };
