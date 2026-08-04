'use strict';

const { FollowRepository } = require('./FollowRepository');
const { UserRepository } = require('./UserRepository');

/**
 * Block + sever social graph both ways.
 * Content hide is handled by existing `blocks` filters (stories/map/chat/follow).
 */
class BlockService {
  constructor({
    users = new UserRepository(),
    follows = new FollowRepository(),
  } = {}) {
    this.users = users;
    this.follows = follows;
  }

  _httpError(status, code, message) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
  }

  async block(blockerId, blockedId, { reason = null } = {}) {
    if (!blockerId || !blockedId || blockerId === blockedId) {
      throw this._httpError(400, 'INVALID_TARGET', 'Invalid block target');
    }

    const target = await this.users.getProfile(blockedId);
    if (!target) {
      throw this._httpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    await this.users.blockUser(blockerId, blockedId, { reason });
    // Restriction is weaker than block — drop it if present.
    await this.users.unrestrictUser(blockerId, blockedId);

    await Promise.all([
      this.follows.deleteFollow(blockerId, blockedId),
      this.follows.deleteFollow(blockedId, blockerId),
      this.follows.cancelRequest(blockerId, blockedId),
      this.follows.cancelRequest(blockedId, blockerId),
    ]);

    return { blocked: true };
  }

  async unblock(blockerId, blockedId) {
    if (!blockerId || !blockedId || blockerId === blockedId) {
      throw this._httpError(400, 'INVALID_TARGET', 'Invalid unblock target');
    }
    const removed = await this.users.unblockUser(blockerId, blockedId);
    return { removed };
  }
}

module.exports = { BlockService };
