'use strict';

class UserOnboardingFlags {
  constructor(row) {
    this.userId = row.user_id;
    this.introDone = Boolean(row.intro_done);
    this.onboardingDone = Boolean(row.onboarding_done);
    this.notificationPermission = row.notification_permission;
    this.locationPermission = row.location_permission;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new UserOnboardingFlags(row);
  }

  toJSON() {
    return {
      userId: this.userId,
      introDone: this.introDone,
      onboardingDone: this.onboardingDone,
      notificationPermission: this.notificationPermission,
      locationPermission: this.locationPermission,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { UserOnboardingFlags };
