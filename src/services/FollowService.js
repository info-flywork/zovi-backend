'use strict';

const { FollowRepository } = require('./FollowRepository');
const { NotificationService } = require('./NotificationService');
const { UserRepository } = require('./UserRepository');

class FollowService {
  constructor({
    follows = new FollowRepository(),
    notifications = new NotificationService(),
    users = new UserRepository(),
  } = {}) {
    this.follows = follows;
    this.notifications = notifications;
    this.users = users;
  }

  async getRelationship(viewerId, targetId) {
    return this.follows.getRelationship(viewerId, targetId);
  }

  /**
   * Public target → instant follow + started_following notification.
   * Private target → follow_request + follow_request notification.
   */
  async follow(actorId, targetId) {
    if (!actorId || !targetId || actorId === targetId) {
      const err = new Error('Invalid follow target');
      err.status = 400;
      err.code = 'INVALID_TARGET';
      throw err;
    }

    const blocked = await this.users.isBlockedEitherWay(actorId, targetId);
    if (blocked) {
      const err = new Error('User not found');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const target = await this.users.getProfile(targetId);
    if (!target) {
      const err = new Error('User not found');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const already = await this.follows.isFollowing(actorId, targetId);
    if (already) {
      const relationship = await this.follows.getRelationship(actorId, targetId);
      return { status: 'following', relationship };
    }

    const isPrivate = target.accountPrivacy === 'friends';

    if (isPrivate) {
      const { id, created } = await this.follows.createRequest(actorId, targetId);
      if (created) {
        await this.notifications.notifyFollowRequest({
          recipientId: targetId,
          actorId,
          requestId: id,
        });
      }
      const relationship = await this.follows.getRelationship(actorId, targetId);
      return { status: 'pending', requestId: id, relationship };
    }

    await this.follows.createFollow(actorId, targetId);
    await this.notifications.notifyStartedFollowing({
      recipientId: targetId,
      actorId,
    });
    const relationship = await this.follows.getRelationship(actorId, targetId);
    return { status: 'following', relationship };
  }

  async unfollow(actorId, targetId) {
    await this.follows.cancelRequest(actorId, targetId);
    await this.follows.deleteFollow(actorId, targetId);
    const relationship = await this.follows.getRelationship(actorId, targetId);
    return { status: 'none', relationship };
  }

  async acceptRequest(actorId, requestId) {
    const req = await this.follows.findRequestById(requestId);
    if (!req || req.to_user_id !== actorId || req.status !== 'pending') {
      const err = new Error('Follow request not found');
      err.status = 404;
      err.code = 'REQUEST_NOT_FOUND';
      throw err;
    }

    await this.follows.acceptRequest(requestId);
    await this.notifications.notifyFollowAccepted({
      recipientId: req.from_user_id,
      actorId,
      requestId,
    });

    const relationship = await this.follows.getRelationship(
      actorId,
      req.from_user_id,
    );
    return { status: 'accepted', relationship, fromUserId: req.from_user_id };
  }

  async rejectRequest(actorId, requestId) {
    const req = await this.follows.findRequestById(requestId);
    if (!req || req.to_user_id !== actorId || req.status !== 'pending') {
      const err = new Error('Follow request not found');
      err.status = 404;
      err.code = 'REQUEST_NOT_FOUND';
      throw err;
    }
    await this.follows.rejectRequest(requestId);
    return { status: 'rejected' };
  }

  /**
   * Remove someone who follows me (deleteFollow(follower → me)).
   */
  async removeFollower(ownerId, followerId) {
    if (!ownerId || !followerId || ownerId === followerId) {
      const err = new Error('Invalid follower');
      err.status = 400;
      err.code = 'INVALID_TARGET';
      throw err;
    }
    await this.follows.deleteFollow(followerId, ownerId);
    const relationship = await this.follows.getRelationship(ownerId, followerId);
    return { status: 'removed', relationship };
  }

  async _assertCanListConnections(viewerId, targetId) {
    if (!targetId) {
      const err = new Error('User not found');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
    if (viewerId === targetId) return;

    const target = await this.users.getProfile(targetId);
    if (!target) {
      const err = new Error('User not found');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    if (target.accountPrivacy === 'friends') {
      const following = await this.follows.isFollowing(viewerId, targetId);
      if (!following) {
        const err = new Error('Followers list is private');
        err.status = 403;
        err.code = 'PRIVATE_CONNECTIONS';
        throw err;
      }
    }
  }

  async listFollowers(viewerId, targetId, opts) {
    await this._assertCanListConnections(viewerId, targetId);
    const users = await this.follows.listFollowers(targetId, opts);
    return users.map((u) => ({
      userId: u.user_id,
      username: u.username || '',
      fullName: u.full_name || '',
      avatarUrl: u.avatar_url || '',
    }));
  }

  async listFollowing(viewerId, targetId, opts) {
    await this._assertCanListConnections(viewerId, targetId);
    const users = await this.follows.listFollowing(targetId, opts);
    return users.map((u) => ({
      userId: u.user_id,
      username: u.username || '',
      fullName: u.full_name || '',
      avatarUrl: u.avatar_url || '',
    }));
  }
}

module.exports = { FollowService };
