'use strict';

const { logger } = require('../utils/logger');
const { UserRepository } = require('./UserRepository');
const { StampRepository } = require('./StampRepository');

const PHONE_VERIFICATION_STAMP_SLUG = 'blue_tick';

class AuthService {
  constructor(
    userRepository = new UserRepository(),
    stampRepository = new StampRepository(),
  ) {
    this.users = userRepository;
    this.stamps = stampRepository;
  }

  /**
   * Map Firebase decoded token → primary_auth enum.
   */
  resolvePrimaryAuth(decoded) {
    const provider = decoded.firebase?.sign_in_provider || '';
    if (provider.includes('google')) return 'google';
    if (provider.includes('apple')) return 'apple';
    if (provider.includes('phone')) return 'phone';
    if (decoded.phone_number) return 'phone';
    return 'phone';
  }

  /**
   * Returning users with a claimed profile go straight to home.
   * Incomplete profiles continue onboarding.
   */
  resolveNextStep(profile) {
    const hasName = Boolean(profile.fullName && String(profile.fullName).trim());
    const hasUsername = Boolean(profile.username && String(profile.username).trim());
    if (hasName && hasUsername) return 'home';
    return 'create_profile';
  }

  async syncFromFirebase(decoded) {
    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const phoneE164 = decoded.phone_number || null;
    const primaryAuth = this.resolvePrimaryAuth(decoded);
    const emailVerifiedAt = decoded.email_verified ? new Date() : null;
    const phoneVerifiedAt = phoneE164 ? new Date() : null;

    let user = await this.users.findByFirebaseUid(firebaseUid);
    let created = false;

    if (!user) {
      user = await this.users.create({
        firebaseUid,
        phoneE164,
        email,
        primaryAuth,
        phoneVerifiedAt,
        emailVerifiedAt,
      });
      created = true;
      logger.info('user_created', {
        userId: user.id,
        firebaseUid,
        primaryAuth,
      });
    } else {
      await this.users.touchLogin(user.id);
      logger.info('user_login', { userId: user.id, firebaseUid });
    }

    const profile = await this.users.ensureProfile(user.id);
    let onboarding = await this.users.ensureOnboardingFlags(user.id);
    const settings = await this.users.ensureSettings(user.id);

    const provider = decoded.firebase?.sign_in_provider || '';
    if (provider.includes('google') || provider.includes('apple')) {
      const oauthProvider = provider.includes('google') ? 'google' : 'apple';
      await this.users.upsertOAuthIdentity({
        userId: user.id,
        provider: oauthProvider,
        subject: decoded.sub || firebaseUid,
        email,
        rawProfile: {
          name: decoded.name || null,
          picture: decoded.picture || null,
          sign_in_provider: provider,
        },
      });
    }

    if (primaryAuth === 'phone') {
      const award = await this.stamps.awardToUser(
        user.id,
        PHONE_VERIFICATION_STAMP_SLUG,
        { source: created ? 'phone_signup' : 'phone_verified' },
      );
      if (award.awarded) {
        logger.info('stamp_awarded', {
          userId: user.id,
          slug: PHONE_VERIFICATION_STAMP_SLUG,
          created,
        });
      }
    }

    const nextStep = this.resolveNextStep(profile);
    if (nextStep === 'home' && !onboarding.onboardingDone) {
      onboarding = await this.users.setOnboardingDone(user.id, true);
    }

    const links = await this.users.listProfileLinks(user.id);

    return {
      created,
      nextStep,
      user,
      profile,
      onboarding,
      settings,
      links,
    };
  }

  async getMe(userId) {
    const user = await this.users.findById(userId);
    if (!user) return null;
    const profile = await this.users.ensureProfile(userId);
    let onboarding = await this.users.ensureOnboardingFlags(userId);
    const settings = await this.users.ensureSettings(userId);
    const links = await this.users.listProfileLinks(userId);
    const nextStep = this.resolveNextStep(profile);
    if (nextStep === 'home' && !onboarding.onboardingDone) {
      onboarding = await this.users.setOnboardingDone(userId, true);
    }
    return { nextStep, user, profile, onboarding, settings, links };
  }
}

module.exports = { AuthService };
