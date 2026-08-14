'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireFirebaseAuth, authService } = require('../middleware/auth');
const {
  UsernameService,
  normalizeUsername,
} = require('../services/UsernameService');
const { AccountDeletionService } = require('../services/AccountDeletionService');
const { BunnyStorageService } = require('../services/BunnyStorageService');
const { StickerGenerationService } = require('../services/StickerGenerationService');
const {
  StampRepository,
  normalizeLocale,
} = require('../services/StampRepository');
const { StoryRepository } = require('../services/StoryRepository');
const { FollowRepository } = require('../services/FollowRepository');
const { PulseRepository } = require('../services/PulseRepository');
const { BlockService } = require('../services/BlockService');
const { CheckInService } = require('../services/CheckInService');
const { logger } = require('../utils/logger');
const {
  publicProfileCache,
  publicProfileKey,
  invalidateUser,
  invalidateUsername,
  invalidateStoryFeeds,
} = require('../cache/appCache');

const router = express.Router();
const usernameService = new UsernameService();
const deletionService = new AccountDeletionService();
const bunny = new BunnyStorageService();
const stickerGeneration = new StickerGenerationService();
const stampRepository = new StampRepository();
const storyRepository = new StoryRepository();
const followRepository = new FollowRepository();
const pulseRepository = new PulseRepository();
const blockService = new BlockService();
const checkInService = new CheckInService();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      const err = new Error('Only image uploads are allowed');
      err.code = 'INVALID_FILE_TYPE';
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const stickerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      const err = new Error('Only image uploads are allowed');
      err.code = 'INVALID_FILE_TYPE';
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

function extensionForMime(mime) {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    case 'image/jpg':
    default:
      return 'jpg';
  }
}

/**
 * Resolve a username for a viewer with block + account-privacy gates.
 * Sends the error response and returns null on failure.
 */
async function resolveVisibleProfileOrRespond(req, res, usernameParam) {
  const normalized = normalizeUsername(usernameParam);
  if (!normalized) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_USERNAME', message: 'Invalid username' },
    });
    return null;
  }

  const profile = await authService.users.findProfileByUsername(normalized);
  if (!profile) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
    return null;
  }

  const viewerId = req.user.id;
  const isSelf = viewerId === profile.userId;
  let relationship = {
    following: false,
    followedBy: false,
    outgoingRequest: false,
    incomingRequest: false,
    outgoingRequestId: null,
    incomingRequestId: null,
  };

  if (!isSelf) {
    const [iBlockedThem, theyBlockedMe, restrictedByMe, rel] = await Promise.all([
      authService.users.isBlockedBy(viewerId, profile.userId),
      authService.users.isBlockedBy(profile.userId, viewerId),
      authService.users.isRestrictedBy(viewerId, profile.userId),
      followRepository.getRelationship(viewerId, profile.userId),
    ]);
    // They blocked me → invisible.
    if (theyBlockedMe) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return null;
    }

    relationship = rel;
    return {
      profile,
      viewerId,
      isSelf,
      relationship,
      viewerFollows: relationship.following,
      blockedByMe: iBlockedThem,
      restrictedByMe,
    };
  }

  return {
    profile,
    viewerId,
    isSelf,
    relationship,
    viewerFollows: true,
    blockedByMe: false,
    restrictedByMe: false,
  };
}

function parsePlanDayRange(req) {
  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  let from = fromRaw ? new Date(String(fromRaw)) : null;
  let to = toRaw ? new Date(String(toRaw)) : null;

  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    const now = new Date();
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }
  return { from, to };
}

router.get('/by-username/:username/plans', requireFirebaseAuth, async (req, res, next) => {
  try {
    const resolved = await resolveVisibleProfileOrRespond(
      req,
      res,
      req.params.username,
    );
    if (!resolved) return undefined;

    const { profile, viewerId, isSelf, viewerFollows, blockedByMe } = resolved;
    if (blockedByMe) {
      return res.json({ success: true, data: { plans: [] } });
    }
    const { from, to } = parsePlanDayRange(req);
    const plans = await authService.users.listTodayPlansForViewer(
      profile.userId,
      viewerId,
      { from, to, isSelf, viewerFollows },
    );

    return res.json({
      success: true,
      data: { plans: plans.map(mapPlanRow) },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/by-username/:username/pulses
 * Shared photos on profile (visible if the profile itself is visible).
 */
router.get('/by-username/:username/pulses', requireFirebaseAuth, async (req, res, next) => {
  try {
    const resolved = await resolveVisibleProfileOrRespond(
      req,
      res,
      req.params.username,
    );
    if (!resolved) return undefined;

    const { profile, viewerId, blockedByMe } = resolved;
    if (blockedByMe) {
      return res.json({ success: true, data: { pulses: [] } });
    }
    const limit = Number(req.query.limit) || 60;
    const offset = Number(req.query.offset) || 0;
    const items = await pulseRepository.listForUser(profile.userId, {
      limit,
      offset,
      viewerUserId: viewerId,
    });
    return res.json({ success: true, data: { pulses: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/by-username/:username/check-ins
 */
router.get('/by-username/:username/check-ins', requireFirebaseAuth, async (req, res, next) => {
  try {
    const resolved = await resolveVisibleProfileOrRespond(
      req,
      res,
      req.params.username,
    );
    if (!resolved) return undefined;

    const { profile, viewerId, isSelf, viewerFollows, blockedByMe } = resolved;
    if (blockedByMe) {
      return res.json({ success: true, data: { checkIns: [] } });
    }
    const items = await checkInService.listForUser(profile.userId, {
      viewerId,
      viewerFollows: isSelf || viewerFollows,
      limit: Number(req.query.limit) || 60,
      offset: Number(req.query.offset) || 0,
    });
    return res.json({ success: true, data: { checkIns: items } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/by-username/:username/stamps?locale=tr
 * Earned stamps — friends (or self) only.
 */
router.get('/by-username/:username/stamps', requireFirebaseAuth, async (req, res, next) => {
  try {
    const resolved = await resolveVisibleProfileOrRespond(
      req,
      res,
      req.params.username,
    );
    if (!resolved) return undefined;

    const { profile, isSelf, viewerFollows, blockedByMe } = resolved;
    if (blockedByMe || (!isSelf && !viewerFollows)) {
      return res.json({
        success: true,
        data: { locale: normalizeLocale(req.query.locale), stamps: [] },
      });
    }
    const locale = normalizeLocale(req.query.locale);
    const stamps = await stampRepository.listForUser(profile.userId, {
      locale,
    });
    return res.json({
      success: true,
      data: {
        locale,
        stamps: stamps.map((stamp) => stamp.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});
router.get('/by-username/:username', requireFirebaseAuth, async (req, res, next) => {
  try {
    const normalized = normalizeUsername(req.params.username);
    const cacheKey = publicProfileKey(req.user.id, normalized);
    const cached = publicProfileCache.get(cacheKey);
    if (cached !== undefined) {
      return res.json({ success: true, data: cached });
    }

    const resolved = await resolveVisibleProfileOrRespond(
      req,
      res,
      req.params.username,
    );
    if (!resolved) return undefined;

    const { profile, viewerId, isSelf, relationship, viewerFollows, blockedByMe, restrictedByMe } =
      resolved;
    const [links, storySummary] = await Promise.all([
      authService.users.listProfileLinks(profile.userId),
      blockedByMe
        ? Promise.resolve({ hasStory: false, isViewed: true })
        : storyRepository.getFeedSummaryForUser(profile.userId, viewerId, {
            viewerFollows: isSelf ? true : viewerFollows,
          }),
    ]);

    const data = {
      profile: {
        ...profile.toJSON(),
        isSelf,
        isFollowing: relationship.following,
        relationship,
        hasActiveStory: storySummary.hasStory,
        storyIsViewed: storySummary.isViewed,
        blockedByMe: Boolean(blockedByMe),
        restrictedByMe: Boolean(restrictedByMe),
      },
      links: blockedByMe ? [] : links.map((l) => l.toJSON()),
    };
    publicProfileCache.set(cacheKey, data);
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/username/availability?username=foo
 */
router.get('/username/availability', requireFirebaseAuth, async (req, res, next) => {
  try {
    const raw = req.query.username;
    if (raw === undefined || String(raw).trim() === '') {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USERNAME', message: 'username query is required' },
      });
    }

    const result = await usernameService.check(String(raw), req.user.id);
    logger.info('username_check', {
      userId: req.user.id,
      username: result.username,
      available: result.available,
      reason: result.reason,
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
});

router.patch('/me/profile', requireFirebaseAuth, async (req, res, next) => {
  try {
    const {
      fullName,
      username,
      birthDate,
      bio,
      locationText,
      accountPrivacy,
    } = req.body || {};

    let normalizedUsername;
    if (username !== undefined) {
      normalizedUsername = normalizeUsername(username);
      const check = await usernameService.check(normalizedUsername, req.user.id);
      if (!check.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USERNAME',
            message: 'Username must be 3–15 characters (a-z, 0-9, _)',
          },
        });
      }
      if (!check.available) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'USERNAME_TAKEN',
            message: 'Username already taken',
            suggestions: check.suggestions,
          },
        });
      }
    }

    if (fullName !== undefined) {
      const name = String(fullName).trim();
      if (name.length < 1 || name.length > 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FULL_NAME',
            message: 'Full name must be 1–50 characters',
          },
        });
      }
    }

    if (bio !== undefined) {
      const text = String(bio);
      if (text.length > 150) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BIO',
            message: 'Bio must be at most 150 characters',
          },
        });
      }
    }

    let normalizedPrivacy;
    if (accountPrivacy !== undefined) {
      normalizedPrivacy = String(accountPrivacy).trim().toLowerCase();
      if (normalizedPrivacy !== 'public' && normalizedPrivacy !== 'friends') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACCOUNT_PRIVACY',
            message: 'accountPrivacy must be one of: public, friends',
          },
        });
      }
    }

    const profile = await authService.users.updateProfile(req.user.id, {
      fullName: fullName !== undefined ? String(fullName).trim() : undefined,
      username: normalizedUsername,
      birthDate,
      bio: bio !== undefined ? String(bio).trim() : undefined,
      locationText,
      accountPrivacy: normalizedPrivacy,
    });

    logger.info('profile_updated', {
      userId: req.user.id,
      username: profile.username,
      fullName: profile.fullName,
      birthDate: profile.birthDate,
    });

    invalidateUser(req.user.id);
    invalidateUsername(profile.username);

    return res.json({ success: true, data: { profile: profile.toJSON() } });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const suggestions = await usernameService.suggest(
        req.body?.username || '',
        req.user.id,
        5,
      );
      return res.status(409).json({
        success: false,
        error: {
          code: 'USERNAME_TAKEN',
          message: 'Username already taken',
          suggestions,
        },
      });
    }
    return next(err);
  }
});

/**
 * POST /users/me/avatar
 * multipart field: avatar
 */
router.post(
  '/me/avatar',
  requireFirebaseAuth,
  avatarUpload.single('avatar'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'avatar file is required' },
        });
      }

      const ext = extensionForMime(req.file.mimetype);
      const storageKey = `avatars/${req.user.id}/${randomUUID()}.${ext}`;
      const current = await authService.users.getProfile(req.user.id);
      const uploaded = await bunny.uploadBuffer(
        req.file.buffer,
        storageKey,
        req.file.mimetype,
      );

      const profile = await authService.users.updateAvatar(req.user.id, {
        avatarUrl: uploaded.url,
        avatarStorageKey: uploaded.storageKey,
      });

      if (
        current?.avatarStorageKey &&
        current.avatarStorageKey !== uploaded.storageKey
      ) {
        await bunny.deleteObject(current.avatarStorageKey);
      }

      logger.info('avatar_updated', {
        userId: req.user.id,
        avatarUrl: profile.avatarUrl,
      });

      invalidateUser(req.user.id);
      invalidateUsername(profile.username);
      invalidateStoryFeeds();

      return res.json({
        success: true,
        data: {
          avatarUrl: profile.avatarUrl,
          profile: profile.toJSON(),
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * PUT /users/me/links
 * Body: { links: [{ title, url }] }
 */
router.put('/me/links', requireFirebaseAuth, async (req, res, next) => {
  try {
    const raw = req.body?.links;
    if (!Array.isArray(raw)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_LINKS', message: 'links must be an array' },
      });
    }
    if (raw.length > 10) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_LINKS', message: 'At most 10 links allowed' },
      });
    }

    const links = [];
    for (const item of raw) {
      const title = String(item?.title || '').trim();
      let url = String(item?.url || '').trim();
      if (!title || !url) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LINK',
            message: 'Each link needs title and url',
          },
        });
      }
      if (title.length > 80) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_LINK_TITLE', message: 'Title too long' },
        });
      }
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      links.push({ title, url });
    }

    const saved = await authService.users.replaceProfileLinks(req.user.id, links);
    logger.info('profile_links_updated', {
      userId: req.user.id,
      count: saved.length,
    });

    invalidateUser(req.user.id);

    return res.json({
      success: true,
      data: { links: saved.map((l) => l.toJSON()) },
    });
  } catch (err) {
    return next(err);
  }
});

function mapPlanRow(item) {
  return {
    id: item.id,
    placeName: item.place_name,
    subtitle: item.subtitle || '',
    category: item.category || 'other',
    scheduledAt: item.scheduled_at,
    note: item.note || '',
    showToFriends: Boolean(item.show_to_friends),
    showToNearby: Boolean(item.show_to_nearby),
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

/**
 * GET /users/me/plans?from=<ISO>&to=<ISO>
 * İstemcinin local gün aralığındaki planlar.
 */
router.get('/me/plans', requireFirebaseAuth, async (req, res, next) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    let from = fromRaw ? new Date(String(fromRaw)) : null;
    let to = toRaw ? new Date(String(toRaw)) : null;

    if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
      const now = new Date();
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    }

    const plans = await authService.users.listTodayPlans(req.user.id, {
      from,
      to,
    });
    return res.json({
      success: true,
      data: { plans: plans.map(mapPlanRow) },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/me/plans/friends?from=<ISO>&to=<ISO>
 * Takip edilen hesapların bugünkü planları — mekân bazında "arkadaşın katılıyor".
 */
router.get('/me/plans/friends', requireFirebaseAuth, async (req, res, next) => {
  try {
    const { from, to } = parsePlanDayRange(req);
    const places = await authService.users.listFriendJoiningByPlace(req.user.id, {
      from,
      to,
    });
    return res.json({
      success: true,
      data: { places },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /users/me/plans
 * Body: placeName, subtitle?, category?, scheduledAt, note?,
 *       showToFriends?, showToNearby?
 */
router.post('/me/plans', requireFirebaseAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const placeName = String(body.placeName || '').trim();
    if (!placeName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLACE_NAME', message: 'placeName is required' },
      });
    }

    const scheduledRaw = body.scheduledAt;
    const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SCHEDULED_AT',
          message: 'scheduledAt must be a valid ISO datetime',
        },
      });
    }

    const allowedCategories = new Set([
      'music',
      'cafe',
      'park',
      'culture',
      'restaurant',
      'gym',
      'other',
    ]);
    const categoryRaw = String(body.category || '').trim().toLowerCase();
    const category = allowedCategories.has(categoryRaw) ? categoryRaw : 'other';

    const subtitle = String(body.subtitle || '').trim().slice(0, 200);
    const note = String(body.note || '').trim();
    const showToFriends =
      body.showToFriends === undefined ? true : Boolean(body.showToFriends);
    const showToNearby =
      body.showToNearby === undefined ? false : Boolean(body.showToNearby);

    const created = await authService.users.createPlan(req.user.id, {
      placeName: placeName.slice(0, 200),
      subtitle: subtitle || null,
      category,
      scheduledAt,
      note: note || null,
      showToFriends,
      showToNearby,
    });

    logger.info('plan_created', {
      userId: req.user.id,
      planId: created?.id,
      showToFriends,
      showToNearby,
      hasNote: Boolean(note),
    });

    return res.status(201).json({
      success: true,
      data: { plan: mapPlanRow(created) },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/me/stickers
 */
router.get('/me/stickers', requireFirebaseAuth, async (req, res, next) => {
  try {
    const stickers = await authService.users.listUserStickers(req.user.id);
    return res.json({
      success: true,
      data: {
        stickers: stickers.map((item) => ({
          id: item.id,
          title: item.title,
          imageUrl: item.image_url,
          source: item.source,
          createdAt: item.created_at,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/me/stamps?locale=tr
 * Stamps earned by the signed-in user (e.g. Blue Tick after phone signup).
 */
router.get('/me/stamps', requireFirebaseAuth, async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const stamps = await stampRepository.listForUser(req.user.id, { locale });
    return res.json({
      success: true,
      data: {
        locale,
        stamps: stamps.map((stamp) => stamp.toJSON()),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/me/blocked
 */
router.get('/me/blocked', requireFirebaseAuth, async (req, res, next) => {
  try {
    const blockedUsers = await authService.users.listBlockedUsers(req.user.id);
    return res.json({
      success: true,
      data: {
        users: blockedUsers.map((item) => ({
          userId: item.user_id,
          username: item.username,
          avatarUrl: item.avatar_url,
          blockedAt: item.created_at,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /users/me/blocked/:blockedUserId
 * Block + unfollow both ways + cancel pending requests.
 */
router.post('/me/blocked/:blockedUserId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const blockedUserId = String(req.params.blockedUserId || '').trim();
    if (!blockedUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_BLOCKED_USER_ID', message: 'blockedUserId is required' },
      });
    }
    const reason =
      req.body && typeof req.body.reason === 'string' ? req.body.reason.trim() : null;
    const data = await blockService.block(req.user.id, blockedUserId, { reason });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /users/me/blocked/:blockedUserId
 */
router.delete('/me/blocked/:blockedUserId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const blockedUserId = String(req.params.blockedUserId || '').trim();
    if (!blockedUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_BLOCKED_USER_ID', message: 'blockedUserId is required' },
      });
    }
    const data = await blockService.unblock(req.user.id, blockedUserId);
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /users/me/restricted
 */
router.get('/me/restricted', requireFirebaseAuth, async (req, res, next) => {
  try {
    const users = await authService.users.listRestrictedUsers(req.user.id);
    return res.json({
      success: true,
      data: {
        users: users.map((item) => ({
          userId: item.user_id,
          username: item.username,
          avatarUrl: item.avatar_url,
          restrictedAt: item.created_at,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /users/me/restricted/:userId
 */
router.post('/me/restricted/:userId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'userId is required' },
      });
    }
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TARGET', message: 'Cannot restrict yourself' },
      });
    }
    const blocked = await authService.users.isBlockedEitherWay(req.user.id, userId);
    if (blocked) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }
    const profile = await authService.users.getProfile(userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }
    await authService.users.restrictUser(req.user.id, userId);
    return res.json({ success: true, data: { restricted: true } });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /users/me/restricted/:userId
 */
router.delete('/me/restricted/:userId', requireFirebaseAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_ID', message: 'userId is required' },
      });
    }
    const removed = await authService.users.unrestrictUser(req.user.id, userId);
    return res.json({ success: true, data: { removed } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /users/me/stickers/generate
 * multipart fields: image, style, title, description
 */
router.post(
  '/me/stickers/generate',
  requireFirebaseAuth,
  stickerUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'image file is required' },
        });
      }

      const style = String(req.body?.style || 'modern').trim().toLowerCase();
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const safeTitle = title.slice(0, 120);
      const safeDescription = description.slice(0, 500);

      const generated = await stickerGeneration.generateFromPhoto({
        imageBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        style,
        title: safeTitle,
        description: safeDescription,
      });

      const storageKey = `stickers/${req.user.id}/${randomUUID()}.png`;
      const uploaded = await bunny.uploadBuffer(
        generated.buffer,
        storageKey,
        generated.mimeType,
      );

      const sticker = await authService.users.createUserSticker(req.user.id, {
        title: safeTitle || 'Sticker',
        imageUrl: uploaded.url,
        source: 'openai',
      });

      logger.info('sticker_generated', {
        userId: req.user.id,
        style,
        title: safeTitle || 'Sticker',
        imageUrl: uploaded.url,
      });

      return res.status(201).json({
        success: true,
        data: {
          sticker: {
            id: sticker.id,
            title: sticker.title,
            imageUrl: sticker.image_url,
            source: sticker.source,
            createdAt: sticker.created_at,
          },
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.post('/me/onboarding/complete', requireFirebaseAuth, async (req, res, next) => {
  try {
    const onboarding = await authService.users.setOnboardingDone(req.user.id, true);
    return res.json({
      success: true,
      data: { onboarding: onboarding.toJSON() },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /users/me/deletion-request
 * Body: { reason?: string }
 */
router.post('/me/deletion-request', requireFirebaseAuth, async (req, res, next) => {
  try {
    const reason = req.body?.reason;
    const result = await deletionService.createRequest(req.user.id, reason);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        created: result.created,
        request: result.request.toJSON(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
