'use strict';

class UserProfile {
  constructor(row) {
    this.userId = row.user_id;
    this.fullName = row.full_name ?? '';
    this.username = row.username ?? null;
    this.avatarUrl = row.avatar_url ?? null;
    this.avatarStorageKey = row.avatar_storage_key ?? null;
    this.avatarBlurhash = row.avatar_blurhash ?? null;
    this.bio = row.bio ?? null;
    this.locationText = row.location_text ?? null;
    this.birthDate = row.birth_date ?? null;
    this.gender = row.gender ?? null;
    this.isVerified = Boolean(row.is_verified);
    this.accountPrivacy = row.account_privacy;
    this.equippedTitleId = row.equipped_title_id ?? null;
    this.streakCount = row.streak_count ?? 0;
    this.coins = row.coins ?? 0;
    this.checkInsCount = row.check_ins_count ?? 0;
    this.friendsCount = row.friends_count ?? 0;
    this.followersCount = row.followers_count ?? 0;
    this.followingCount = row.following_count ?? 0;
    this.pendingIncomingRequestsCount = row.pending_incoming_requests_count ?? 0;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static fromRow(row) {
    if (!row) return null;
    return new UserProfile(row);
  }

  get isProfileComplete() {
    return Boolean(
      this.fullName &&
        this.fullName.trim().length > 0 &&
        this.username &&
        this.username.trim().length > 0,
    );
  }

  toJSON() {
    return {
      userId: this.userId,
      fullName: this.fullName,
      username: this.username,
      avatarUrl: this.avatarUrl,
      bio: this.bio,
      locationText: this.locationText,
      birthDate: this.birthDate,
      gender: this.gender,
      isVerified: this.isVerified,
      accountPrivacy: this.accountPrivacy,
      streakCount: this.streakCount,
      coins: this.coins,
      checkInsCount: this.checkInsCount,
      friendsCount: this.friendsCount,
      followersCount: this.followersCount,
      followingCount: this.followingCount,
      pendingIncomingRequestsCount: this.pendingIncomingRequestsCount,
      isProfileComplete: this.isProfileComplete,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = { UserProfile };
